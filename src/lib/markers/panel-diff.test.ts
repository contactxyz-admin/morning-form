import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestUser, setupTestDb, teardownTestDb } from '@/lib/graph/test-db';
import { addEdge, addNode, ingestExtraction } from '@/lib/graph/mutations';
import { classifyChange, diffLatestPanels } from './panel-diff';

let prisma: PrismaClient;
beforeAll(async () => { prisma = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });

describe('classifyChange (pure, range-relative)', () => {
  it('marks a value moving up into range as improved', () => {
    // ferritin-like: below range, rising toward it.
    expect(classifyChange(18, 41, 30, 400)).toEqual({ direction: 'up', classification: 'improved' });
  });

  it('marks a value moving down toward range as improved', () => {
    // hba1c-like: above range, falling toward it.
    expect(classifyChange(48, 40, 20, 42)).toEqual({ direction: 'down', classification: 'improved' });
  });

  it('marks a value moving further from range as worsened', () => {
    expect(classifyChange(35, 20, 30, 400)).toEqual({ direction: 'down', classification: 'worsened' });
  });

  it('marks an in-range-to-in-range move as stable regardless of direction', () => {
    expect(classifyChange(80, 95, 30, 400)).toEqual({ direction: 'up', classification: 'stable' });
  });

  it('reports direction only when there is no reference range', () => {
    expect(classifyChange(5, 9, null, null)).toEqual({ direction: 'up', classification: 'unclassified' });
    expect(classifyChange(9, 9, null, null)).toEqual({ direction: 'flat', classification: 'unclassified' });
  });

  it('handles one-sided ranges (low only / high only)', () => {
    // high-only (e.g. LDL upper bound): rising above is worsened.
    expect(classifyChange(2.5, 3.5, null, 3.0)).toEqual({ direction: 'up', classification: 'worsened' });
    // low-only (e.g. vitamin D floor): rising toward floor is improved.
    expect(classifyChange(30, 45, 50, null)).toEqual({ direction: 'up', classification: 'improved' });
  });
});

