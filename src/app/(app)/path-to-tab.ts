import type { NavTab } from '@/types';

// Order matters: longer prefixes must come before shorter ones
// (`/record/source` before `/record`) so startsWith returns the specific match.
const PATH_TO_TAB: ReadonlyArray<readonly [string, NavTab]> = [
  ['/record/source', 'record'],
  ['/record', 'record'],
  ['/topics', 'record'],
  ['/graph', 'record'],
  ['/check-in', 'home'],
  ['/intake', 'home'],
  ['/home', 'home'],
  ['/protocol', 'protocol'],
  ['/insights', 'insights'],
  ['/guide', 'you'],
  ['/settings', 'you'],
  ['/you', 'you'],
];

export function resolveActiveTab(pathname: string): NavTab {
  const match = PATH_TO_TAB.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'home';
}
