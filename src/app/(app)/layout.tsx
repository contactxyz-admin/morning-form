import { env } from '@/lib/env';
import { AppNav } from './app-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <main className="pb-24">{children}</main>
      <AppNav showDecisions={env.DECISIONS_ENABLED === 'true'} />
    </div>
  );
}
