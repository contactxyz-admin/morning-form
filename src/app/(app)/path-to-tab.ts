import type { NavTab } from '@/types';

// Order matters: longer prefixes must come before shorter ones
// (`/record/source` before `/record`) so startsWith returns the specific match.
// `/insights` is intentionally unmapped — the route still exists but has no
// nav tab anymore, so it falls through to the 'home' default.
const PATH_TO_TAB: ReadonlyArray<readonly [string, NavTab]> = [
  ['/record/source', 'record'],
  ['/record', 'record'],
  ['/topics', 'record'],
  ['/graph', 'graph'],
  ['/check-in', 'home'],
  ['/intake', 'home'],
  ['/home', 'home'],
  ['/protocol', 'protocol'],
  ['/guide', 'you'],
  ['/settings', 'you'],
  ['/you', 'you'],
];

export function resolveActiveTab(pathname: string): NavTab {
  const match = PATH_TO_TAB.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'home';
}
