'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { moneyLabel } from '@/lib/format-money';

type Source = 'phone' | 'whatsapp' | 'walk_in' | 'other';
type PaymentAction =
  | 'unpaid'
  | 'send_payment_link'
  | 'mark_paid_cash'
  | 'mark_paid_momo'
  | 'deposit_cash';

type LineItem = {
  key: string;
  type: 'custom' | 'catalog';
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: string;
  fabric: string;
  color: string;
  size: string;
  style: string;
  notes: string;
};

type CustomerRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  price?: number | string;
  quantity?: number;
  product_images?: { url: string }[];
};

const emptyLine = (): LineItem => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: 'custom',
  product_id: null,
  product_name: '',
  quantity: 1,
  unit_price: '',
  fabric: '',
  color: '',
  size: '',
  style: '',
  notes: '',
});

const REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Western',
  'Eastern',
  'Central',
  'Northern',
  'Volta',
  'Upper East',
  'Upper West',
  'Bono',
  'Bono East',
  'Ahafo',
  'Western North',
  'Oti',
  'North East',
  'Savannah',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (order: any) => void;
}

export default function NewPreorderModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source>('whatsapp');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productPickerFor, setProductPickerFor] = useState<string | null>(null);

  const [shippingMethod, setShippingMethod] = useState<'pickup' | 'doorstep'>('pickup');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('Greater Accra');

  const [promisedDate, setPromisedDate] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [paymentAction, setPaymentAction] = useState<PaymentAction>('send_payment_link');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPct, setDepositPct] = useState<50 | 100 | 'custom'>(50);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setSource('whatsapp');
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setCustomerSearch('');
    setSelectedCustomerId(null);
    setItems([emptyLine()]);
    setProductQuery('');
    setProductPickerFor(null);
    setShippingMethod('pickup');
    setAddress('');
    setCity('');
    setRegion('Greater Accra');
    setPromisedDate('');
    setCustomerNotes('');
    setAdminNotes('');
    setPaymentAction('send_payment_link');
    setDepositAmount('');
    setDepositPct(50);
    setError(null);
    setResultMsg(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase
          .from('customers')
          .select('id, full_name, email, phone')
          .order('full_name')
          .limit(300);
        setCustomers((data as CustomerRow[]) || []);
      } catch {
        setCustomers([]);
      }
      try {
        const res = await fetch('/api/admin/products?fields=inventory&limit=500', {
          credentials: 'include',
        });
        const json = await res.json();
        setProducts(Array.isArray(json) ? json : json.products || json.items || []);
      } catch {
        setProducts([]);
      }
    })();
  }, [open, reset]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q)
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => (p.name || '').toLowerCase().includes(q)).slice(0, 12);
  }, [products, productQuery]);

  const subtotal = useMemo(
    () =>
      items.reduce((s, it) => {
        const unit = Number(it.unit_price) || 0;
        return s + unit * Math.max(1, it.quantity || 1);
      }, 0),
    [items]
  );

  useEffect(() => {
    if (depositPct === 50) setDepositAmount((subtotal * 0.5).toFixed(2));
    else if (depositPct === 100) setDepositAmount(subtotal.toFixed(2));
  }, [depositPct, subtotal]);

  const pickCustomer = (c: CustomerRow) => {
    setSelectedCustomerId(c.id);
    const parts = (c.full_name || '').trim().split(/\s+/);
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setPhone(c.phone || '');
    setEmail(c.email && !c.email.endsWith('.local') ? c.email : '');
    setCustomerSearch(c.full_name || c.phone || '');
  };

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addCustomLine = () => setItems((prev) => [...prev, emptyLine()]);

  const removeLine = (key: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));
  };

  const applyCatalogProduct = (lineKey: string, p: ProductRow) => {
    updateItem(lineKey, {
      type: 'catalog',
      product_id: p.id,
      product_name: p.name,
      unit_price: String(Number(p.price) || ''),
    });
    setProductPickerFor(null);
    setProductQuery('');
  };

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!firstName.trim() && !lastName.trim()) return 'Enter the customer name';
      if (phone.replace(/\D/g, '').length < 9) return 'Enter a valid Ghana phone number';
    }
    if (s === 2) {
      for (const it of items) {
        if (!it.product_name.trim()) return 'Every item needs a name or description';
        if (!(Number(it.unit_price) > 0)) return `Set a price for “${it.product_name || 'item'}”`;
      }
    }
    if (s === 3 && shippingMethod === 'doorstep') {
      if (!address.trim() || !city.trim()) return 'Delivery address and city are required';
    }
    if (s === 4 && paymentAction === 'deposit_cash') {
      const d = Number(depositAmount);
      if (!(d > 0) || d > subtotal) return 'Deposit must be greater than 0 and not exceed the total';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(4, s + 1));
  };

  const handleSubmit = async () => {
    const err = validateStep(4) || validateStep(1) || validateStep(2) || validateStep(3);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    setResultMsg(null);
    try {
      const res = await fetch('/api/admin/preorders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          paymentAction,
          depositAmount: paymentAction === 'deposit_cash' ? Number(depositAmount) : 0,
          shippingMethod,
          promisedDate: promisedDate || null,
          customerNotes: customerNotes || null,
          adminNotes: adminNotes || null,
          customer: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            customerId: selectedCustomerId,
          },
          address: {
            address: address.trim(),
            city: city.trim(),
            region,
          },
          items: items.map((it) => ({
            type: it.type,
            product_id: it.product_id,
            product_name: it.product_name.trim(),
            quantity: Math.max(1, it.quantity || 1),
            unit_price: Number(it.unit_price),
            fabric: it.fabric.trim() || null,
            color: it.color.trim() || null,
            size: it.size.trim() || null,
            style: it.style.trim() || null,
            notes: it.notes.trim() || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create preorder');
      setResultMsg(json.message || 'Preorder created');
      onCreated(json.order);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (e: any) {
      setError(e?.message || 'Failed to create preorder');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const sourceOptions: { id: Source; label: string; icon: string; hint: string }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: 'ri-whatsapp-line', hint: 'Customer messaged' },
    { id: 'phone', label: 'Phone call', icon: 'ri-phone-line', hint: 'Customer called in' },
    { id: 'walk_in', label: 'Walk-in', icon: 'ri-store-2-line', hint: 'In-store request' },
    { id: 'other', label: 'Other', icon: 'ri-more-line', hint: 'Referral / other' },
  ];

  const payOptions: { id: PaymentAction; label: string; icon: string; hint: string }[] = [
    {
      id: 'send_payment_link',
      label: 'Send payment link',
      icon: 'ri-link',
      hint: 'SMS/email Hubtel pay page for full amount',
    },
    {
      id: 'mark_paid_cash',
      label: 'Paid in cash (full)',
      icon: 'ri-money-cny-circle-line',
      hint: 'Record full payment now — goes to production',
    },
    {
      id: 'mark_paid_momo',
      label: 'Paid via MoMo (full)',
      icon: 'ri-smartphone-line',
      hint: 'Already paid on phone — mark paid',
    },
    {
      id: 'deposit_cash',
      label: 'Cash deposit',
      icon: 'ri-percent-line',
      hint: 'Part paid now; balance still due',
    },
    {
      id: 'unpaid',
      label: 'Save unpaid only',
      icon: 'ri-draft-line',
      hint: 'No payment yet — send link later',
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full sm:max-w-3xl max-h-[94vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Staff preorder</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">New phone / custom preorder</h2>
            <p className="text-sm text-gray-600 mt-1">
              Capture WhatsApp, call, walk-in, and made-to-order dresses so they count in sales — not only the book.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                    step === n
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : step > n
                        ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-white border-gray-200 text-gray-400'
                  }`}
                >
                  {step > n ? <i className="ri-check-line" /> : n}
                </div>
                {n < 4 && <div className={`h-0.5 flex-1 ${step > n ? 'bg-amber-300' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {step === 1 && 'Customer & source'}
            {step === 2 && 'What to make / preorder'}
            {step === 3 && 'Fulfillment details'}
            {step === 4 && 'Payment & create'}
          </p>
        </div>

        <div className="px-5 pb-5 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {resultMsg && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {resultMsg}
            </div>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">How did this order come in?</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {sourceOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSource(o.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        source === o.id
                          ? 'border-amber-600 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <i className={`${o.icon} text-lg ${source === o.id ? 'text-amber-700' : 'text-gray-500'}`} />
                      <p className="font-semibold text-sm text-gray-900 mt-1">{o.label}</p>
                      <p className="text-[11px] text-gray-500">{o.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Find existing customer</label>
                <input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomerId(null);
                  }}
                  placeholder="Search name, phone, or email…"
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
                {filteredCustomers.length > 0 && customerSearch.trim() && (
                  <ul className="mt-2 border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => pickCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm"
                        >
                          <span className="font-medium text-gray-900">{c.full_name || 'No name'}</span>
                          <span className="text-gray-500 ml-2">{c.phone}</span>
                          {c.email && <span className="block text-xs text-gray-400">{c.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First name *</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone *</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0XX XXX XXXX"
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email (optional)</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="For receipt / payment email"
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">Items to produce</h3>
                  <p className="text-xs text-gray-500">
                    Custom dress (not on site) or a catalog style that’s out of stock.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addCustomLine}
                  className="text-sm font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1"
                >
                  <i className="ri-add-line" /> Add item
                </button>
              </div>

              <div className="space-y-4">
                {items.map((it, idx) => (
                  <div key={it.key} className="rounded-xl border-2 border-gray-200 p-4 space-y-3 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-900">Item {idx + 1}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(it.key, { type: 'custom', product_id: null })
                            }
                            className={`px-2.5 py-1 ${
                              it.type === 'custom' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600'
                            }`}
                          >
                            Custom
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateItem(it.key, { type: 'catalog' });
                              setProductPickerFor(it.key);
                            }}
                            className={`px-2.5 py-1 ${
                              it.type === 'catalog' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600'
                            }`}
                          >
                            From catalog
                          </button>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(it.key)}
                            className="text-red-600 hover:bg-red-50 w-8 h-8 rounded-lg"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        )}
                      </div>
                    </div>

                    {productPickerFor === it.key && (
                      <div className="rounded-lg border border-amber-200 bg-white p-3">
                        <input
                          value={productQuery}
                          onChange={(e) => setProductQuery(e.target.value)}
                          placeholder="Search products…"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
                          autoFocus
                        />
                        <ul className="max-h-36 overflow-y-auto divide-y">
                          {filteredProducts.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => applyCatalogProduct(it.key, p)}
                                className="w-full text-left px-2 py-2 hover:bg-amber-50 text-sm flex justify-between gap-2"
                              >
                                <span className="font-medium text-gray-900">{p.name}</span>
                                <span className="text-gray-600 whitespace-nowrap">
                                  {moneyLabel(p.price)}
                                  {Number(p.quantity) === 0 && (
                                    <span className="ml-1 text-amber-700 text-xs">OOS</span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                          {filteredProducts.length === 0 && (
                            <li className="px-2 py-3 text-sm text-gray-500">No products found</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {it.type === 'custom' ? 'Dress / item description *' : 'Product name *'}
                      </label>
                      <input
                        value={it.product_name}
                        onChange={(e) => updateItem(it.key, { product_name: e.target.value })}
                        placeholder={
                          it.type === 'custom'
                            ? 'e.g. Kente peplum gown with slit'
                            : 'Select from catalog or type name'
                        }
                        className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Size</label>
                        <input
                          value={it.size}
                          onChange={(e) => updateItem(it.key, { size: e.target.value })}
                          placeholder="M / 12 / custom"
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Color</label>
                        <input
                          value={it.color}
                          onChange={(e) => updateItem(it.key, { color: e.target.value })}
                          placeholder="Wine red"
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Fabric</label>
                        <input
                          value={it.fabric}
                          onChange={(e) => updateItem(it.key, { fabric: e.target.value })}
                          placeholder="Ankara / silk"
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Style</label>
                        <input
                          value={it.style}
                          onChange={(e) => updateItem(it.key, { style: e.target.value })}
                          placeholder="A-line, fitted…"
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(it.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                          Unit price (GH₵) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(it.key, { unit_price: e.target.value })}
                          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Production notes for this item
                      </label>
                      <textarea
                        value={it.notes}
                        onChange={(e) => updateItem(it.key, { notes: e.target.value })}
                        rows={2}
                        placeholder="Measurements, lining, sleeve length, customer photo reference…"
                        className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gray-900 text-white px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-300">Order subtotal</span>
                <span className="text-xl font-bold">{moneyLabel(subtotal)}</span>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Fulfillment</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'pickup' as const, label: 'Store pickup', icon: 'ri-store-2-line' },
                    { id: 'doorstep' as const, label: 'Doorstep delivery', icon: 'ri-truck-line' },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setShippingMethod(o.id)}
                      className={`p-3 rounded-xl border-2 text-left ${
                        shippingMethod === o.id
                          ? 'border-amber-600 bg-amber-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <i className={`${o.icon} text-lg`} />
                      <p className="font-semibold text-sm mt-1">{o.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {shippingMethod === 'doorstep' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Address *</label>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">City *</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Region</label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Promised ready date (optional)
                </label>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Default production window is 3–4 business days.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes from customer</label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  placeholder="Occasion date, preferences…"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Internal staff notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
                  placeholder="Who took the order, fabric source, etc."
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
                <p>
                  <span className="text-gray-500">Customer:</span>{' '}
                  <span className="font-semibold">
                    {firstName} {lastName}
                  </span>{' '}
                  · {phone}
                </p>
                <p>
                  <span className="text-gray-500">Source:</span>{' '}
                  <span className="font-semibold capitalize">{source.replace('_', ' ')}</span>
                </p>
                <p>
                  <span className="text-gray-500">Items:</span>{' '}
                  <span className="font-semibold">{items.length}</span> · Total{' '}
                  <span className="font-bold text-amber-800">{moneyLabel(subtotal)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Payment</label>
                <div className="space-y-2">
                  {payOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPaymentAction(o.id)}
                      className={`w-full p-3 rounded-xl border-2 text-left flex gap-3 ${
                        paymentAction === o.id
                          ? 'border-amber-600 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <i className={`${o.icon} text-xl mt-0.5 text-amber-700`} />
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{o.label}</p>
                        <p className="text-xs text-gray-500">{o.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {paymentAction === 'deposit_cash' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-900">Deposit amount</p>
                  <div className="flex flex-wrap gap-2">
                    {([50, 100, 'custom'] as const).map((p) => (
                      <button
                        key={String(p)}
                        type="button"
                        onClick={() => setDepositPct(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          depositPct === p
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white border-amber-200 text-amber-900'
                        }`}
                      >
                        {p === 'custom' ? 'Custom' : `${p}%`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositPct('custom');
                      setDepositAmount(e.target.value);
                    }}
                    className="w-full sm:w-48 px-3 py-2 border-2 border-amber-300 rounded-lg text-sm bg-white"
                  />
                  <p className="text-xs text-amber-800">
                    Balance due after deposit:{' '}
                    <strong>
                      {moneyLabel(Math.max(0, subtotal - (Number(depositAmount) || 0)))}
                    </strong>
                    . Collect balance in shop later, then Mark as Paid on the order.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Your login is stamped as the staff who created this preorder. It appears under Preorders and
                counts in End of Day once fully paid.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={submitting || step === 1}
            onClick={() => {
              setError(null);
              setStep((s) => Math.max(1, s - 1));
            }}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-40"
          >
            Back
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <i className="ri-loader-4-line animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <i className="ri-check-line" /> Create preorder
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
