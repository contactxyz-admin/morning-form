import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard for the "total isolation from health/PHI data" guardrail
 * (build brief 2026-07-04). CompanyOpsTask/CompanyOpsAudit are deliberately
 * FK-less — see AccountDeletionTombstone precedent in prisma/schema.prisma —
 * so they can never be swept into the GDPR export/delete paths. This test
 * fails loudly if a future edit ever wires them in anyway.
 */
function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Company Ops Board isolation from GDPR export/delete paths', () => {
  it('src/lib/account/export.ts never references CompanyOps models', () => {
    const source = readSource('src/lib/account/export.ts');
    expect(source).not.toMatch(/CompanyOps/);
  });

  it('src/lib/account/delete.ts never references CompanyOps models', () => {
    const source = readSource('src/lib/account/delete.ts');
    expect(source).not.toMatch(/CompanyOps/);
  });

  it('src/lib/scribe is never imported from the ops surface', () => {
    const files = [
      'src/lib/ops/config.ts',
      'src/lib/ops/audit.ts',
      'src/lib/ops/rate-limit.ts',
      'src/lib/ops/notify.ts',
      'src/lib/ops/assign.ts',
      'src/lib/ops/schema.ts',
      'src/lib/ops/rest-guard.ts',
      'src/lib/ops/mcp/tools.ts',
      'src/app/api/ops/board/route.ts',
      'src/app/api/ops/task/route.ts',
      'src/app/api/ops/task/[id]/route.ts',
      'src/app/api/ops/mcp/route.ts',
    ];
    for (const file of files) {
      const source = readSource(file);
      expect(source, `${file} must not import from src/lib/scribe`).not.toMatch(/from ['"]@\/lib\/scribe/);
      expect(source, `${file} must not import from src/lib/mcp`).not.toMatch(/from ['"]@\/lib\/mcp/);
    }
  });

  it('CompanyOpsTask and CompanyOpsAudit are FK-less in the schema (no "user " relation field)', () => {
    const schema = readSource('prisma/schema.prisma');
    const taskModel = extractModel(schema, 'CompanyOpsTask');
    const auditModel = extractModel(schema, 'CompanyOpsAudit');
    expect(taskModel).not.toMatch(/User\b/);
    expect(auditModel).not.toMatch(/User\b/);
  });
});

function extractModel(schema: string, modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`).exec(schema);
  if (!match) throw new Error(`model ${modelName} not found in schema.prisma`);
  return match[0];
}
