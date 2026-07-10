/**
 * /ops — staff-only Company Ops Board (build brief 2026-07-04).
 *
 * Gating order: flag off -> notFound(); no session -> redirect('/sign-in');
 * logged in but not on the staff allowlist -> render a plain restricted
 * message with zero task data fetched. Next.js here is 14.2.35, which has
 * no forbidden()/unauthorized() primitive (Next 15+ only) — the REST routes
 * and the ops MCP still return literal 401/403, this only affects the page
 * shell's own status code, never data exposure.
 *
 * Tab layout: live tabs first (Briefing — the default, computed from tasks +
 * plan; Workstream; Decisions; Contacts — all Postgres-backed), then the
 * read-only reference tabs ported from the pilot-ops gist.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isCompanyOpsEnabled, isStaff, members } from '@/lib/ops/config';
import { getOpsFocus, listOpsContacts, listOpsDecisions, listOpsTasks } from '@/lib/ops/queries';
import { serializeOpsContact, serializeOpsDecision, serializeOpsTask } from '@/lib/ops/serialize';
import { OpsBoardClient, type OpsMemberDto } from './board-client';
import { BriefingTab } from './briefing-tab';
import { ContactsClient } from './contacts-client';
import { DecisionsClient } from './decisions-client';
import type { FocusDto } from './focus-card';
import { currentWeekStartUtc, parseFocusItems } from './intelligence';
import { REFERENCE_TABS, type ReferenceTabKey } from './reference-tabs';
import { LiveKpisTab } from './live-kpis-tab';
import styles from './ops.module.css';

export const dynamic = 'force-dynamic';

const LIVE_TABS = [
  { key: 'brief', label: 'Briefing' },
  { key: 'work', label: 'Workstream' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'live', label: 'Live KPIs' },
] as const;
type LiveTabKey = (typeof LIVE_TABS)[number]['key'];

const SAVEBAR_COPY = {
  brief: 'Live briefing — computed from the shared tracker and the pilot plan on every load. This Week’s 3 is the one editable card.',
  live: 'Shared board — every edit here is saved to Postgres and visible to the other founders on refresh.',
  kpis: 'Live aggregates from the product database — anonymous counts only, never member-level rows.',
  reference:
    'Reference tabs from the original pilot-ops plan — filters and what-if edits here are local to you and reset on reload. Live edits happen on the live tabs.',
} as const;

export default async function OpsPage({ searchParams }: { searchParams: { tab?: string } }) {
  if (!isCompanyOpsEnabled()) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  if (!isStaff(user.email)) {
    return (
      <div className={styles.opsRoot}>
        <div className={styles.restricted}>This page is restricted to MorningForm staff.</div>
      </div>
    );
  }

  const referenceTab = REFERENCE_TABS.find((t) => t.key === searchParams.tab)?.key as ReferenceTabKey | undefined;
  const liveTab = LIVE_TABS.find((t) => t.key === searchParams.tab)?.key as LiveTabKey | undefined;
  const activeTab: LiveTabKey | ReferenceTabKey = referenceTab ?? liveTab ?? 'brief';

  const memberDtos: OpsMemberDto[] =
    // Strip slackId — it's server-side notify routing, not client UI state.
    // Lowercase emails so they match stored ownerEmail values, which every
    // write path normalizes to lowercase (see OpsOwnerEmailSchema) — a
    // mixed-case COMPANY_OPS_MEMBERS entry must not break owner selects,
    // the owner filter, or briefing name lookups.
    members().map(({ email, name }) => ({ email: email.toLowerCase(), name }));

  return (
    <div className={styles.opsRoot}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, next/image adds no value here */}
        <img className={styles.logo} alt="Morning Form" src="/brand/morningform-horizontal-lockup-white.svg" />
        <span className={styles.headerTitle}>Pilot Ops</span>
        <span className={styles.headerSub}>Shared Company Ops Board · signed in as {user.email}</span>
      </header>
      <nav className={styles.nav}>
        {LIVE_TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={key === 'brief' ? '/ops' : `/ops?tab=${key}`}
            className={`${styles.navLink} ${activeTab === key ? styles.navLinkOn : ''}`}
          >
            {label}
          </Link>
        ))}
        <span className={styles.navDivider} aria-hidden="true" />
        {REFERENCE_TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/ops?tab=${key}`}
            className={`${styles.navLink} ${activeTab === key ? styles.navLinkOn : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <main className={styles.main}>{await renderTab(activeTab, memberDtos)}</main>
      <div className={styles.savebar}>
        {/* Derive from the classification above — a hand-maintained key list
            would silently show the wrong copy for the next live tab added. */}
        {referenceTab
          ? SAVEBAR_COPY.reference
          : activeTab === 'brief'
            ? SAVEBAR_COPY.brief
            : activeTab === 'live'
              ? SAVEBAR_COPY.kpis
              : SAVEBAR_COPY.live}
      </div>
    </div>
  );
}

async function renderTab(activeTab: LiveTabKey | ReferenceTabKey, memberDtos: OpsMemberDto[]) {
  switch (activeTab) {
    case 'brief': {
      const now = new Date();
      const [tasks, focusRow] = await Promise.all([
        listOpsTasks(prisma, { board: 'pilot' }),
        getOpsFocus(prisma, new Date(currentWeekStartUtc(now))),
      ]);
      const focus: FocusDto | null = focusRow
        ? { items: parseFocusItems(focusRow.items), updatedBy: focusRow.updatedBy, updatedAt: focusRow.updatedAt.toISOString() }
        : null;
      return <BriefingTab tasks={tasks.map(serializeOpsTask)} members={memberDtos} now={now} focus={focus} />;
    }
    case 'work': {
      const tasks = await listOpsTasks(prisma, { board: 'pilot' });
      return (
        <>
          <h2 className={styles.h2}>Workstream Tracker</h2>
          <p className={styles.sub}>
            Owner + status on every line — this is the shared, live board. Changing Owner notifies the assignee by
            email (and Slack, if configured).
          </p>
          <OpsBoardClient initialTasks={tasks.map(serializeOpsTask)} members={memberDtos} />
        </>
      );
    }
    case 'decisions': {
      const decisions = await listOpsDecisions(prisma);
      return <DecisionsClient initialDecisions={decisions.map(serializeOpsDecision)} />;
    }
    case 'contacts': {
      const contacts = await listOpsContacts(prisma);
      return <ContactsClient initialContacts={contacts.map(serializeOpsContact)} />;
    }
    case 'live':
      return <LiveKpisTab />;
    default: {
      const { Component } = REFERENCE_TABS.find((t) => t.key === activeTab)!;
      return <Component />;
    }
  }
}
