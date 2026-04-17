import { cn } from '@/lib/utils';

type IconName =
  | 'home' | 'protocol' | 'record' | 'graph' | 'insights' | 'profile'
  | 'guide' | 'close' | 'back' | 'arrow-right' | 'check'
  | 'clock' | 'alert' | 'send' | 'chevron-down';

interface IconProps {
  name: IconName;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 16, md: 20, lg: 24 };

const paths: Record<IconName, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  protocol: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  record: 'M7 4h10a2 2 0 012 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 012-2zm2 5h6m-6 4h6m-6 4h4',
  graph: 'M5 6a2 2 0 11-4 0 2 2 0 014 0zm0 0h8m6 0a2 2 0 11-4 0 2 2 0 014 0zm-6 6a2 2 0 11-4 0 2 2 0 014 0zm0 0h8m-6 6a2 2 0 11-4 0 2 2 0 014 0zm0 0h8M5 8v8m14-8v8m-7-6v4',
  insights: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  guide: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  close: 'M6 18L18 6M6 6l12 12',
  back: 'M15 19l-7-7 7-7',
  'arrow-right': 'M9 5l7 7-7 7',
  check: 'M5 13l4 4L19 7',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z',
  send: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  'chevron-down': 'M19 9l-7 7-7-7',
};

function Icon({ name, size = 'md', className }: IconProps) {
  const s = sizeMap[size];
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export { Icon, type IconName, type IconProps };
