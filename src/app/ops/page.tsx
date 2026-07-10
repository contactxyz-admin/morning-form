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
 * Tab layout: Briefing (default, live intelligence computed from tasks +
 * plan), Workstream (live editable tracker), then the read-only reference
 * tabs ported from the pilot-ops gist.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { CompanyOpsTask } from '@prisma/client';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isCompanyOpsEnabled, isStaff, members } from '@/lib/ops/config';
import { listOpsTasks } from '@/lib/ops/queries';
import { OpsBoardClient, type OpsMemberDto, type OpsTaskDto } from './board-client';
import { BriefingTab } from './briefing-tab';
import { REFERENCE_TABS, type ReferenceTabKey } from './reference-tabs';
import styles from './ops.module.css';

export const dynamic = 'force-dynamic';

const SAVEBAR_COPY = {
  brief: 'Live briefing — computed from the shared tracker and the pilot plan on every load. Nothing here is edited directly.',
  work: 'Shared board — every edit here is saved to Postgres and visible to the other founders on refresh.',
  reference:
    'Reference tabs from the original pilot-ops plan — filters and what-if edits here are local to you and reset on reload. Live edits happen on the Workstream tab.',
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
  const activeTab: 'brief' | 'work' | ReferenceTabKey = referenceTab ?? (searchParams.tab === 'work' ? 'work' : 'brief');

  const memberDtos: OpsMemberDto[] =
    // Strip slackId — it's server-side notify routing, not client UI state.
    // Lowercase emails so they match stored ownerEmail values, which every
    // write path normalizes to lowercase (see OpsOwnerEmailSchema) — a
    // mixed-case COMPANY_OPS_MEMBERS entry must not break owner selects,
    // the owner filter, or briefing name lookups.
    members().map(({ email, name }) => ({ email: email.toLowerCase(), name }));
  // One fetch serves both live tabs; reference tabs skip the query entirely.
  const tasks = activeTab === 'brief' || activeTab === 'work' ? await listOpsTasks(prisma, { board: 'pilot' }) : null;

  return (
    <div className={styles.opsRoot}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, next/image adds no value here */}
        <img className={styles.logo} alt="Morning Form" src="/brand/morningform-horizontal-lockup-white.svg" />
        <span className={styles.headerTitle}>Pilot Ops</span>
        <span className={styles.headerSub}>Shared Company Ops Board · signed in as {user.email}</span>
      </header>
      <nav className={styles.nav}>
        <Link href="/ops" className={`${styles.navLink} ${activeTab === 'brief' ? styles.navLinkOn : ''}`}>
          Briefing
        </Link>
        <Link href="/ops?tab=work" className={`${styles.navLink} ${activeTab === 'work' ? styles.navLinkOn : ''}`}>
          Workstream
        </Link>
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
      <main className={styles.main}>
        {activeTab === 'brief' && (
          <BriefingTab tasks={(tasks ?? []).map(serializeTask)} members={memberDtos} now={new Date()} />
        )}
        {activeTab === 'work' && <WorkstreamTab tasks={tasks ?? []} members={memberDtos} />}
        {referenceTab && <ReferenceTab tabKey={referenceTab} />}
      </main>
      <div className={styles.savebar}>
        {activeTab === 'brief' ? SAVEBAR_COPY.brief : activeTab === 'work' ? SAVEBAR_COPY.work : SAVEBAR_COPY.reference}
      </div>
    </div>
  );
}

function ReferenceTab({ tabKey }: { tabKey: ReferenceTabKey }) {
  const { Component } = REFERENCE_TABS.find((t) => t.key === tabKey)!;
  return <Component />;
}

function WorkstreamTab({ tasks, members: memberDtos }: { tasks: CompanyOpsTask[]; members: OpsMemberDto[] }) {
  return (
    <>
      <h2 className={styles.h2}>Workstream Tracker</h2>
      <p className={styles.sub}>
        Owner + status on every line — this is the shared, live board. Changing Owner notifies the assignee by email
        (and Slack, if configured).
      </p>
      <OpsBoardClient initialTasks={tasks.map(serializeTask)} members={memberDtos} />
    </>
  );
}

function serializeTask(task: CompanyOpsTask): OpsTaskDto {
  return {
    id: task.id,
    board: task.board,
    title: task.title,
    detail: task.detail,
    phase: task.phase,
    ownerEmail: task.ownerEmail,
    status: task.status as OpsTaskDto['status'],
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    orderIndex: task.orderIndex,
  };
}
