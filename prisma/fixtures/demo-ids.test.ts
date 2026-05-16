import { describe, expect, it } from 'vitest';
import { DEMO_EMAIL, demoChunkId, demoNodeId, demoSourceId } from './demo-ids';

/**
 * Format-pinning tests for the deterministic demo IDs.
 *
 * The committed topic fixture (`demo-navigable-record-topics.json`)
 * embeds nodeIds inside compiled Citation objects. Those IDs come
 * from these helpers. A silent format change here would invalidate
 * every citation in the fixture without any structural error — just
 * dead links on the demo page. Pinning the format means a future
 * refactor of the helpers can't drift away from the committed fixture
 * without failing CI loudly.
 */
describe('demo-ids', () => {
  it('DEMO_EMAIL is the canonical demo-user identity', () => {
    expect(DEMO_EMAIL).toBe('demo@morningform.com');
  });

  it('demoNodeId joins type + canonicalKey under the `demo-node-` prefix', () => {
    expect(demoNodeId('biomarker', 'ferritin')).toBe('demo-node-biomarker-ferritin');
    expect(demoNodeId('symptom', 'fatigue')).toBe('demo-node-symptom-fatigue');
    expect(demoNodeId('medication', 'ferrous_fumarate_210mg')).toBe(
      'demo-node-medication-ferrous_fumarate_210mg',
    );
  });

  it('demoSourceId prefixes sourceKey with `demo-source-`', () => {
    expect(demoSourceId('blood_panel_2024_q2')).toBe('demo-source-blood_panel_2024_q2');
  });

  it('demoChunkId uses `__` between sourceKey and chunkKey to avoid hyphen ambiguity', () => {
    expect(demoChunkId('iron_panel', 'chunk_0')).toBe('demo-chunk-iron_panel__chunk_0');
    // The double-underscore prevents the historical hyphen-collision:
    // demoChunkId('a-b', 'c') !== demoChunkId('a', 'b-c').
    expect(demoChunkId('a-b', 'c')).not.toBe(demoChunkId('a', 'b-c'));
  });
});
