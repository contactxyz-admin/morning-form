/**
 * Shared Zod shapes for CompanyOpsTask writes — used by the REST routes and
 * the ops MCP tools so the two surfaces can't drift on validation rules.
 */
import { z } from 'zod';

export const OPS_STATUS_VALUES = ['not_started', 'in_progress', 'blocked', 'done'] as const;
export type OpsStatus = (typeof OPS_STATUS_VALUES)[number];

export const OpsTaskCreateSchema = z.object({
  board: z.string().min(1).default('pilot'),
  title: z.string().min(1),
  detail: z.string().default(''),
  phase: z.string().default(''),
  ownerEmail: z.string().email().nullish(),
  status: z.enum(OPS_STATUS_VALUES).default('not_started'),
  dueDate: z.coerce.date().nullish(),
  orderIndex: z.number().int().default(0),
});

export const OpsTaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  detail: z.string().optional(),
  phase: z.string().optional(),
  ownerEmail: z.string().email().nullish(),
  status: z.enum(OPS_STATUS_VALUES).optional(),
  dueDate: z.coerce.date().nullish(),
  orderIndex: z.number().int().optional(),
});
