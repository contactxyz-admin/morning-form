import type { Metadata, Viewport } from 'next';
import './globals.css';

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
      style={
        {
          '--font-inter': 'Inter, ui-sans-serif, system-ui, sans-serif',
          '--font-jetbrains-mono': '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace',
          '--font-instrument-serif': '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
        } as React.CSSProperties
      }
    >
      <body className="font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
