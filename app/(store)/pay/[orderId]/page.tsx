'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function PaymentPage() {
  usePageTitle('Complete Payment');
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfStockItems, setOutOfStockItems] = useState<string[]>([]);
  const hubtelEnabled = process.env.NEXT_PUBLIC_ENABLE_HUBTEL === 'true';
  const [paymentMethod, setPaymentMethod] = useState<'hubtel' | 'moolre'>(
    hubtelEnabled ? 'hubtel' : 'moolre',
  );

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/storefront/pay/${orderId}`);
        const data = await res.json();

        if (!res.ok || data.error) {
          setError(data.error || 'Order not found. Please check your link and try again.');
          setLoading(false);
          return;
        }

        setOrder(data.order);

        const stored = data.order?.metadata?.payment_method;
        if (stored === 'hubtel' && hubtelEnabled) setPaymentMethod('hubtel');
        else if (stored === 'moolre') setPaymentMethod('moolre');

        // If already paid, redirect to success page
        if (data.order.payment_status === 'paid') {
          router.push(`/order-success?order=${data.order.order_number}`);
          return;
        }

        // Stock validation result from server
        if (!data.stockValid && data.outOfStockItems?.length > 0) {
          setOutOfStockItems(data.outOfStockItems);
        }

      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Failed to load order details. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    if (orderId) fetchOrder();
  }, [orderId, router]);

  const handlePayNow = async () => {
    if (!order) return;
    setProcessing(true);
    setError(null);

    try {
      // Re-validate stock right before payment
      const checkRes = await fetch(`/api/storefront/pay/${orderId}`);
      const checkData = await checkRes.json();

      if (!checkData.stockValid && checkData.outOfStockItems?.length > 0) {
        setOutOfStockItems(checkData.outOfStockItems);
        setProcessing(false);
        return;
      }

      const endpoint =
        paymentMethod === 'hubtel' ? '/api/payment/hubtel' : '/api/payment/moolre';

      const paymentRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.order_number,
          amount: order.total,
          customerEmail: order.email
        })
      });

      const paymentResult = await paymentRes.json();

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Payment initialization failed');
      }

      window.location.href = paymentResult.url;

    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initialize payment. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
            <i className="ri-error-warning-line text-4xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors"
          >
            <i className="ri-home-line mr-2"></i>
            Go to Homepage
          </Link>
        </div>
      </main>
    );
  }

  const shippingAddress = order?.shipping_address || {};
  const customerName = order?.metadata?.first_name || shippingAddress.firstName || 'Customer';
  const hasStockIssue = outOfStockItems.length > 0;

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-['Pacifico'] text-gray-900">Freby’s Fashion GH</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="text-gray-600 mt-2">Hi {customerName}, your order is waiting for payment.</p>
        </div>

        {/* Out-of-stock warning */}
        {hasStockIssue && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-fill text-2xl text-red-500 mt-0.5 flex-shrink-0"></i>
              <div>
                <p className="font-semibold text-red-800 mb-1">Some items are no longer available</p>
                <p className="text-sm text-red-700 mb-3">
                  Unfortunately the following item{outOfStockItems.length > 1 ? 's are' : ' is'} out of stock and your order cannot be completed:
                </p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  {outOfStockItems.map((name, i) => (
                    <li key={i} className="text-sm font-medium text-red-800">{name}</li>
                  ))}
                </ul>
                <p className="text-sm text-red-700">
                  Please <Link href="/contact" className="underline font-semibold">contact us</Link> or{' '}
                  <Link href="/shop" className="underline font-semibold">browse other products</Link>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Summary Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <span className="text-sm text-gray-500">Order Number</span>
            <span className="font-semibold text-gray-900">{order?.order_number}</span>
          </div>

          {/* Order items list */}
          {order?.order_items?.length > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-100 space-y-2">
              {order.order_items.map((item: any) => {
                const isOOS = outOfStockItems.some(name =>
                  name.toLowerCase().includes(item.product_name?.toLowerCase())
                );
                return (
                  <div key={item.id} className={`flex justify-between text-sm ${isOOS ? 'text-red-500' : 'text-gray-700'}`}>
                    <span className="flex items-center gap-1">
                      {isOOS && <i className="ri-close-circle-fill text-red-400"></i>}
                      {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ''} × {item.quantity}
                    </span>
                    <span>GH₵ {(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">GH₵ {order?.subtotal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Shipping</span>
              <span className="text-gray-900">GH₵ {order?.shipping_total?.toFixed(2)}</span>
            </div>
            {order?.discount_total > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-gray-700">-GH₵ {order?.discount_total?.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-gray-900">GH₵ {order?.total?.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment status banners */}
        {!hasStockIssue && order?.payment_status === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-time-line text-xl text-yellow-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Payment Pending</p>
                <p className="text-sm text-yellow-700 mt-1">Complete your payment to confirm your order.</p>
              </div>
            </div>
          </div>
        )}

        {!hasStockIssue && order?.payment_status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-red-800">Payment Failed</p>
                <p className="text-sm text-red-700 mt-1">Your previous payment attempt was unsuccessful. Please try again.</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {hubtelEnabled && !hasStockIssue && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Payment Method</h2>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'hubtel' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="payMethod"
                  value="hubtel"
                  checked={paymentMethod === 'hubtel'}
                  onChange={() => setPaymentMethod('hubtel')}
                  className="w-5 h-5 text-emerald-700 mt-0.5"
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Mobile Money</p>
                  <p className="text-xs text-gray-600">MTN, Telecel or AirtelTigo via Hubtel</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'moolre' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="payMethod"
                  value="moolre"
                  checked={paymentMethod === 'moolre'}
                  onChange={() => setPaymentMethod('moolre')}
                  className="w-5 h-5 text-emerald-700 mt-0.5"
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Mobile Money 2</p>
                  <p className="text-xs text-gray-600">Backup gateway via Moolre</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Pay Button — disabled when out of stock */}
        {!hasStockIssue ? (
          <button
            onClick={handlePayNow}
            disabled={processing}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-semibold text-lg transition-colors disabled:opacity-70 flex items-center justify-center cursor-pointer"
          >
            {processing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <i className="ri-secure-payment-line mr-2"></i>
                Pay GH₵ {order?.total?.toFixed(2)} with {paymentMethod === 'hubtel' ? 'Hubtel' : 'Moolre'}
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <Link
              href="/shop"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center"
            >
              <i className="ri-store-2-line mr-2"></i>
              Browse Other Products
            </Link>
            <Link
              href="/contact"
              className="w-full bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center"
            >
              <i className="ri-customer-service-2-line mr-2"></i>
              Contact Support
            </Link>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center">
            <i className="ri-lock-line mr-1"></i>
            Secure payment powered by {paymentMethod === 'hubtel' ? 'Hubtel' : 'Moolre'}
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Having issues? <Link href="/contact" className="text-gray-900 hover:underline">Contact Support</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
