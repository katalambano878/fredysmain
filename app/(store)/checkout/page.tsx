'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import {
  addressToShippingData,
  shippingDataToAddressInput,
  type AddressLike,
} from '@/lib/address-map';

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [saveAddress, setSaveAddress] = useState(true);
  const [savePayment, setSavePayment] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [savedAddresses, setSavedAddresses] = useState<AddressLike[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const { getToken, verifying } = useRecaptcha();

  const [shippingData, setShippingData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: ''
  });

  const regionCities: Record<string, string[]> = {
    'Greater Accra': ['Accra', 'Tema', 'Madina', 'Adenta', 'Ashaiman', 'Teshie', 'Nungua', 'Lashibi', 'Sakumono', 'Kasoa', 'Weija', 'Dansoman', 'Kaneshie', 'Osu', 'Labadi', 'East Legon', 'Spintex', 'Airport Residential', 'Dzorwulu', 'Achimota', 'Dome', 'Haatso', 'Kwabenya', 'Dodowa', 'Prampram', 'Ningo'],
    'Ashanti': ['Kumasi', 'Obuasi', 'Ejisu', 'Konongo', 'Mampong', 'Bekwai', 'Agogo', 'Mankranso', 'Offinso', 'Nkawie', 'Juaso', 'New Edubiase'],
    'Western': ['Takoradi', 'Sekondi', 'Tarkwa', 'Prestea', 'Axim', 'Elubo', 'Half Assini', 'Agona Nkwanta', 'Shama'],
    'Central': ['Cape Coast', 'Winneba', 'Kasoa', 'Mankessim', 'Saltpond', 'Dunkwa-on-Offin', 'Elmina', 'Agona Swedru', 'Assin Fosu', 'Buduburam'],
    'Eastern': ['Koforidua', 'Nkawkaw', 'Nsawam', 'Suhum', 'Akosombo', 'Akim Oda', 'Kade', 'Aburi', 'Kibi', 'Somanya', 'Donkorkrom'],
    'Northern': ['Tamale', 'Yendi', 'Savelugu', 'Damongo', 'Bimbilla', 'Salaga', 'Tolon'],
    'Volta': ['Ho', 'Keta', 'Hohoe', 'Kpandu', 'Aflao', 'Anloga', 'Sogakope', 'Akatsi', 'Denu'],
    'Upper East': ['Bolgatanga', 'Navrongo', 'Bawku', 'Zebilla', 'Paga', 'Sandema'],
    'Upper West': ['Wa', 'Tumu', 'Nandom', 'Lawra', 'Jirapa', 'Nadowli'],
    'Brong-Ahafo': ['Sunyani', 'Techiman', 'Berekum', 'Dormaa Ahenkro', 'Wenchi', 'Kintampo', 'Nkoranza', 'Atebubu'],
    'Ahafo': ['Goaso', 'Bechem', 'Duayaw-Nkwanta', 'Kukuom', 'Hwidiem'],
    'Bono': ['Sunyani', 'Berekum', 'Dormaa Ahenkro', 'Wenchi', 'Odumase'],
    'Bono East': ['Techiman', 'Kintampo', 'Nkoranza', 'Atebubu', 'Yeji', 'Prang'],
    'North East': ['Nalerigu', 'Gambaga', 'Walewale', 'Chereponi'],
    'Savannah': ['Damongo', 'Bole', 'Salaga', 'Buipe', 'Sawla'],
    'Oti': ['Dambai', 'Jasikan', 'Kadjebi', 'Nkwanta', 'Kpassa'],
    'Western North': ['Sefwi Wiawso', 'Bibiani', 'Juaboso', 'Enchi', 'Dadieso'],
  };

  const ghanaRegions = Object.keys(regionCities);
  const availableCities = shippingData.region ? regionCities[shippingData.region] || [] : [];

  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const hubtelEnabled = process.env.NEXT_PUBLIC_ENABLE_HUBTEL === 'true';
  const [paymentMethod, setPaymentMethod] = useState(hubtelEnabled ? 'hubtel' : 'moolre');
  const [errors, setErrors] = useState<any>({});



  async function authFetch(path: string, init?: RequestInit & { json?: unknown }) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    };
    const res = await fetch(path, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Check auth, saved addresses, and cart
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setCheckoutType('account');
        const email = session.user.email || '';
        setShippingData(prev => ({ ...prev, email }));

        try {
          const addresses = await authFetch('/api/addresses') as AddressLike[];
          const list = Array.isArray(addresses) ? addresses : [];
          setSavedAddresses(list);
          const preferred = list.find((a) => a.is_default) || list[0];
          if (preferred) {
            setSelectedAddressId(preferred.id);
            setShippingData(addressToShippingData(preferred, email));
            setSaveAddress(false);
          }
        } catch {
          /* addresses API optional until configured */
        }
      }
    }
    checkUser();

    const timer = setTimeout(() => {
      if (cart.length === 0 && !isLoading) {
        // router.push('/cart');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, router, isLoading]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Calculate Totals
  const subtotal = cartSubtotal;
  const shippingCost = 0;
  const tax = 0;
  const total = subtotal + shippingCost + tax;
  const hasPreorderItems = cart.some((i) => i.isPreorder);

  const validateShipping = () => {
    const newErrors: any = {};
    if (!shippingData.firstName) newErrors.firstName = 'First name is required';
    if (!shippingData.lastName) newErrors.lastName = 'Last name is required';
    if (!shippingData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(shippingData.email)) newErrors.email = 'Invalid email';
    if (!shippingData.phone) {
      newErrors.phone = 'Phone number is required';
    } else {
      const digits = shippingData.phone.replace(/\D/g, '');
      const valid =
        (digits.length === 10 && digits.startsWith('0')) ||
        (digits.length === 12 && digits.startsWith('233'));
      if (!valid) {
        newErrors.phone = 'Enter a valid 10-digit Ghana number (e.g. 0551234567)';
      }
    }
    if (!shippingData.address) newErrors.address = 'Address is required';
    if (!shippingData.city) newErrors.city = 'City is required';
    if (!shippingData.region) newErrors.region = 'Region is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToDelivery = () => {
    if (validateShipping()) {
      setCurrentStep(2);
    }
  };

  const handleContinueToPayment = async () => {
    await handlePlaceOrder();
  };



  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setIsLoading(true);

    const isHuman = await getToken('checkout');
    if (!isHuman) {
      alert('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const trackingId = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      const trackingNumber = `SLI-${trackingId}`;

      // Normalize phone to 0XXXXXXXXX format
      const phoneDigits = shippingData.phone.replace(/\D/g, '');
      const normalizedPhone = phoneDigits.length === 12 && phoneDigits.startsWith('233')
        ? '0' + phoneDigits.slice(3)
        : phoneDigits;

      // 1. Resolve product IDs and build items
      const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      
      const productIds = cart.map(item => item.id).filter(id => isValidUUID(id));
      const { data: productsData } = productIds.length > 0
        ? await supabase.from('products').select('id, metadata').in('id', productIds)
        : { data: [] };
      const productMetaMap = new Map(
        (productsData || []).map((p: any) => [p.id, { metadata: p.metadata }])
      );
      
      const orderItems = [];
      for (const item of cart) {
        let productId = item.id;
        
        if (!isValidUUID(productId)) {
          const { data: product } = await supabase
            .from('products')
            .select('id, metadata')
            .or(`slug.eq.${productId},id.eq.${productId}`)
            .single();
          
          if (product) {
            productId = product.id;
            productMetaMap.set(product.id, { metadata: product.metadata });
          } else {
            throw new Error(`Product not found: ${item.name}. Please remove it from your cart and try again.`);
          }
        }
        
        const prodInfo = productMetaMap.get(productId);
        const prodMeta = prodInfo?.metadata;

        orderItems.push({
          product_id: productId,
          product_name: item.name,
          variant_name: item.variant,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
          is_preorder: !!item.isPreorder,
          metadata: {
            image: item.image,
            slug: item.slug,
            preorder_shipping: prodMeta?.preorder_shipping || null,
            is_preorder: !!item.isPreorder,
          }
        });
      }

      const orderIsPreorder = orderItems.some((i) => i.is_preorder);

      // 2. Create order + items via secure server API
      const createRes = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderData: {
            order_number: orderNumber,
            user_id: user?.id || null,
            email: shippingData.email,
            phone: normalizedPhone,
            status: 'pending',
            payment_status: 'pending',
            currency: 'GHS',
            subtotal: subtotal,
            tax_total: tax,
            shipping_total: shippingCost,
            discount_total: 0,
            total: total,
            shipping_method: deliveryMethod,
            payment_method: paymentMethod,
            shipping_address: shippingData,
            billing_address: shippingData,
            is_preorder: orderIsPreorder,
            metadata: {
              guest_checkout: !user,
              first_name: shippingData.firstName,
              last_name: shippingData.lastName,
              tracking_number: trackingNumber,
              is_preorder: orderIsPreorder,
            }
          },
          items: orderItems
        })
      });
      
      const createResult = await createRes.json();
      if (!createRes.ok || !createResult.order) {
        throw new Error(createResult.error || 'Failed to create order');
      }
      const order = createResult.order;

      if (user && (saveAddress || savedAddresses.length === 0)) {
        try {
          await authFetch('/api/addresses', {
            method: 'POST',
            json: shippingDataToAddressInput(shippingData, {
              is_default: savedAddresses.length === 0 || saveAddress,
            }),
          });
        } catch (addrErr) {
          console.warn('Could not save address', addrErr);
        }
      }

      // 3. Handle Payment Redirects or Completion
      if (paymentMethod === 'hubtel' || paymentMethod === 'moolre') {
        try {
          const endpoint =
            paymentMethod === 'hubtel' ? '/api/payment/hubtel' : '/api/payment/moolre';

          const paymentRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: orderNumber,
              amount: total,
              customerEmail: shippingData.email
            })
          });

          const paymentResult = await paymentRes.json();

          if (!paymentResult.success) {
            throw new Error(paymentResult.message || 'Payment initialization failed');
          }

          clearCart();
          window.location.href = paymentResult.url;
          return;

        } catch (paymentErr: any) {
          console.error('Payment Error:', paymentErr);
          alert('Failed to initialize payment: ' + paymentErr.message);
          setIsLoading(false);
          return;
        }
      }

      // 4. Send Notifications (For COD or others)
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_created',
          payload: order
        })
      }).catch(err => console.error('Notification trigger error:', err));

      // 5. Clear Cart & Redirect (For COD)
      clearCart();
      router.push(
        `/order-success?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(shippingData.email)}`
      );

    } catch (err: any) {
      console.error('Checkout error:', err);
      alert('Failed to place order: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          <Link href="/shop" className="inline-block bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-emerald-800 transition-colors">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/cart" className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        {hasPreorderItems && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <i className="ri-time-line text-xl text-amber-700 mt-0.5"></i>
            <div className="text-sm">
              <p className="font-semibold text-amber-900">You are placing a preorder</p>
              <p className="text-amber-800 mt-1">
                Some items in your order are being produced on demand. Preorder items take <strong>3–4 business days</strong> to be ready before delivery or pickup. You&apos;ll receive an SMS update when they&apos;re ready.
              </p>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="mb-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Checkout As</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => !user && setCheckoutType('guest')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'guest'
                  ? 'border-emerald-700 bg-emerald-50'
                  : 'border-gray-200 hover:border-gray-300'
                  } ${user ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!!user}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-user-line text-3xl text-emerald-700"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'guest' ? 'border-emerald-700 bg-emerald-700' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'guest' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Guest Checkout</h3>
                <p className="text-sm text-gray-600">Quick checkout without creating an account</p>
                {user && <p className="text-xs text-emerald-600 mt-2">You are logged in</p>}
              </button>

              <button
                onClick={() => setCheckoutType('account')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'account'
                  ? 'border-emerald-700 bg-emerald-50'
                  : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-account-circle-line text-3xl text-emerald-700"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'account' ? 'border-emerald-700 bg-emerald-700' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'account' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{user ? 'My Account' : 'Create Account'}</h3>
                <p className="text-sm text-gray-600">
                  {user ? `Logged in as ${user.email}` : 'Save info, track orders & earn loyalty points'}
                </p>
              </button>
            </div>
          </div>
        )}

        <CheckoutSteps currentStep={currentStep} />

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Shipping Information</h2>

                  <div className="space-y-4">
                    {user && savedAddresses.length > 0 && (
                      <div className="space-y-3 pb-4 border-b border-gray-200">
                        <p className="text-sm font-semibold text-gray-900">Saved addresses</p>
                        {savedAddresses.map((addr) => (
                          <label
                            key={addr.id}
                            className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer ${
                              selectedAddressId === addr.id
                                ? 'border-emerald-700 bg-emerald-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="savedAddress"
                              checked={selectedAddressId === addr.id}
                              onChange={() => {
                                setSelectedAddressId(addr.id);
                                setShippingData(
                                  addressToShippingData(addr, user.email || shippingData.email)
                                );
                              }}
                              className="mt-1 w-5 h-5 text-emerald-700"
                            />
                            <div className="text-sm">
                              <p className="font-semibold text-gray-900">{addr.full_name}</p>
                              <p className="text-gray-600">
                                {addr.address_line1}, {addr.city}, {addr.state}
                              </p>
                              <p className="text-gray-600">{addr.phone}</p>
                            </div>
                          </label>
                        ))}
                        <label
                          className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer ${
                            selectedAddressId === 'new'
                              ? 'border-emerald-700 bg-emerald-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="savedAddress"
                            checked={selectedAddressId === 'new'}
                            onChange={() => {
                              setSelectedAddressId('new');
                              setShippingData({
                                firstName: '',
                                lastName: '',
                                email: user.email || shippingData.email,
                                phone: '',
                                address: '',
                                city: '',
                                region: '',
                              });
                            }}
                            className="w-5 h-5 text-emerald-700"
                          />
                          <span className="text-sm font-semibold text-gray-900">Use a new address</span>
                        </label>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          First Name *
                        </label>
                        <input
                          type="text"
                          value={shippingData.firstName}
                          onChange={(e) => setShippingData({ ...shippingData, firstName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.firstName ? 'border-red-500' : 'border-gray-300'
                            }`}
                          placeholder="John"
                        />
                        {errors.firstName && <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          value={shippingData.lastName}
                          onChange={(e) => setShippingData({ ...shippingData, lastName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.lastName ? 'border-red-500' : 'border-gray-300'
                            }`}
                          placeholder="Doe"
                        />
                        {errors.lastName && <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={shippingData.email}
                        readOnly={!!user}
                        onChange={(e) => setShippingData({ ...shippingData, email: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.email ? 'border-red-500' : 'border-gray-300'
                          } ${user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        placeholder="you@example.com"
                      />
                      {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={shippingData.phone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9+\- ]/g, '');
                          if (val.replace(/\D/g, '').length <= 12) {
                            setShippingData({ ...shippingData, phone: val });
                          }
                        }}
                        maxLength={15}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.phone ? 'border-red-500' : 'border-gray-300'
                          }`}
                        placeholder="0551234567"
                      />
                      {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
                      {!errors.phone && shippingData.phone && (() => {
                        const d = shippingData.phone.replace(/\D/g, '');
                        const valid = (d.length === 10 && d.startsWith('0')) || (d.length === 12 && d.startsWith('233'));
                        if (valid) return <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><i className="ri-checkbox-circle-fill"></i> Valid phone number</p>;
                        if (d.length > 0 && d.length < 10) return <p className="text-xs text-amber-600 mt-1">{10 - d.length} more digit{10 - d.length > 1 ? 's' : ''} needed</p>;
                        return null;
                      })()}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Street Address *
                      </label>
                      <input
                        type="text"
                        value={shippingData.address}
                        onChange={(e) => setShippingData({ ...shippingData, address: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.address ? 'border-red-500' : 'border-gray-300'
                          }`}
                        placeholder="House number and street name"
                      />
                      {errors.address && <p className="text-sm text-red-600 mt-1">{errors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Region *
                        </label>
                        <select
                          value={shippingData.region}
                          onChange={(e) => setShippingData({ ...shippingData, region: e.target.value, city: '' })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white ${errors.region ? 'border-red-500' : 'border-gray-300'
                            }`}
                        >
                          <option value="">Select Region</option>
                          {ghanaRegions.map((region) => (
                            <option key={region} value={region}>{region}</option>
                          ))}
                        </select>
                        {errors.region && <p className="text-sm text-red-600 mt-1">{errors.region}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          City *
                        </label>
                        <select
                          value={shippingData.city}
                          onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                          disabled={!shippingData.region}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white ${errors.city ? 'border-red-500' : 'border-gray-300'
                            } ${!shippingData.region ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        >
                          <option value="">{shippingData.region ? 'Select City' : 'Select a region first'}</option>
                          {availableCities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                        {errors.city && <p className="text-sm text-red-600 mt-1">{errors.city}</p>}
                      </div>
                    </div>

                    {checkoutType === 'account' && (
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(e) => setSaveAddress(e.target.checked)}
                          className="w-5 h-5 text-emerald-700 rounded border-gray-300 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700">Save this address for future orders</span>
                      </label>
                    )}
                  </div>

                  <button
                    onClick={handleContinueToDelivery}
                    className="w-full mt-6 bg-emerald-700 hover:bg-emerald-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Continue to Delivery
                  </button>
                </div>


              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Method</h2>
                  <div className="space-y-4">
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'pickup' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="pickup"
                          checked={deliveryMethod === 'pickup'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-emerald-700"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Store Pickup</p>
                          <p className="text-sm text-gray-600">Pick up from our store — Ready in 24 hours</p>
                        </div>
                      </div>
                      <p className="font-bold text-emerald-700">FREE</p>
                    </label>

                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'doorstep' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="doorstep"
                          checked={deliveryMethod === 'doorstep'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-emerald-700"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Doorstep Delivery</p>
                          <p className="text-sm text-gray-600">We will contact you with the delivery cost</p>
                        </div>
                      </div>
                      <p className="font-semibold text-amber-600 text-sm">At a Cost</p>
                    </label>
                  </div>

                  {hubtelEnabled && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Payment Method</h3>
                      <p className="text-sm text-gray-600 mb-4">Choose how you&apos;d like to pay.</p>
                      <div className="space-y-3">
                        <label className={`flex items-start justify-between gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'hubtel' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'}`}>
                          <div className="flex items-start gap-3 flex-1">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value="hubtel"
                              checked={paymentMethod === 'hubtel'}
                              onChange={() => setPaymentMethod('hubtel')}
                              className="w-5 h-5 text-emerald-700 mt-0.5"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">Mobile Money</p>
                              <p className="text-sm text-gray-600">Pay with MTN, Telecel or AirtelTigo Mobile Money. Powered by Hubtel.</p>
                            </div>
                          </div>
                        </label>

                        {/* Mobile Money 2 (Moolre backup gateway) — disabled, Hubtel is primary
                        <label className={`flex items-start justify-between gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'moolre' ? 'border-emerald-700 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'}`}>
                          <div className="flex items-start gap-3 flex-1">
                            <input
                              type="radio"
                              name="paymentMethod"
                              value="moolre"
                              checked={paymentMethod === 'moolre'}
                              onChange={() => setPaymentMethod('moolre')}
                              className="w-5 h-5 text-emerald-700 mt-0.5"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">Mobile Money 2</p>
                              <p className="text-sm text-gray-600">Backup Mobile Money gateway powered by Moolre.</p>
                            </div>
                          </div>
                        </label>
                        */}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                    <button
                      onClick={() => setCurrentStep(1)}
                      disabled={isLoading}
                      className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleContinueToPayment}
                      disabled={isLoading}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : paymentMethod === 'hubtel' ? (
                        'Pay with Mobile Money'
                      ) : (
                        'Pay with Mobile Money 2'
                      )}
                    </button>
                  </div>
                </div>


              </>
            )}
          </div>

          <div className="lg:col-span-1">
            <OrderSummary
              items={cart}
              subtotal={subtotal}
              shipping={shippingCost}
              tax={tax}
              total={total}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
