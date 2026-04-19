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
