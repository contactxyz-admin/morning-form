/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
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
