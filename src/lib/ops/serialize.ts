/**
 * Prisma row -> client DTO serializers for the ops board, shared by the /ops
 * server page, the live-tab API responses, and the digest builder so the
 * shapes can't drift.
 */
import type { CompanyOpsContact, CompanyOpsDecision, CompanyOpsTask } from '@prisma/client';
import type { OpsTaskDto } from '@/app/ops/board-client';
import type { OpsContactDto } from '@/app/ops/contacts-client';
import type { OpsDecisionDto } from '@/app/ops/decisions-client';

export function serializeOpsTask(task: CompanyOpsTask): OpsTaskDto {
  return {
    id: task.id,
    board: task.board,
    title: task.title,
    detail: task.detail,
    phase: task.phase,
    ownerEmail: task.ownerEmail,
    status: task.status as OpsTaskDto['status'],
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    orderIndex: task.orderIndex,
  };
}

export function serializeOpsContact(contact: CompanyOpsContact): OpsContactDto {
  return {
    id: contact.id,
    org: contact.org,
    contact: contact.contact,
    type: contact.type,
    status: contact.status,
    nextStep: contact.nextStep,
    orderIndex: contact.orderIndex,
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export function serializeOpsDecision(decision: CompanyOpsDecision): OpsDecisionDto {
  return {
    id: decision.id,
    name: decision.name,
    options: decision.options,
    rationale: decision.rationale,
    status: decision.status as OpsDecisionDto['status'],
    decidedAt: decision.decidedAt ? decision.decidedAt.toISOString() : null,
    createdAt: decision.createdAt.toISOString(),
    orderIndex: decision.orderIndex,
  };
}