describe('diffLatestPanels', () => {
  it('returns null when there are no lab panels', async () => {
    const userId = await makeTestUser(prisma, 'diff-none');
    expect(await diffLatestPanels(prisma, userId)).toBeNull();
  });

  interface Reading {
    marker: string;
    display: string;
    value: number;
    low: number | null;
    high: number | null;
    flagged: boolean;
  }

  // Helper: ingest ONE panel as one document carrying many readings — the way
  // the route does (all markers from a single upload share one SourceDocument).
  async function ingestPanel(userId: string, date: string, readings: Reading[]) {
    const measuredAt = new Date(date).toISOString();
    const nodes = readings.flatMap((r, i) => [
      {
        type: 'biomarker' as const,
        canonicalKey: r.marker,
        displayName: r.display,
        attributes: {
          value: r.value,
          unit: 'ug/L',
          referenceRangeLow: r.low,
          referenceRangeHigh: r.high,
          flaggedOutOfRange: r.flagged,
          collectionDate: date,
          latestValue: r.value,
          latestValueAt: measuredAt,
        },
        supportingChunkIndices: [i],
      },
      {
        type: 'observation' as const,
        canonicalKey: `obs_${r.marker}_${date.replace(/-/g, '_')}`,
        displayName: `${r.display} · ${date}`,
        attributes: { value: r.value, unit: 'ug/L', measuredAt },
        promoted: false,
        supportingChunkIndices: [i],
      },
    ]);
    await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        sourceRef: `panel-${date}.pdf`,
        contentHash: `hash-${date}`,
        capturedAt: new Date(date),
      },
      chunks: readings.map((r, i) => ({
        index: i,
        text: `${r.display} ${r.value}`,
        offsetStart: 0,
        offsetEnd: 10,
      })),
      nodes,
      edges: readings.map((r) => ({
        type: 'INSTANCE_OF' as const,
        fromType: 'observation' as const,
        fromCanonicalKey: `obs_${r.marker}_${date.replace(/-/g, '_')}`,
        toType: 'biomarker' as const,
        toCanonicalKey: r.marker,
      })),
    });
  }

  it('reports `new` for every marker when only one panel exists', async () => {
    const userId = await makeTestUser(prisma, 'diff-one-panel');
    await ingestPanel(userId, '2026-04-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 18, low: 30, high: 400, flagged: true },
    ]);

    const diff = await diffLatestPanels(prisma, userId);
    expect(diff?.previousPanelAt).toBeNull();
    expect(diff?.changes).toHaveLength(1);
    expect(diff?.changes[0]).toMatchObject({
      marker: 'Ferritin',
      afterValue: 18,
      beforeValue: null,
      classification: 'new',
      direction: null,
    });
  });

  it('diffs the two most-recent panels with range-relative classification', async () => {
    const userId = await makeTestUser(prisma, 'diff-two-panels');
    // April panel: ferritin low (18), hba1c above range (48).
    await ingestPanel(userId, '2026-04-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 18, low: 30, high: 400, flagged: true },
      { marker: 'hba1c', display: 'HbA1c', value: 48, low: 20, high: 42, flagged: true },
    ]);
    // June panel: ferritin recovering (41, in range), hba1c falling toward range (44).
    await ingestPanel(userId, '2026-06-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 41, low: 30, high: 400, flagged: false },
      { marker: 'hba1c', display: 'HbA1c', value: 44, low: 20, high: 42, flagged: true },
    ]);

    const diff = await diffLatestPanels(prisma, userId);
    expect(diff?.latestPanelAt).toContain('2026-06-01');
    expect(diff?.previousPanelAt).toContain('2026-04-01');

    const byMarker = Object.fromEntries((diff?.changes ?? []).map((c) => [c.marker, c]));
    expect(byMarker['Ferritin']).toMatchObject({
      beforeValue: 18, afterValue: 41, direction: 'up', classification: 'improved',
    });
    expect(byMarker['HbA1c']).toMatchObject({
      beforeValue: 48, afterValue: 44, direction: 'down', classification: 'improved',
    });
  });

  it('skips an instance-less newest document instead of letting it blank the diff', async () => {
    const userId = await makeTestUser(prisma, 'diff-skip-empty');
    await ingestPanel(userId, '2026-04-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 18, low: 30, high: 400, flagged: true },
    ]);
    await ingestPanel(userId, '2026-06-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 41, low: 30, high: 400, flagged: false },
    ]);
    // A newer lab document that produced ZERO instances (e.g. an undated
    // extraction — route falls back capturedAt=now).
    await prisma.sourceDocument.create({
      data: {
        userId,
        kind: 'lab_pdf',
        sourceRef: 'undated.pdf',
        contentHash: 'hash-undated',
        capturedAt: new Date('2026-07-15'),
      },
    });

    const diff = await diffLatestPanels(prisma, userId);
    // The empty document is skipped; the two reading-bearing panels compare.
    expect(diff?.latestPanelAt).toContain('2026-06-01');
    expect(diff?.previousPanelAt).toContain('2026-04-01');
    expect(diff?.changes[0]).toMatchObject({
      marker: 'Ferritin',
      beforeValue: 18,
      afterValue: 41,
      classification: 'improved',
    });
  });

  it('matches a marker across canonicalKey drift via registryKey', async () => {
    const userId = await makeTestUser(prisma, 'diff-registry-join');
    // April panel: LLM emitted the snake_case fallback key, but the registry
    // resolved it — registryKey carries the canonical identity.
    await ingestPanelWithKeys(userId, '2026-04-01', {
      canonicalKey: 'serum_ferritin',
      registryKey: 'ferritin',
      display: 'Ferritin',
      value: 18,
    });
    // June panel: same marker under the registry canonicalKey.
    await ingestPanelWithKeys(userId, '2026-06-01', {
      canonicalKey: 'ferritin',
      registryKey: 'ferritin',
      display: 'Ferritin',
      value: 41,
    });

    const diff = await diffLatestPanels(prisma, userId);
    // Joined via registryKey — a before/after, NOT two disjoint 'new' rows.
    expect(diff?.changes).toHaveLength(1);
    expect(diff?.changes[0]).toMatchObject({
      marker: 'Ferritin',
      beforeValue: 18,
      afterValue: 41,
      classification: 'improved',
    });
  });

  async function ingestPanelWithKeys(
    userId: string,
    date: string,
    opts: { canonicalKey: string; registryKey: string; display: string; value: number },
  ) {
    const measuredAt = new Date(date).toISOString();
    await ingestExtraction(prisma, userId, {
      document: {
        kind: 'lab_pdf',
        sourceRef: `panel-${date}.pdf`,
        contentHash: `hash-keys-${date}`,
        capturedAt: new Date(date),
      },
      chunks: [{ index: 0, text: `${opts.display} ${opts.value}`, offsetStart: 0, offsetEnd: 10 }],
      nodes: [
        {
          type: 'biomarker',
          canonicalKey: opts.canonicalKey,
          displayName: opts.display,
          attributes: {
            value: opts.value,
            unit: 'ug/L',
            referenceRangeLow: 30,
            referenceRangeHigh: 400,
            collectionDate: date,
            registryKey: opts.registryKey,
            latestValue: opts.value,
            latestValueAt: measuredAt,
          },
          supportingChunkIndices: [0],
        },
        {
          type: 'observation',
          canonicalKey: `obs_${opts.canonicalKey}_${date.replace(/-/g, '_')}`,
          displayName: `${opts.display} · ${date}`,
          attributes: { value: opts.value, unit: 'ug/L', measuredAt },
          promoted: false,
          supportingChunkIndices: [0],
        },
      ],
      edges: [
        {
          type: 'INSTANCE_OF',
          fromType: 'observation',
          fromCanonicalKey: `obs_${opts.canonicalKey}_${date.replace(/-/g, '_')}`,
          toType: 'biomarker',
          toCanonicalKey: opts.canonicalKey,
        },
      ],
    });
  }

  it('flags a marker present only in the latest panel as `new`', async () => {
    const userId = await makeTestUser(prisma, 'diff-new-marker');
    await ingestPanel(userId, '2026-04-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 30, low: 30, high: 400, flagged: false },
    ]);
    await ingestPanel(userId, '2026-06-01', [
      { marker: 'ferritin', display: 'Ferritin', value: 35, low: 30, high: 400, flagged: false },
      { marker: 'vitamin_d', display: 'Vitamin D', value: 42, low: 50, high: 200, flagged: true },
    ]);

    const diff = await diffLatestPanels(prisma, userId);
    const vd = (diff?.changes ?? []).find((c) => c.marker === 'Vitamin D');
    expect(vd?.classification).toBe('new');
    expect(vd?.beforeValue).toBeNull();
  });
});
