import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'Track My Order',
  description: "Check the status of your Freby’s Fashion GH order.",
  path: '/order-tracking',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
