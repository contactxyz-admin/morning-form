import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Reddit_Mono } from 'next/font/google';
import './globals.css';

// Plus Jakarta Sans — free (SIL OFL) replacement for the design's original
// New Edge 666 reference: closest free match found — same open apertures,
// single-story g, double-story a, and a matching Light/Regular/SemiBold/
// ExtraBold weight range. Carries both headlines (font-display) and body/UI
// (font-sans, aliased to the same variable in tailwind.config.ts).
const plusJakartaSans = Plus_Jakarta_Sans({
  weight: ['300', '400', '600', '800'],
  variable: '--font-display',
  display: 'swap',
  subsets: ['latin'],
});

// Reddit Mono — free (SIL OFL) replacement for the design's original ABC
// Diatype Rounded Semi Mono reference: closest free monospace match found,
// with the same soft rounded terminals. Labels, metrics, eyebrows, data.
const redditMono = Reddit_Mono({
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  subsets: ['latin'],
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
    <html lang="en" className={`${plusJakartaSans.variable} ${redditMono.variable}`}>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
