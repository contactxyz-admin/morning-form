'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function BeginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center max-w-sm w-full"
      >
        <h1 className="font-serif text-display text-text-primary">
          Your protocol is ready.
        </h1>

        <div className="mt-12 space-y-3">
          <Button fullWidth onClick={() => router.push('/setup')}>
            Start Your Protocol
          </Button>
          <Button variant="secondary" fullWidth disabled>
            View alternative protocol
          </Button>
        </div>

        <p className="mt-6 text-caption text-text-tertiary">
          You can adjust timing and preferences after you begin.
        </p>

        <Link href="/guide" className="mt-4 inline-block text-caption text-accent hover:underline">
          Talk to our guide →
        </Link>
      </motion.div>
    </div>
  );
}
