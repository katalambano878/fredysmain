import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Shop by Category',
  description: "Casual wear, church wear, traditional wear, matching sets and more for kids, from Freby’s Fashion GH.",
  path: '/categories',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
