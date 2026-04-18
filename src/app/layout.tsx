import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Bricolage Grotesque — modern grotesque with slight character (rounded
// terminals, soft quirk). Pairs consumer warmth with wellness calm.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz', 'wdth'],
});

// Fraunces — kept as a serif-italic accent for pull-phrases via .voice-italic.
// No longer the default display font.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
  style: 'italic',
});

// Instrument Sans — body sans with stroke character.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
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
    <html
      lang="en"
      className={`${bricolage.variable} ${fraunces.variable} ${instrumentSans.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
