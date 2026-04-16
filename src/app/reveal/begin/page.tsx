'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function BeginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-5 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-md w-full"
      >
        <p className="text-label uppercase text-text-tertiary mb-5">Ready</p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.05]">
          Your protocol is <span className="italic font-light">ready</span>.
        </h1>

        <div className="mt-14 space-y-3">
          <Button fullWidth size="lg" onClick={() => router.push('/setup')}>
            Start your protocol
          </Button>
          <Button variant="secondary" fullWidth size="lg" disabled>
            View alternative protocol
          </Button>
        </div>

        <p className="mt-8 text-caption text-text-tertiary">
          You can adjust timing and preferences after you begin.
        </p>

        <Link
          href="/guide"
          className="mt-4 inline-block text-caption text-accent font-medium hover:underline underline-offset-4"
        >
          Talk to our guide →
        </Link>
      </motion.div>
    </div>
  );
}
