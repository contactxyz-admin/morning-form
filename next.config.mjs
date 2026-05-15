/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse → pdfjs-dist → @napi-rs/canvas ships native `.node` binaries
    // and uses dynamic requires for DOM polyfills (DOMMatrix/ImageData/Path2D).
    // Webpack can't trace them into the serverless bundle, so Vercel 500s with
    // "Cannot find module '@napi-rs/canvas'" → "DOMMatrix is not defined".
    // Externalizing makes Next require them at runtime from node_modules.
    serverComponentsExternalPackages: [
      '@prisma/client',
      'pdf-parse',
      'pdfjs-dist',
      '@napi-rs/canvas',
    ],
    // pdfjs-dist dynamically `import()`s its worker file on first parse. Vercel's
    // lambda tracer can't follow that dynamic path, so the worker .mjs never
    // ships to /var/task/node_modules, and extraction fails with
    // `malformed_pdf: Setting up fake worker failed: Cannot find module
    // '.../pdfjs-dist/legacy/build/pdf.worker.mjs'`. Force-include it.
    outputFileTracingIncludes: {
      '/api/intake/documents': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      ],
      // `loadSpecialtySystemPrompt` reads these at runtime via
      // fs.readFileSync(process.cwd() + systemPromptPath). The path is
      // dynamic (computed from the specialty registry, not a static
      // import) so Next.js's tracer can't follow it, and the markdown
      // files never ship to /var/task — prod 500s with ENOENT the
      // moment any scribe call hits the general specialty.
      // Force-include the full specialty prompt tree. See
      // src/lib/scribe/specialties/load-prompt.ts.
      '/api/**/*': [
        './src/lib/scribe/specialties/**/system-prompt.md',
      ],
    },
  },
  // Scope `next build` lint to the API surface. `.eslintrc.json` enforces
  // `no-restricted-imports` on api handlers (so route code can't reach for
  // the demo-user shim). The rest of the codebase has pre-existing lint
  // noise that predates this PR — leaving it out of the build gate keeps
  // the auth work from expanding into an unrelated cleanup PR.
  eslint: {
    dirs: ['src/app/api'],
  },
};

export default nextConfig;
