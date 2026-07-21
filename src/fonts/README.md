# Font policy

Production currently uses native sans-serif and monospace stacks configured in
`tailwind.config.ts`. No third-party font binaries are required or served.

Do not commit foundry trial or evaluation files. The historical New Edge 666
and ABC Diatype Rounded Semi Mono trial filenames remain deny-listed by
`scripts/check-font-license.ts`, which runs at the front of `vercel-build`.

Before adding a webfont, record the commercial or open-source web-distribution
license, commit only the covered production build, and verify the deployment
gate locally with `npm run vercel-build`.
