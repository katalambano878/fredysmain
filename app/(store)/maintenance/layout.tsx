import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Back Soon',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
