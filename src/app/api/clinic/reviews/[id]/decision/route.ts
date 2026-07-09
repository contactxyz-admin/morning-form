/**
 * POST /api/clinic/reviews/[id]/decision — the clinician's sign-off.
 *
 * approve: marks the review approved (no member notification — silence is
 * the happy path). escalate: requires a reason, marks escalated with the
 * marker subset, then emails the member (descriptive, no clinical content)
 * and ops (reference-only). Emails fire AFTER the CAS and are individually
 * non-fatal — the decision row IS the sign-off record and is never rolled
 * back over a mail hiccup; the response reports what actually sent so the
 * clinician can follow up manually.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireClinician } from '@/lib/review/guard';
import { decideReview, UnknownMarkerKeysError } from '@/lib/review/queue';
import {
  sendMemberEscalationEmail,
  sendOpsEscalationNotice,
} from '@/lib/review/escalation-email';

export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('escalate'),
    reason: z.string().trim().min(10).max(2000),
    markerKeys: z.array(z.string().min(1).max(120)).min(1).max(100).optional(),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<Response> {
  const guard = await requireClinician();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let result;
  try {
    result = await decideReview(prisma, {
      reviewId: params.id,
      clinicianEmail: guard.clinician.email,
      ...(body.action === 'approve'
        ? { action: 'approve' as const }
        : { action: 'escalate' as const, reason: body.reason, markerKeys: body.markerKeys }),
    });
  } catch (err) {
    if (err instanceof UnknownMarkerKeysError) {
      return NextResponse.json(
        { error: `markerKeys not in this panel: ${err.keys.join(', ')}` },
        { status: 400 },
      );
    }
    throw err;
  }

  if (!result.decided) {
    if (result.currentStatus === null) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Review was already decided.', status: result.currentStatus },
      { status: 409 },
    );
  }

  let memberEmailSent = false;
  let opsEmailSent = false;
  if (body.action === 'escalate') {
    const member = await prisma.user.findUnique({
      where: { id: result.review.userId },
      select: { email: true, name: true },
    });
    if (member) {
      try {
        await sendMemberEscalationEmail({ to: member.email, name: member.name });
        memberEmailSent = true;
      } catch (emailErr) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error(`[clinic] member escalation email failed (decision stands): ${msg}`);
      }
    }
    try {
      await sendOpsEscalationNotice({ reviewId: result.review.id });
      opsEmailSent = true;
    } catch (opsErr) {
      const msg = opsErr instanceof Error ? opsErr.message : String(opsErr);
      console.error(`[clinic] ops escalation notice failed (decision stands): ${msg}`);
    }
  }

  return NextResponse.json({
    status: result.review.status,
    escalatedMarkerKeys: result.escalatedMarkerKeys,
    ...(body.action === 'escalate' ? { memberEmailSent, opsEmailSent } : {}),
  });
}
