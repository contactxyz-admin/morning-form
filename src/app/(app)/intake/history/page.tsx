'use client';

import { TabNav } from '@/components/intake/tab-nav';
import { HistoryTab } from '@/components/intake/history-tab';
import { FinishBar } from '@/components/intake/finish-bar';

export default function IntakeHistoryPage() {
  return (
    <div className="px-5 pt-6 pb-40">
      <TabNav active="history" />
      <HistoryTab />
      <FinishBar />
    </div>
  );
}
