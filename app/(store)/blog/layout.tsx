import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Blog',
  description: "Style ideas and news from Freby’s Fashion GH.",
  path: '/blog',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
