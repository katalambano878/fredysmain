import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Shop Kids Ready-to-Wear Outfits',
  description: "Browse kids ready-to-wear outfits by age, category and price. Delivery across Ghana and worldwide from Accra.",
  path: '/shop',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
