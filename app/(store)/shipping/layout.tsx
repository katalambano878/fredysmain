import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Shipping and Delivery',
  description: "Free store pickup in Haatso, Accra, or doorstep delivery with the cost confirmed after you order.",
  path: '/shipping',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
