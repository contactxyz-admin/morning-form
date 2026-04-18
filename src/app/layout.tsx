import type { Metadata, Viewport } from 'next';
import { Fraunces, JetBrains_Mono, Onest } from 'next/font/google';
import './globals.css';

// Onest — humanist modern sans in the Söhne / ABC Whyte tradition. Soft
// terminals, open apertures, generous proportions. Carries both display
// and body so the brand reads as one premium voice end-to-end.
const onest = Onest({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Fraunces — kept only as a serif-italic accent for pull-phrases via
// .voice-italic. The single literary moment in an otherwise humanist brand.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
  style: 'italic',
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
      className={`${onest.variable} ${fraunces.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
