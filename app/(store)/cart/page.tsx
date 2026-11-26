'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import CouponField from '@/components/CouponField';
import type { CouponPreview } from '@/lib/applied-coupon';
import { cartLineLimit, useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';
import { HERO_IMAGES } from '@/lib/hero-images';

export default function CartPage() {
  usePageTitle('Shopping Cart');
  const { cart: cartItems, removeFromCart, updateQuantity, subtotal, isHydrated } = useCart();
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null);

  // The server works out what a coupon is worth; checkout charges the same figure.
  const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - couponDiscount);
  const hasPreorderItems = cartItems.some((i) => i.isPreorder);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHero title="Shopping Cart" image={HERO_IMAGES.cart} imagePosition="50% 40%" />
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">


        {hasPreorderItems && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <i className="ri-time-line text-xl text-amber-700 mt-0.5"></i>
            <div className="text-sm">
              <p className="font-semibold text-amber-900">Your cart contains preorder items</p>
              <p className="text-amber-800 mt-1">
                Preorder items are produced after your order is placed and take <strong>3–4 business days</strong> to be ready before delivery or pickup.
              </p>
            </div>
          </div>
        )}

        {!isHydrated ? (
          <section className="py-20 flex justify-center">
            <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </section>
        ) : cartItems.length === 0 ? (
          <section className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
              <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
                <i className="ri-shopping-cart-line text-5xl text-gray-400"></i>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
              <p className="text-gray-600 mb-8 text-lg">You have not added anything to your cart yet</p>
              <Link href="/shop" className="inline-block bg-gray-900 hover:bg-gray-800 text-white px-8 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap">
                Continue Shopping
              </Link>
            </div>
          </section>
        ) : (
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-6 overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">Cart Items ({cartItems.length})</h2>
                    </div>

                    <div className="space-y-6">
                      {cartItems.map((item) => (
                        <div key={`${item.id}-${item.variantId || item.variant || ''}`} className="flex flex-col sm:flex-row gap-4 sm:gap-6 pb-6 border-b border-gray-200 last:border-0 last:pb-0">
                          <Link href={`/product/${item.slug || item.id}`} className="relative w-full sm:w-32 h-48 sm:h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                            <Image src={item.image} alt={item.name} fill className="object-cover object-top" sizes="(max-width: 640px) 100vw, 128px" quality={70} />
                          </Link>

                          <div className="flex-1">
                            <div className="flex justify-between mb-2">
                              <Link href={`/product/${item.slug || item.id}`} className="text-lg font-semibold text-gray-900 hover:text-gray-900 transition-colors line-clamp-2">
                                {item.name}
                              </Link>
                              <button
                                onClick={() => removeFromCart(item.id, item.variant, item.variantId)}
                                aria-label={`Remove ${item.name}`}
                                className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-600 transition-colors"
                              >
                                <i className="ri-close-line text-xl" aria-hidden></i>
                              </button>
                            </div>

                            <div className="text-sm text-gray-600 mb-3 space-y-1">
                              {item.variant && <p>Size: {item.variant}</p>}
                              {item.isPreorder ? (
                                <p className="inline-flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  <i className="ri-time-line" aria-hidden></i>
                                  Preorder · ready in 3–4 business days
                                </p>
                              ) : (
                                <p className="text-gray-700 font-medium">In Stock</p>
                              )}
                            </div>

                            <div className="flex items-center justify-between flex-wrap gap-4">
                              <div className="flex items-baseline space-x-3">
                                <span className="text-xl font-bold text-gray-900">GH₵{item.price.toFixed(2)}</span>
                              </div>

                              <div className="flex items-center space-x-4">
                                <div className="flex flex-col">
                                  <div className="flex items-center border-2 border-gray-300 rounded-lg">
                                    <button
                                      onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant, item.variantId)}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                                      aria-label={item.quantity <= (item.moq || 1) ? `Remove ${item.name}` : `One less ${item.name}`}
                                    >
                                      {item.quantity <= (item.moq || 1) ? (
                                        <i className="ri-delete-bin-line text-red-600" aria-hidden></i>
                                      ) : (
                                        <i className="ri-subtract-line" aria-hidden></i>
                                      )}
                                    </button>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || (item.moq || 1), item.variant, item.variantId)}
                                      aria-label={`Quantity of ${item.name}`}
                                      className="w-12 h-10 text-center border-x-2 border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-600 font-semibold"
                                      min={item.moq || 1}
                                      max={cartLineLimit(item)}
                                    />
                                    <button
                                      onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant, item.variantId)}
                                      disabled={item.quantity >= cartLineLimit(item)}
                                      aria-label={`One more ${item.name}`}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <i className="ri-add-line" aria-hidden></i>
                                    </button>
                                  </div>
                                  {(item.moq || 1) > 1 && (
                                    <span className="text-xs text-amber-600 mt-1">
                                      Min. order: {item.moq} units
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h3>

                    <div className="space-y-4 mb-6">
                      <div className="flex justify-between text-gray-700">
                        <span>Subtotal</span>
                        <span className="font-semibold">GH₵{subtotal.toFixed(2)}</span>
                      </div>

                      {appliedCoupon && (
                        <div className="flex justify-between text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span>Coupon ({appliedCoupon.code})</span>
                          </div>
                          <span className="font-semibold">-GH₵{couponDiscount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between gap-4 text-gray-700">
                        <span>Delivery</span>
                        <span className="text-right text-sm">
                          Store pickup is free. For doorstep delivery we confirm the cost with you after you order.
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4 mb-6">
                      <div className="flex justify-between text-xl font-bold text-gray-900">
                        <span>Total</span>
                        <span>GH₵{total.toFixed(2)}</span>
                      </div>
                    </div>

                    <CouponField subtotal={subtotal} onChange={setAppliedCoupon} />

                    <Link
                      href="/checkout"
                      className="block w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold text-center transition-colors mt-6 mb-3 whitespace-nowrap"
                    >
                      Proceed to Checkout
                    </Link>

                    <Link
                      href="/shop"
                      className="block w-full text-center text-gray-900 hover:text-gray-800 font-semibold py-2 whitespace-nowrap"
                    >
                      Continue Shopping
                    </Link>

                    <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-shield-check-line text-gray-900 mr-2"></i>
                        <span>Secure checkout</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-smartphone-line text-gray-900 mr-2" aria-hidden></i>
                        <span>Pay with Mobile Money</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
