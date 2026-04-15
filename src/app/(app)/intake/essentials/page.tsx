'use client';

import { TabNav } from '@/components/intake/tab-nav';
import { EssentialsTab } from '@/components/intake/essentials-tab';
import { FinishBar } from '@/components/intake/finish-bar';

export default function IntakeEssentialsPage() {
  return (
    <div className="px-5 pt-6 pb-40">
      <TabNav active="essentials" />
      <EssentialsTab />
      <FinishBar />
    </div>
  );
}
