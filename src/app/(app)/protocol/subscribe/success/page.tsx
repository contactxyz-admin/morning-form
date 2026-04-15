'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

export default function SubscribeSuccessPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <Icon name="check" size="lg" className="text-positive mx-auto mb-6" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-heading text-text-primary"
        >
          You&apos;re subscribed.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-3 text-body text-text-secondary max-w-sm"
        >
          Your protocol supplements are being prepared. First delivery is on its way.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 space-y-3"
        >
          <Link
            href="/protocol"
            className="inline-flex items-center justify-center h-12 px-6 bg-accent text-white text-body font-medium rounded-button transition-all duration-250 hover:bg-accent-muted active:scale-[0.98] w-full"
          >
            View your protocol
          </Link>
          <Link
            href="/settings/subscription"
            className="block text-center text-caption text-accent hover:underline"
          >
            Manage subscription →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
