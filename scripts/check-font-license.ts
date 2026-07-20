/**
 * Deploy gate for the trial-license web fonts under src/fonts/.
 *
 * The New Edge 666 and ABC Diatype Rounded Semi Mono files committed there are
 * the foundry's trial/evaluation builds; their embedded license text forbids
 * redistribution and "storing on publicly available servers" — exactly what
 * serving them from this app to visitors does. A README TODO is not enforced
 * by any tooling, so this gate runs at the front of `vercel-build` to stop a
 * deploy from silently shipping unlicensed fonts.
 *
 * Behavior:
 *   - No known trial fonts present            → notice, exit 0.
 *   - Trial fonts present, ALLOW_TRIAL_FONTS=true → warning, exit 0 (conscious override).
 *   - Trial fonts present, override unset     → error, exit 1 → the deploy fails.
 *
 * When a commercial webfont license is obtained (or the fonts are swapped for
 * licensed equivalents), update TRIAL_FONT_FILES to drop the now-licensed
 * filenames so the gate stops flagging them.
 *
 * Usage: tsx scripts/check-font-license.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const FONTS_DIR = join(process.cwd(), 'src', 'fonts');

// The exact trial-build filenames committed to the repo.
const TRIAL_FONT_FILES = [
  'NewEdge666-Light.otf',
  'NewEdge666-Regular.otf',
  'NewEdge666-SemiBold.otf',
  'NewEdge666-UltraBold.otf',
  'DiatypeRoundedSemiMono-Regular.otf',
  'DiatypeRoundedSemiMono-Medium.otf',
];

const present = TRIAL_FONT_FILES.filter((f) => existsSync(join(FONTS_DIR, f)));

if (present.length === 0) {
  console.log('[font-license] No known trial fonts present — OK.');
  process.exit(0);
}

if (process.env.ALLOW_TRIAL_FONTS === 'true') {
  console.warn(
    `[font-license] WARNING: shipping ${present.length} trial-license font file(s) ` +
      'because ALLOW_TRIAL_FONTS=true. Obtain a commercial license before this is public.',
  );
  process.exit(0);
}

console.error(
  '[font-license] FAIL: trial-license font files are present and would be bundled ' +
    'into the production build:',
);
for (const f of present) console.error(`  - src/fonts/${f}`);
console.error(
  '[font-license] These foundry trial fonts must not ship to production (their license ' +
    'forbids serving them from public servers). Obtain a commercial license and replace ' +
    'them, or set ALLOW_TRIAL_FONTS=true to override this gate consciously.',
);
process.exit(1);
