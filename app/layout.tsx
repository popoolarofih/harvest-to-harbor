import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Harvest to Harbor: Nigeria',
  description: 'A Nigerian agricultural business simulation MVP.'
};

// viewport-fit=cover lets the HUD use safe-area insets on notched phones.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b100c' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
