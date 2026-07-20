import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// New Edge 666 — the redesign's display/interface sans, carries both
// headlines (font-display) and body/UI (font-sans, aliased to the same
// variable in tailwind.config.ts). NOTE: these are the foundry's trial
// build (see src/fonts/README.md) — swap for a licensed webfont build
// before this ships to real users.
const newEdge = localFont({
  src: [
    { path: '../fonts/NewEdge666-UltraLight.otf', weight: '200', style: 'normal' },
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
  src: [
    { path: '../fonts/DiatypeRoundedSemiMono-Light.otf', weight: '300', style: 'normal' },
    { path: '../fonts/DiatypeRoundedSemiMono-Regular.otf', weight: '400', style: 'normal' },
    { path: '../fonts/DiatypeRoundedSemiMono-Medium.otf', weight: '500', style: 'normal' },
    { path: '../fonts/DiatypeRoundedSemiMono-Bold.otf', weight: '700', style: 'normal' },
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
