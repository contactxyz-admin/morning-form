import type { RecordIndex } from '@/lib/record/types';

export type RecordAnchorStatus = 'loading' | 'unauth' | 'error' | 'empty' | 'ready';

export interface TopicSummary {
  name: string;
  when: string | null;
}

export function formatRelative(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function newestTopic(data: RecordIndex, now: number = Date.now()): TopicSummary | null {
  const candidates = data.topics.filter((t) => t.updatedAt);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime(),
  );
  const top = sorted[0];
  return { name: top.displayName, when: formatRelative(top.updatedAt, now) };
}

export function deriveStatus(res: {
  ok: boolean;
  status: number;
  data: RecordIndex | null;
}): RecordAnchorStatus {
  if (res.status === 401) return 'unauth';
  if (!res.ok || !res.data) return 'error';
  const { nodeCount, sourceCount } = res.data.graphSummary;
  if (nodeCount === 0 && sourceCount === 0) return 'empty';
  return 'ready';
}
