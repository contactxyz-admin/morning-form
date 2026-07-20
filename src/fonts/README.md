These OTF files are the type foundry's trial/evaluation builds (see each
font's embedded name table: `NewEdge666Test-*`, `...SemiMonoTrial-*`). Their
embedded license text prohibits redistribution and "storing on publicly
available servers" — which is exactly what serving them from this app does.

**Deploy gate:** `scripts/check-font-license.ts` runs at the front of
`vercel-build` and FAILS the deploy while these trial files are present, unless
`ALLOW_TRIAL_FONTS=true` is set to override consciously. This enforces the
licensing decision instead of relying on this README being read.

TODO before this ships to real users: buy a commercial webfont license for
New Edge 666 and ABC Diatype Rounded Semi Mono (or swap in licensed
equivalents), replace these files, and drop the now-licensed filenames from
`TRIAL_FONT_FILES` in `scripts/check-font-license.ts`.

Only the weights actually used are committed/loaded (see `src/app/layout.tsx`):
New Edge 666 Light/Regular/SemiBold/UltraBold, Diatype Rounded Mono
Regular/Medium. New Edge italic is not available, so `italic` on display-font
text falls back to the browser's synthetic oblique.
