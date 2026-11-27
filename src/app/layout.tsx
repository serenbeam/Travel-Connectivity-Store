import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Roamly — Travel connectivity',
    template: '%s · Roamly',
  },
  description:
    'Travel data plans for international trips: pick a destination, pick a package, check out without an account.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
