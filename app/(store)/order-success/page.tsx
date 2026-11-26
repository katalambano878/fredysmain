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
  const [verifying, setVerifying] = useState(false);
  const { clearCart } = useCart();
  const purchaseTracked = useRef(false);

  useEffect(() => {
    // The cart is emptied only once the order is really paid. Coming back from the payment
    // page is not proof of payment, and the shopper needs the cart to try again.
    if (orderNumber && order?.payment_status === 'paid') {
      clearCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, order?.payment_status]);

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
  const isPaid = order.payment_status === 'paid';
  // 'pickup', 'doorstep', or '' when the order record does not say.
  const method = String(order.shipping_method || order.metadata?.shipping_method || '').toLowerCase();
  const isPickup = method === 'pickup';
  const discount = Number(order.discount_total) || 0;
  const money = (value: unknown) => `GH₵${(Number(value) || 0).toFixed(2)}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12 text-center mb-8">
            {isPaid ? (
              <>
                <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-emerald-100 rounded-full">
                  <i className="ri-checkbox-circle-fill text-5xl text-emerald-700" aria-hidden></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Order confirmed</h1>
                <p className="text-lg text-gray-700 mb-8">
                  Thank you. Your payment came through and we have your order.
                </p>
              </>
            ) : verifying ? (
              <>
                <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                  <i className="ri-loader-4-line text-5xl text-gray-700 animate-spin" aria-hidden></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Confirming your payment</h1>
                <p className="text-lg text-gray-700 mb-8" role="status">
                  We are checking with the payment provider. This can take a minute. Please keep this page open.
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-amber-100 rounded-full">
                  <i className="ri-time-line text-5xl text-amber-700" aria-hidden></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Payment not received yet</h1>
                <p className="text-lg text-gray-700 mb-6">
                  Your order is saved but it is not confirmed until it is paid. If you approved the payment on your
                  phone, it may still be on its way: check again in a moment. Otherwise you can pay now.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                  <Link
                    href={`/pay/${order.id}`}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
                  >
                    Pay now
                  </Link>
                  <button
                    type="button"
                    onClick={() => verifyPayment(order.order_number, order)}
                    className="border-2 border-gray-300 hover:border-gray-400 text-gray-800 px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
                  >
                    Check again
                  </button>
                </div>
              </>
            )}

            <dl className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8 grid sm:grid-cols-2 gap-6 text-center">
              <div>
                <dt className="text-sm text-gray-600 mb-1">Order number</dt>
                <dd className="text-lg font-bold text-gray-900 break-all">{order.order_number}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600 mb-1">Order date</dt>
                <dd className="text-lg font-bold text-gray-900">{orderDate}</dd>
              </div>
            </dl>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/order-tracking"
                className={`${isPaid ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'border-2 border-gray-300 hover:border-gray-400 text-gray-800'} px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap`}
              >
                <i className="ri-map-pin-time-line mr-2" aria-hidden></i>
                Track this order
              </Link>
              <Link
                href="/shop"
                className="border-2 border-gray-300 hover:border-gray-400 text-gray-800 px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
              >
                <i className="ri-shopping-bag-line mr-2" aria-hidden></i>
                Continue shopping
              </Link>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order items</h2>
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
                      {item.variant_name && <p className="text-xs text-gray-600">Size: {item.variant_name}</p>}
                    </div>
                    <p className="font-bold text-gray-900">{money(item.unit_price)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex justify-between text-sm text-gray-700 mb-2">
                  <span>Subtotal</span>
                  <span>{money(order.subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-gray-700 mb-2">
                    <span>Coupon{order.metadata?.coupon_code ? ` (${order.metadata.coupon_code})` : ''}</span>
                    <span>-{money(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 text-sm text-gray-700 mb-2">
                  <span>Delivery</span>
                  <span className="text-right">
                    {Number(order.shipping_total) > 0
                      ? money(order.shipping_total)
                      : isPickup
                        ? 'Free store pickup'
                        : method
                          ? 'We will confirm the cost with you'
                          : 'Pickup is free. Doorstep cost is confirmed with you.'}
                  </span>
                </div>

                <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>{isPaid ? 'Total paid' : 'Total to pay'}</span>
                  <span>{money(order.total)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{isPickup ? 'Your details' : 'Delivery details'}</h2>
              <div className="space-y-3">
                {order.shipping_address && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Name</p>
                      <p className="font-semibold text-gray-900">
                        {order.shipping_address.firstName} {order.shipping_address.lastName}
                      </p>
                    </div>
                    {(order.shipping_address.address || order.shipping_address.city) && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Address</p>
                        <p className="text-gray-900">{order.shipping_address.address}</p>
                        <p className="text-gray-900">
                          {[order.shipping_address.city, order.shipping_address.region].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Phone</p>
                      <p className="text-gray-900">{order.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Email</p>
                      <p className="text-gray-900 break-all">{order.email}</p>
                    </div>
                  </>
                )}
              </div>

              {isPaid && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">What happens next</h3>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li className="flex items-start gap-3">
                      <i className="ri-message-2-line text-gray-900 mt-0.5" aria-hidden></i>
                      <span>We send your confirmation to {order.email} and by text to {order.phone}.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <i className={`${isPickup ? 'ri-store-2-line' : 'ri-truck-line'} text-gray-900 mt-0.5`} aria-hidden></i>
                      <span>
                        {isPickup
                          ? 'We will let you know when your order is ready to collect.'
                          : method
                            ? 'We will contact you to agree the delivery cost and time.'
                            : 'We will contact you about pickup or delivery.'}
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-700 mb-4">Need help with your order?</p>
            <Link href="/contact" className="text-gray-900 underline font-semibold whitespace-nowrap">
              Contact us
            </Link>
          </div>
        </div>
      </section>
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
