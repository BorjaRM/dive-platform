import type { ReactNode } from 'react';
import { dmSans } from '../fonts';
import '../globals.css';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
