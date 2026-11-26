import { pageMetadata } from '../_seo';

export const metadata = pageMetadata({
  title: 'FAQs',
  description: "Answers about sizes, orders, payment, delivery and returns at Freby’s Fashion GH.",
  path: '/faqs',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
