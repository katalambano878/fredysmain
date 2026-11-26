import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Our Story',
  description: "The story behind Freby’s Fashion GH: unique kids ready-to-wear outfits made in Haatso, Accra.",
  path: '/about',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
