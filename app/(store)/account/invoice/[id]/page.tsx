'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { asNumber, moneyLabel } from '@/lib/format-money';

function InvoiceContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params?.id || '');
  const autoPrint = searchParams.get('print') === 'true';

  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setError('Please sign in to view this invoice.');
          return;
        }

        const { data, error: qError } = await supabase
          .from('orders')
          .select('*, order_items (*)')
          .eq('id', id)
          .eq('user_id', session.user.id)
          .single();

        if (qError || !data) {
          setError('Invoice not found or you do not have access to this order.');
          return;
        }
        setOrder(data);
      } catch {
        setError('Could not load invoice.');
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  useEffect(() => {
    if (order && autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [order, autoPrint]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-emerald-700" />
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice unavailable</h1>
        <p className="text-gray-600 mb-6">{error || 'Order not found'}</p>
        <Link href="/account?tab=orders" className="text-emerald-700 font-semibold">
          Back to orders
        </Link>
      </main>
    );
  }

  const shipping = order.shipping_address || {};
  const items = order.order_items || [];
  const total = asNumber(order.total);

  return (
    <main className="min-h-screen bg-white text-gray-900 py-8 px-4 print:py-0">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <Link href="/account?tab=orders" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to orders
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold"
          >
            Print / Save PDF
          </button>
        </div>

        <div className="border border-gray-200 rounded-xl p-8 print:border-0 print:p-0">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <p className="text-2xl font-bold tracking-wide text-emerald-900">Freby&apos;s Fashion GH</p>
              <p className="text-sm text-gray-600">Kids ready-to-wear fashion</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-bold text-lg">Invoice</p>
              <p>{order.order_number}</p>
              <p className="text-gray-600">
                {new Date(order.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <p className="font-semibold mb-1">Bill to</p>
              <p>
                {shipping.firstName || shipping.full_name || ''} {shipping.lastName || ''}
              </p>
              <p>{order.email}</p>
              <p>{shipping.phone || order.phone}</p>
            </div>
            <div>
              <p className="font-semibold mb-1">Ship to</p>
              <p>{shipping.address || shipping.address_line1 || '—'}</p>
              <p>
                {[shipping.city, shipping.region || shipping.state].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>

          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="border-b border-gray-300 text-left">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">Qty</th>
                <th className="py-2 pr-2">Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-3 pr-2">
                    <p className="font-medium">{item.product_name}</p>
                    {item.variant_name ? (
                      <p className="text-gray-500 text-xs">{item.variant_name}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-2">{item.quantity}</td>
                  <td className="py-3 pr-2">{moneyLabel(item.unit_price)}</td>
                  <td className="py-3 text-right">
                    {moneyLabel(item.total_price ?? asNumber(item.unit_price) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-56 space-y-2 text-sm">
              <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-3">
                <span>Total</span>
                <span>{moneyLabel(total)}</span>
              </div>
              <p className="text-xs text-gray-500 capitalize">
                Status: {order.status} · Payment: {order.payment_status}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AccountInvoicePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-emerald-700" />
        </main>
      }
    >
      <InvoiceContent />
    </Suspense>
  );
}
