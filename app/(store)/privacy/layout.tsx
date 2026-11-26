import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description: "How Freby’s Fashion GH collects, uses and protects your information.",
  path: '/privacy',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
