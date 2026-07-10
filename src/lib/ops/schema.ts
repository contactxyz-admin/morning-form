/**
 * Shared Zod shapes for CompanyOpsTask writes — used by the REST routes and
 * the ops MCP tools so the two surfaces can't drift on validation rules.
 */
import { z } from 'zod';

export const OPS_STATUS_VALUES = ['not_started', 'in_progress', 'blocked', 'done'] as const;
export type OpsStatus = (typeof OPS_STATUS_VALUES)[number];

/**
 * Lowercased consistently so an owner-equality check (the notify idempotency
 * guard in src/lib/ops/assign.ts) can't be fooled by casing — `isStaff()` and
 * `memberByEmail()` already compare case-insensitively, but the stored
 * ownerEmail itself must be normalized the same way at every write path
 * (REST + MCP) or "Joe@x" vs "joe@x" reads as a real reassignment.
 */
export const OpsOwnerEmailSchema = z.string().email().transform((v) => v.toLowerCase());

export const OpsTaskCreateSchema = z.object({
  board: z.string().min(1).default('pilot'),
  title: z.string().min(1),
  detail: z.string().default(''),
  phase: z.string().default(''),
  ownerEmail: OpsOwnerEmailSchema.nullish(),
  status: z.enum(OPS_STATUS_VALUES).default('not_started'),
  dueDate: z.coerce.date().nullish(),
  orderIndex: z.number().int().default(0),
});

export const OpsTaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  detail: z.string().optional(),
  phase: z.string().optional(),
  ownerEmail: OpsOwnerEmailSchema.nullish(),
  status: z.enum(OPS_STATUS_VALUES).optional(),
  dueDate: z.coerce.date().nullish(),
  orderIndex: z.number().int().optional(),
});

/**
 * Outreach status vocabulary for CompanyOpsContact — the same free-text
 * labels the reference plan used, kept as an enum so the UI select, the
 * bucket logic (contactBucket in src/app/ops/intelligence.ts), and the API
 * can't drift apart.
 */
export const OPS_CONTACT_STATUS_VALUES = [
  'Not started',
  'Draft ready',
  'Draft sent',
  'Sent',
  'Replied',
  'Call booked',
  'Connected',
  'Done',
  'Bounced',
  'Declined',
  'Parked',
  'Deferred',
] as const;
export type OpsContactStatus = (typeof OPS_CONTACT_STATUS_VALUES)[number];

export const OpsContactCreateSchema = z.object({
  board: z.string().min(1).default('pilot'),
  org: z.string().min(1),
  contact: z.string().default(''),
  type: z.string().default(''),
  status: z.enum(OPS_CONTACT_STATUS_VALUES).default('Not started'),
  nextStep: z.string().default(''),
  orderIndex: z.number().int().default(0),
});

export const OpsContactUpdateSchema = z.object({
  org: z.string().min(1).optional(),
  contact: z.string().optional(),
  type: z.string().optional(),
  status: z.enum(OPS_CONTACT_STATUS_VALUES).optional(),
  nextStep: z.string().optional(),
  orderIndex: z.number().int().optional(),
});

export const OPS_DECISION_STATUS_VALUES = ['open', 'decided'] as const;
export type OpsDecisionStatus = (typeof OPS_DECISION_STATUS_VALUES)[number];

export const OpsDecisionCreateSchema = z.object({
  board: z.string().min(1).default('pilot'),
  name: z.string().min(1),
  options: z.string().default(''),
  rationale: z.string().default(''),
  status: z.enum(OPS_DECISION_STATUS_VALUES).default('open'),
  orderIndex: z.number().int().default(0),
});

export const OpsDecisionUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  options: z.string().optional(),
  rationale: z.string().optional(),
  status: z.enum(OPS_DECISION_STATUS_VALUES).optional(),
  orderIndex: z.number().int().optional(),
});

/** PUT /api/ops/focus — up to 3 non-empty lines; the server derives weekStart. */
export const OpsFocusPutSchema = z.object({
  items: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
});
