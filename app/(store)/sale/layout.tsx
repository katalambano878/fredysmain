import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Sale',
  description: "Kids outfits at lower prices while the sale lasts. Delivery across Ghana and worldwide from Accra.",
  path: '/sale',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
