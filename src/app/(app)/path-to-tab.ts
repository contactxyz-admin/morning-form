import type { NavTab } from '@/types';

// Order matters: longer prefixes must come before shorter ones
// (`/record/source` before `/record`) so startsWith returns the specific match.
// `/insights` is intentionally unmapped — the route still exists but has no
// nav tab anymore, so it falls through to the 'home' default. `/graph` and
// `/protocol` are 308 / RSC redirects (to `/record` and `/reveal/priorities`
// respectively); the layout never resolves a tab against those paths in the
// wild, so they have no mapping either.
const PATH_TO_TAB: ReadonlyArray<readonly [string, NavTab]> = [
  ['/record/source', 'record'],
  ['/record', 'record'],
  ['/topics', 'record'],
  ['/check-in', 'home'],
  ['/intake', 'home'],
  ['/ask', 'ask'],
  ['/decisions', 'decisions'],
  ['/home', 'home'],
  ['/guide', 'you'],
  ['/settings', 'you'],
  ['/you', 'you'],
];

export function resolveActiveTab(pathname: string): NavTab {
  const match = PATH_TO_TAB.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'home';
}
