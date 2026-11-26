import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { HERO_IMAGES } from '@/lib/hero-images';

/**
 * How orders reach the customer. It says only what checkout really does: store pickup is
 * free, and the cost of doorstep delivery is agreed with the customer after they order.
 */
export default function ShippingPage() {
  const options = [
    {
      icon: 'ri-store-2-line',
      title: 'Store pickup',
      cost: 'Free',
      text: 'Collect your order from our shop in Haatso, Accra. We let you know when it is ready.',
    },
    {
      icon: 'ri-truck-line',
      title: 'Doorstep delivery',
      cost: 'Cost confirmed after you order',
      text: 'Choose doorstep delivery at checkout. We contact you to agree the delivery cost and time for your area before we send it.',
    },
  ];

  const steps = [
    {
      title: 'Place your order',
      text: 'Choose store pickup or doorstep delivery at checkout and pay with Mobile Money.',
    },
    {
      title: 'We confirm with you',
      text: 'You get a confirmation by text and email. For doorstep delivery we contact you to agree the cost and time.',
    },
    {
      title: 'We get it ready',
      text: 'Outfits in stock are packed for you. Preorder outfits are made after you order and take 3 to 4 business days to be ready.',
    },
    {
      title: 'Pickup or delivery',
      text: 'Collect from the shop, or receive your order at the address you gave us.',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Shipping and delivery"
        subtitle="Pick up from our shop in Haatso for free, or have your order brought to you."
        image={HERO_IMAGES.shipping}
        imagePosition="50% 35%"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        <section>
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Your options</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {options.map((option) => (
              <div key={option.title} className="border-2 border-gray-200 p-8 rounded-2xl">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <i className={`${option.icon} text-2xl text-gray-900`} aria-hidden></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{option.title}</h3>
                <p className="text-gray-900 font-semibold mb-3">{option.cost}</p>
                <p className="text-gray-700 leading-relaxed">{option.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-gray-700">
            We deliver across Ghana and send orders abroad from Accra. Tell us where you are and we will let you know
            the options and the cost.
          </p>
        </section>

        <section>
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How it works</h2>
          <ol className="space-y-6">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-900">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-gray-700 leading-relaxed">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Where is my order?</h2>
          <p className="text-gray-700 mb-6 leading-relaxed">
            Use your order number and the email you ordered with to see where your order has got to. Please make sure
            the phone number on your order is one we can reach you on.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/order-tracking"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              <i className="ri-map-pin-line" aria-hidden></i>
              Track your order
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border-2 border-gray-300 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors whitespace-nowrap"
            >
              Contact us
            </Link>
            <Link
              href="/returns"
              className="inline-flex items-center gap-2 border-2 border-gray-300 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors whitespace-nowrap"
            >
              Returns and exchanges
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
