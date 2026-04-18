import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Archivo — variable grotesque with width + weight axes. The wdth axis lets a
// single family carry both compressed Pentagon-style headlines and standard
// display weights; pair with mono labels for the engineered/instrument feel.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['wdth'],
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
      className={`${archivo.variable} ${fraunces.variable} ${instrumentSans.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
