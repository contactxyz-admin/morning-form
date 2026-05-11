/**
 * Interstitial — post-assessment bridge rendered when the
 * PRIORITY_MARKERS_ENABLED flag is off.
 *
 * Until UK GP + US PCP review of the content files at
 * content/priority-markers/*.ts completes (Phase 3 deploy gate of
 * docs/plans/2026-05-10-001-feat-priority-markers-pivot-plan.md), the
 * rich /reveal/priorities surface stays gated. Assessment-completers
 * land here instead — an honest "your record is being built; start by
 * uploading a recent panel" framing that keeps the funnel moving toward
 * /intake without rendering content the clinical reviewers haven't seen
 * yet.
 *
 * Server component — no client-side hooks. The route's auth/state
 * routing (not-onboarded → /assessment, unauthenticated → /sign-in)
 * is handled by the existing useAssessmentData hook on the rich
 * surface; the interstitial is intentionally lighter and assumes the
 * user has reached it via a normal flow.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function PrioritiesInterstitial() {
  return (
    <div className="min-h-screen bg-bg px-5 sm:px-8 pt-16 pb-32 flex items-center justify-center">
      <main className="max-w-xl mx-auto text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-6">
          Your record
        </p>
        <h1 className="font-display font-light text-display sm:text-display-xl text-text-primary -tracking-[0.04em] leading-[1.05]">
          Your record is <span className="italic font-light">ready</span>.
        </h1>
        <p className="mt-10 text-body-lg text-text-secondary leading-relaxed">
          Upload a recent blood panel and Morning Form will translate the
          values into plain English — what each number means for you, written
          against the pattern your assessment surfaced.
        </p>
        <div className="mt-14">
          <Link href="/intake">
            <Button size="lg">Upload your last blood panel</Button>
          </Link>
        </div>
        <p className="mt-8 text-caption text-text-tertiary">
          No panel yet? Order one through Medichecks, Thriva, Quest, or
          LabCorp — we&rsquo;ll handle whichever PDF format they send back.
        </p>
      </main>
    </div>
  );
}
