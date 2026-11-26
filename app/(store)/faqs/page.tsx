"use client";

import { useState } from 'react';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { HERO_IMAGES } from '@/lib/hero-images';

export default function FAQsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Questions', icon: 'ri-question-line' },
    { id: 'orders', name: 'Orders', icon: 'ri-shopping-bag-line' },
    { id: 'shipping', name: 'Delivery', icon: 'ri-truck-line' },
    { id: 'returns', name: 'Returns', icon: 'ri-arrow-go-back-line' },
    { id: 'payment', name: 'Payment', icon: 'ri-smartphone-line' },
    { id: 'account', name: 'Account', icon: 'ri-user-line' }
  ];

  // Answers describe what the site does today. Anything the shop decides case by case
  // (returns, delivery cost and timing) points the customer to the team instead of quoting terms.
  const faqs = [
    {
      category: 'orders',
      question: 'How do I place an order?',
      answer: 'Choose an outfit, pick the size, and add it to your cart. At checkout, enter your details, choose store pickup or doorstep delivery, and pay with Mobile Money. You get a confirmation by text and email once your payment goes through.'
    },
    {
      category: 'orders',
      question: 'Can I change or cancel my order?',
      answer: 'Contact us as soon as you can on 0244720197 or hello@frebysfashion.com and we will tell you what is still possible. The earlier you reach us, the easier it is to change.'
    },
    {
      category: 'orders',
      question: 'How do I track my order?',
      answer: 'Open the Track My Order page and enter your order number and the email address you ordered with.'
    },
    {
      category: 'orders',
      question: 'What does "Preorder" mean?',
      answer: 'A preorder outfit is made after you order it. Preorder outfits take 3 to 4 business days to be ready before pickup or delivery.'
    },
    {
      category: 'orders',
      question: 'What if I receive the wrong item?',
      answer: 'We are sorry if that happens. Contact us with your order number and a photo of what you received, and we will put it right.'
    },
    {
      category: 'shipping',
      question: 'How much does delivery cost?',
      answer: 'Store pickup from our shop in Haatso, Accra is free. For doorstep delivery, we contact you after you order to confirm the cost for your area. Delivery is not charged at checkout.'
    },
    {
      category: 'shipping',
      question: 'How long does delivery take?',
      answer: 'It depends on where you are. We agree the delivery time with you when we confirm the delivery cost. Preorder outfits need 3 to 4 business days to be made first.'
    },
    {
      category: 'shipping',
      question: 'Do you deliver outside Ghana?',
      answer: 'Yes. We send orders abroad from Accra. Contact us with your location and we will let you know the options and the cost.'
    },
    {
      category: 'returns',
      question: 'Can I return or exchange an item?',
      answer: 'Contact us as soon as you can after you receive your order, with your order number and what is wrong. Our team looks at each request and tells you what we can do. Please keep the item unworn, with its tags, until we have confirmed.'
    },
    {
      category: 'returns',
      question: 'I am not sure which size to order. Can you help?',
      answer: 'Yes. Message us on WhatsApp before you order and we will help you choose the right size.'
    },
    {
      category: 'payment',
      question: 'How can I pay?',
      answer: 'You pay with Mobile Money at checkout. After you place the order you approve the payment on your phone.'
    },
    {
      category: 'payment',
      question: 'When is my order confirmed?',
      answer: 'Your order is confirmed once your payment goes through. If the payment does not complete, your order is saved and you can pay from the link we send you.'
    },
    {
      category: 'account',
      question: 'Do I need an account to place an order?',
      answer: 'No. You can check out as a guest. With an account you can see your past orders and save your delivery addresses.'
    },
    {
      category: 'account',
      question: 'I forgot my password. What do I do?',
      answer: 'Passwords cannot be reset online yet. Message or call us on 0244720197 with the email or phone number on your account and we will help you sign in again.'
    },
    {
      category: 'account',
      question: 'Can I save more than one delivery address?',
      answer: 'Yes. You can save several addresses in your account and choose one at checkout.'
    }
  ];

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Frequently Asked Questions"
        subtitle="Find quick answers to common questions about ordering, shipping, returns, and more."
        image={HERO_IMAGES.faqs}
        imagePosition="50% 40%"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="max-w-3xl mx-auto mb-10">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search the questions"
              placeholder="Search for answers..."
              className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-full focus:ring-2 focus:ring-gray-600 focus:border-transparent text-sm shadow-lg"
            />
            <i className="ri-search-line absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl"></i>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all whitespace-nowrap ${
                activeCategory === category.id
                  ? 'bg-gray-900 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <i className={`${category.icon} text-lg`}></i>
              {category.name}
            </button>
          ))}
        </div>

        {filteredFAQs.length > 0 ? (
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredFAQs.map((faq, index) => (
              <details
                key={index}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
              >
                <summary className="px-6 py-5 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between">
                  <span className="flex-1 pr-4">{faq.question}</span>
                  <i className="ri-arrow-down-s-line text-xl text-gray-400"></i>
                </summary>
                <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-search-line text-4xl text-gray-400"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600">
              Try adjusting your search or browse different categories
            </p>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-gray-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-customer-service-2-line text-3xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Still Have Questions?</h2>
          <p className="text-xl text-gray-100 mb-8 leading-relaxed">
            Our team is ready to help. Send us a message or chat with us on WhatsApp.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-full font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <i className="ri-mail-line text-lg"></i>
              Contact Support
            </Link>
            <a
              href="https://wa.me/233244720197"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-gray-700 text-white px-8 py-4 rounded-full font-medium hover:bg-gray-600 transition-colors whitespace-nowrap"
            >
              <i className="ri-whatsapp-line text-lg"></i>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Quick Links</h2>
          <p className="text-gray-600">Explore more helpful resources</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Link href="/shipping" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-truck-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Shipping and delivery</h3>
            <p className="text-gray-600 leading-relaxed">
              Store pickup, doorstep delivery and tracking your order
            </p>
          </Link>

          <Link href="/returns" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-arrow-go-back-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Returns and exchanges</h3>
            <p className="text-gray-600 leading-relaxed">
              How to ask us about a return or a different size
            </p>
          </Link>

          <Link href="/privacy" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-shield-check-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Privacy & Security</h3>
            <p className="text-gray-600 leading-relaxed">
              See how we protect your personal information and data
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
