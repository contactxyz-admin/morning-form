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
import styles from './ops.module.css';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
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

  const tasks = await listOpsTasks(prisma, { board: 'pilot' });

  return (
    <div className={styles.opsRoot}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, next/image adds no value here */}
        <img className={styles.logo} alt="MorningForm" src="/brand/ops-logo.png" />
        <span className={styles.headerTitle}>MorningForm — Pilot Ops</span>
        <span className={styles.headerSub}>Shared Company Ops Board · signed in as {user.email}</span>
      </header>
      <nav className={styles.nav}>
        <button className={`${styles.navBtn} ${styles.navBtnOn}`} type="button">
          Workstream
        </button>
      </nav>
      <main className={styles.main}>
        <h2 className={styles.h2}>Workstream Tracker</h2>
        <p className={styles.sub}>
          Owner + status on every line — this is the shared, live board. Changing Owner notifies the assignee by
          email (and Slack, if configured).
        </p>
        <OpsBoardClient
          initialTasks={tasks.map(serializeTask)}
          // Strip slackId — it's server-side notify routing, not client UI state.
          members={members().map(({ email, name }) => ({ email, name }))}
        />
      </main>
      <div className={styles.savebar}>
        Shared board — every edit here is saved to Postgres and visible to the other founders on refresh.
      </div>
    </div>
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
