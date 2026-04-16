'use client';

import { TabNav } from '@/components/intake/tab-nav';
import { HistoryTab } from '@/components/intake/history-tab';
import { FinishBar } from '@/components/intake/finish-bar';

export default function IntakeHistoryPage() {
  return (
    <div className="px-6 sm:px-8 pt-10 sm:pt-14 pb-40 max-w-2xl mx-auto">
      <TabNav active="history" />
      <HistoryTab />
      <FinishBar />
    </div>
  );
}
