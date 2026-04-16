'use client';

import { TabNav } from '@/components/intake/tab-nav';
import { EssentialsTab } from '@/components/intake/essentials-tab';
import { FinishBar } from '@/components/intake/finish-bar';

export default function IntakeEssentialsPage() {
  return (
    <div className="px-6 sm:px-8 pt-10 sm:pt-14 pb-40 max-w-2xl mx-auto">
      <TabNav active="essentials" />
      <EssentialsTab />
      <FinishBar />
    </div>
  );
}
