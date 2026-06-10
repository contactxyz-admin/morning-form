/**
 * Presentation vocabulary for a panel-change classification — the single
 * source of truth for how the "what changed since last test" signal reads as
 * text across every surface (canvas badge, graph list chip, node detail
 * sheet, /decisions card). Code-review of the temporal-canvas work found the
 * direction glyph duplicated in three places and the label map in two, with
 * the tone colours already drifting between surfaces; centralising the
 * text vocabulary here stops the labels/glyphs from diverging.
 *
 * NOTE: tone/colour mapping is deliberately NOT here yet — the canvas uses
 * design tokens (changeVisual in visual-encoding.ts) while the /decisions
 * card uses a raw palette; reconciling those is a visual decision for the
 * audit, not a mechanical move.
 */
import type { ChangeClassification, ChangeDirection } from './panel-diff';

/** Arrow for a change's direction; `+` for a `new` reading (null direction). */
export function changeDirectionGlyph(direction: ChangeDirection | null): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  if (direction === 'flat') return '→';
  return '+';
}

/**
 * Range-relative, descriptive labels — never value-judgements. "improved"
 * means "moved toward the reference interval", not "good".
 */
export const CHANGE_CLASSIFICATION_LABEL: Record<ChangeClassification, string> = {
  improved: 'Toward range',
  worsened: 'Away from range',
  stable: 'In range',
  new: 'New reading',
  unclassified: 'Changed',
};

/** Total over a plain string — defaults to "Changed" on an unknown value. */
export function changeClassificationLabel(classification: string): string {
  return (
    (CHANGE_CLASSIFICATION_LABEL as Record<string, string>)[classification] ?? 'Changed'
  );
}
