import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Terms of Service',
  description: "The terms that apply when you shop with Freby’s Fashion GH.",
  path: '/terms',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
