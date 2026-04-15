'use client';

import { TabNav } from '@/components/intake/tab-nav';
import { UploadTab } from '@/components/intake/upload-tab';
import { FinishBar } from '@/components/intake/finish-bar';

export default function IntakeUploadPage() {
  return (
    <div className="px-5 pt-6 pb-40">
      <TabNav active="upload" />
      <UploadTab />
      <FinishBar />
    </div>
  );
}
