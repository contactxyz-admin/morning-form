/**
 * Layout for `/r/[slug]` — public demo-record URL.
 *
 * Noindex + no-follow at the metadata layer; `src/middleware.ts` also
 * sets `X-Robots-Tag` as belt-and-braces. We deliberately avoid any
 * top-nav chrome here: this surface is a standalone prototype meant
 * to be shared as a link, not a step inside the signed-in app.
 */

export const metadata = {
  title: 'Health record preview',
  robots: { index: false, follow: false, nocache: true },
};

export default function DemoRecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
