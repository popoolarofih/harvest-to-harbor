import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Harvest to Harbor: Nigeria',
  description: 'A Nigerian agricultural business simulation MVP.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
