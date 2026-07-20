import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// New Edge 666 — the redesign's display/interface sans, carries both
// headlines (font-display) and body/UI (font-sans, aliased to the same
// variable in tailwind.config.ts). NOTE: these are the foundry's trial
// build (see src/fonts/README.md) — swap for a licensed webfont build
// before this ships to real users.
const newEdge = localFont({
  // Only the weights actually referenced by className are loaded. UltraLight
  // (200) is unused; UltraBold (800) is kept for the Wordmark component.
  src: [
    { path: '../fonts/NewEdge666-Light.otf', weight: '300', style: 'normal' },
    { path: '../fonts/NewEdge666-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/NewEdge666-SemiBold.otf', weight: '600', style: 'normal' },
    { path: '../fonts/NewEdge666-UltraBold.otf', weight: '800', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

// Diatype Rounded Mono — labels, metrics, eyebrows, data. Same trial-license
// caveat as New Edge 666 above.
const diatypeMono = localFont({
  // Light (300) and Bold (700) are unused by any font-mono className; only
  // Regular and Medium are loaded.
  src: [
    { path: '../fonts/DiatypeRoundedSemiMono-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/DiatypeRoundedSemiMono-Medium.otf', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Morning Form',
  description: 'A system for understanding your state.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newEdge.variable} ${diatypeMono.variable}`}>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
