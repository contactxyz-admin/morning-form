/**
 * /ops — staff-only Company Ops Board (build brief 2026-07-04).
 *
 * Gating order: flag off -> notFound(); no session -> redirect('/sign-in');
 * logged in but not on the staff allowlist -> render a plain restricted
 * message with zero task data fetched. Next.js here is 14.2.35, which has
 * no forbidden()/unauthorized() primitive (Next 15+ only) — the REST routes
 * and the ops MCP still return literal 401/403, this only affects the page
 * shell's own status code, never data exposure.
 */
import { notFound, redirect } from 'next/navigation';
import type { CompanyOpsTask } from '@prisma/client';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isCompanyOpsEnabled, isStaff, members } from '@/lib/ops/config';
import { listOpsTasks } from '@/lib/ops/queries';
import { OpsBoardClient, type OpsTaskDto } from './board-client';
import { REFERENCE_TABS, type ReferenceTabKey } from './reference-tabs';
import { LiveKpisTab } from './live-kpis-tab';
import styles from './ops.module.css';

export const dynamic = 'force-dynamic';

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

  // 'live' is the one non-reference tab key: server-fetched aggregates, not
  // static plan content. Distinct from the reference 'kpis' tab (targets).
  const liveKpis = searchParams.tab === 'live';
  const activeTab = liveKpis
    ? undefined
    : (REFERENCE_TABS.find((t) => t.key === searchParams.tab)?.key as ReferenceTabKey | undefined);

  return (
    <div className={styles.opsRoot}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, next/image adds no value here */}
        <img className={styles.logo} alt="Morning Form" src="/brand/morningform-horizontal-lockup-white.svg" />
        <span className={styles.headerTitle}>Pilot Ops</span>
        <span className={styles.headerSub}>Shared Company Ops Board · signed in as {user.email}</span>
      </header>
      <nav className={styles.nav}>
        <a href="?" className={`${styles.navLink} ${!activeTab && !liveKpis ? styles.navLinkOn : ''}`}>
          Workstream
        </a>
        <a href="?tab=live" className={`${styles.navLink} ${liveKpis ? styles.navLinkOn : ''}`}>
          Live KPIs
        </a>
        <span className={styles.navDivider} aria-hidden="true" />
        {REFERENCE_TABS.map(({ key, label }) => (
          <a
            key={key}
            href={`?tab=${key}`}
            className={`${styles.navLink} ${activeTab === key ? styles.navLinkOn : ''}`}
          >
            {label}
          </a>
        ))}
      </nav>
      <main className={styles.main}>
        {liveKpis ? await LiveKpisTab() : activeTab ? <ReferenceTab tabKey={activeTab} /> : await WorkstreamTab()}
      </main>
      <div className={styles.savebar}>
        {liveKpis
          ? 'Live aggregates from the product database — anonymous counts only, never member-level rows.'
          : activeTab
            ? 'Reference material ported from the original pilot-ops plan — read-only. Live edits happen on the Workstream tab.'
            : 'Shared board — every edit here is saved to Postgres and visible to the other founders on refresh.'}
      </div>
    </div>
  );
}

function ReferenceTab({ tabKey }: { tabKey: ReferenceTabKey }) {
  const { Component } = REFERENCE_TABS.find((t) => t.key === tabKey)!;
  return <Component />;
}

async function WorkstreamTab() {
  const tasks = await listOpsTasks(prisma, { board: 'pilot' });
  return (
    <>
      <h2 className={styles.h2}>Workstream Tracker</h2>
      <p className={styles.sub}>
        Owner + status on every line — this is the shared, live board. Changing Owner notifies the assignee by email
        (and Slack, if configured).
      </p>
      <OpsBoardClient
        initialTasks={tasks.map(serializeTask)}
        // Strip slackId — it's server-side notify routing, not client UI state.
        members={members().map(({ email, name }) => ({ email, name }))}
      />
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
