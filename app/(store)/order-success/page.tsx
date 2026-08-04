'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useCart } from '@/context/CartContext';
import { trackPurchase } from '@/lib/meta-pixel';

async function secureFetchOrder(orderNumber: string, email: string) {
  const res = await fetch('/api/orders/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderNumber, email, includeItems: true }),
  });
  if (!res.ok) return null;
  const { order } = await res.json();
  return order;
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const emailParam = searchParams.get('email');
  const paymentSuccess = searchParams.get('payment_success');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const { clearCart } = useCart();
  const purchaseTracked = useRef(false);

  useEffect(() => {
    // Clear cart once customer lands on success (paid or gateway return)
    if (orderNumber && (paymentSuccess === 'true' || order?.payment_status === 'paid')) {
      clearCart();
    }
  }, [orderNumber, paymentSuccess, order?.payment_status, clearCart]);

  // Meta Pixel Purchase (deduped with server CAPI via purchase_{order_number})
  useEffect(() => {
    if (!order || order.payment_status !== 'paid' || purchaseTracked.current) return;
    const orderId = String(order.order_number || '');
    if (!orderId) return;
    const storageKey = `meta_purchase_${orderId}`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        purchaseTracked.current = true;
        return;
      }
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* private mode */
    }
    purchaseTracked.current = true;
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const contentIds = items.map((i: any) => i.product_id).filter(Boolean);
    const contents = items
      .filter((i: any) => i.product_id)
      .map((i: any) => ({
        id: String(i.product_id),
        quantity: Number(i.quantity) || 1,
        item_price: Number(i.unit_price) || undefined,
      }));
    trackPurchase({
      orderId,
      value: Number(order.total) || 0,
      contentIds,
      contents,
      numItems: contents.reduce((s: number, c: { quantity: number }) => s + c.quantity, 0),
    });
  }, [order]);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderNumber || !emailParam) {
        setLoading(false);
        return;
      }

      try {
        const orderData = await secureFetchOrder(orderNumber, emailParam);
        if (!orderData) throw new Error('Not found');
        setOrder(orderData);

        if (paymentSuccess === 'true' && orderData && orderData.payment_status !== 'paid') {
          verifyPayment(orderNumber, orderData);
        }
      } catch (err) {
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderNumber, emailParam]);

  const verifyPayment = async (orderNum: string, initialOrder: any) => {
    setVerifying(true);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const lookupEmail = initialOrder?.email || emailParam || '';
    const refreshed = await secureFetchOrder(orderNum, lookupEmail);
    
    if (refreshed?.payment_status === 'paid') {
      setOrder(refreshed);
      setVerifying(false);
      return;
    }

    const gateway =
      initialOrder?.metadata?.payment_gateway ||
      initialOrder?.metadata?.payment_method ||
      'moolre';
    const verifyEndpoint =
      gateway === 'hubtel' ? '/api/payment/hubtel/verify' : '/api/payment/moolre/verify';
    const externalRef = initialOrder?.metadata?.hubtel_client_reference;

    try {
      const res = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNum,
          ...(externalRef ? { externalRef } : {}),
        })
      });
      
      const result = await res.json();
      
      if (result.success && result.payment_status === 'paid') {
        const updated = await secureFetchOrder(orderNum, lookupEmail);
        if (updated) setOrder(updated);
      }
    } catch (err) {
      console.error('Payment verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-emerald-700 animate-spin mb-4 block"></i>
          <p className="text-gray-500">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="ri-error-warning-line text-4xl text-red-500 mb-4 block"></i>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn{'\u2019'}t locate the order details.</p>
          <Link href="/shop" className="text-emerald-700 font-semibold hover:underline">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  const orderDate = new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const estimatedDelivery = new Date(new Date(order.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pointsEarned = Math.floor(order.total / 10);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-fall"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            >
              <i className={`ri-${['heart', 'star', 'gift'][Math.floor(Math.random() * 3)]}-fill text-${['emerald', 'amber', 'blue'][Math.floor(Math.random() * 3)]}-500 text-xl opacity-70`}></i>
            </div>
          ))}
        </div>
      )}

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center mb-8">
            <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-emerald-100 rounded-full">
              <i className="ri-checkbox-circle-fill text-6xl text-emerald-600"></i>
            </div>

            <h1 className="text-4xl font-bold text-gray-900 mb-4">Order Confirmed!</h1>
            <p className="text-xl text-gray-600 mb-8">
              Thank you for your purchase. We{'\u2019'}re processing your order now.
            </p>

            {verifying && (
              <div className="mb-6 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Verifying payment status...
              </div>
            )}

            <div className="bg-emerald-50 rounded-xl p-6 mb-8">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Order Number</p>
                  <p className="text-lg font-bold text-gray-900">{order.order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Order Date</p>
                  <p className="text-lg font-bold text-gray-900">{orderDate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Estimated Delivery</p>
                  <p className="text-lg font-bold text-emerald-700">{estimatedDelivery}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Link
                href={`/account?tab=orders`}
                className="bg-emerald-700 hover:bg-emerald-800 text-white px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
              >
                <i className="ri-file-list-3-line mr-2"></i>
                View Order
              </Link>
              <Link
                href="/shop"
                className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
              >
                <i className="ri-shopping-bag-line mr-2"></i>
                Continue Shopping
              </Link>
            </div>

            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border-2 border-amber-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-amber-500 rounded-full">
                    <i className="ri-star-fill text-white text-2xl"></i>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900 text-lg">You Earned {pointsEarned} Points!</p>
                    <p className="text-sm text-gray-600">Join our loyalty program to redeem.</p>
                  </div>
                </div>
                <Link
                  href="/register"
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  Join Now
                </Link>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Items</h2>
              <div className="space-y-4">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="flex items-center space-x-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img
                        src={item.metadata?.image || '/frebys-logo.png'}
                        alt={item.product_name}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 line-clamp-2">{item.product_name}</p>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                      {item.variant_name && (
                        <p className="text-xs text-gray-500">{item.variant_name}</p>
                      )}
                    </div>
                    <p className="font-bold text-gray-900">GH&#8373;{item.unit_price.toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Subtotal</span>
                  <span>GH&#8373;{order.subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Shipping</span>
                  <span>GH&#8373;{order.shipping_total?.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>Total Paid</span>
                  <span>GH&#8373;{order.total?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Delivery Details</h2>
              <div className="space-y-3">
                {order.shipping_address && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Recipient</p>
                      <p className="font-semibold text-gray-900">
                        {order.shipping_address.firstName} {order.shipping_address.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Address</p>
                      <p className="text-gray-900">{order.shipping_address.address}</p>
                      <p className="text-gray-900">{order.shipping_address.city}, {order.shipping_address.region}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Phone</p>
                      <p className="text-gray-900">{order.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Email</p>
                      <p className="text-gray-900">{order.email}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">What{'\u2019'}s Next?</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <i className="ri-mail-line text-emerald-700 mt-1"></i>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Email Confirmation</p>
                      <p className="text-sm text-gray-600">Sent to {order.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <i className="ri-box-3-line text-emerald-700 mt-1"></i>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Processing</p>
                      <p className="text-sm text-gray-600">We{'\u2019'}ll pack your order today</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <i className="ri-truck-line text-emerald-700 mt-1"></i>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Shipping Updates</p>
                      <p className="text-sm text-gray-600">Track via email & SMS</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-600 mb-4">Need help with your order?</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/contact" className="text-emerald-700 hover:text-emerald-900 font-semibold whitespace-nowrap">
                <i className="ri-customer-service-line mr-1"></i>
                Contact Support
              </Link>
              <Link href="/account/orders" className="text-emerald-700 hover:text-emerald-900 font-semibold whitespace-nowrap">
                <i className="ri-question-line mr-1"></i>
                Order Help
              </Link>
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
        .animate-fall {
          animation: fall linear forwards;
        }
      `}</style>
    </main>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <OrderSuccessContent />
    </Suspense>
  );
}
