'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ProductSalesStats from './ProductSalesStats';

interface Order {
  id: string;
  order_number: string;
  email: string;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string;
  shipping_method: string;
  created_at: string;
  phone?: string;
  shipping_address?: any;
  metadata?: any;
  is_preorder?: boolean;
  profiles?: {
    full_name: string;
    email: string;
  };
  order_items?: {
    quantity: number;
    product_name?: string;
    is_preorder?: boolean;
  }[];
}

interface OrderStats {
  label: string;
  count: number;
  status: string;
}

/**
 * Sales channel this list is locked to.
 *  - `online` → website orders only (default Orders page).
 *  - `pos`    → in-store POS sales only (Sales page).
 */
export type OrdersChannel = 'online' | 'pos';

interface OrdersListClientProps {
  channel: OrdersChannel;
}

export default function OrdersListClient({ channel }: OrdersListClientProps) {
  const isPosMode = channel === 'pos';

  // Page chrome adapts to the channel so the same component powers both
  // /admin/orders (website) and /admin/sales (POS).
  const pageTitle = isPosMode ? 'Sales' : 'Orders';
  const pageSubtitle = isPosMode
    ? 'Track all in-store POS sales'
    : 'Manage and track all website orders';
  const emptyTitle = isPosMode ? 'No sales found' : 'No orders found';
  const emptyHint = isPosMode
    ? 'Sales recorded from the POS will appear here'
    : 'Orders will appear here when customers place them';
  const allStatsLabel = isPosMode ? 'All Sales' : 'All Orders';
  const exportFile = isPosMode ? 'all-sales.csv' : 'all-orders.csv';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // POS sales are always paid at checkout, so the "Abandoned carts" tab is
  // meaningless in POS mode — we hide it and force the confirmed view.
  const [orderViewTab, setOrderViewTab] = useState<'confirmed' | 'abandoned'>('confirmed');
  const [sendingPaymentLink, setSendingPaymentLink] = useState<string | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats[]>([
    { label: allStatsLabel, count: 0, status: 'all' },
    { label: 'Pending', count: 0, status: 'pending' },
    { label: 'Processing', count: 0, status: 'processing' },
    { label: 'Packaged', count: 0, status: 'shipped' },
    { label: 'Dispatched To Rider', count: 0, status: 'dispatched_to_rider' },
    { label: 'Delivered', count: 0, status: 'delivered' },
    { label: 'Cancelled', count: 0, status: 'cancelled' }
  ]);
  const [abandonedCount, setAbandonedCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [showProductStats, setShowProductStats] = useState(false);
  const [productFilter, setProductFilter] = useState('all');
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when the locked channel changes
  }, [channel]);

  const isPosOrder = (order: Order) =>
    order.metadata?.pos_sale === true || order.metadata?.pos_sale === 'true';

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/admin/orders', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch orders');
      const allOrders: Order[] = json.orders || [];

      // Lock the dataset to the requested sales channel up front so every
      // downstream stat, filter and export stays scoped to it.
      const ordersData = allOrders.filter((o) =>
        isPosMode ? isPosOrder(o) : !isPosOrder(o)
      );

      setOrders(ordersData);

      const productNames = new Set<string>();
      ordersData.forEach((o) => {
        o.order_items?.forEach((item: any) => {
          if (item.product_name) productNames.add(item.product_name);
        });
      });
      setAvailableProducts(Array.from(productNames).sort());

      const confirmedOrders = ordersData.filter((o) => o.payment_status === 'paid');
      const abandonedOrders = ordersData.filter((o) => o.payment_status !== 'paid');

      setConfirmedCount(confirmedOrders.length);
      setAbandonedCount(abandonedOrders.length);

      const stats: OrderStats[] = [
        { label: allStatsLabel, count: confirmedOrders.length, status: 'all' },
        { label: 'Pending', count: confirmedOrders.filter((o) => o.status === 'pending').length, status: 'pending' },
        { label: 'Processing', count: confirmedOrders.filter((o) => o.status === 'processing').length, status: 'processing' },
        { label: 'Packaged', count: confirmedOrders.filter((o) => o.status === 'shipped').length, status: 'shipped' },
        { label: 'Dispatched To Rider', count: confirmedOrders.filter((o) => o.status === 'dispatched_to_rider').length, status: 'dispatched_to_rider' },
        { label: 'Delivered', count: confirmedOrders.filter((o) => o.status === 'delivered').length, status: 'delivered' },
        { label: 'Cancelled', count: confirmedOrders.filter((o) => o.status === 'cancelled').length, status: 'cancelled' }
      ];
      setOrderStats(stats);

    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-blue-100 text-blue-700 border-blue-200',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'dispatched_to_rider': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'delivered': 'bg-gray-100 text-gray-900 border-gray-200',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  const formatStatus = (status: string) => {
    if (status === 'shipped') return 'Packaged';
    if (status === 'dispatched_to_rider') return 'Dispatched To Rider';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  const getCustomerName = (order: Order) => {
    if (order.shipping_address?.firstName || order.shipping_address?.lastName) {
      const first = order.shipping_address.firstName?.trim() || '';
      const last = order.shipping_address.lastName?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.shipping_address?.full_name) return order.shipping_address.full_name;
    if (order.metadata?.first_name || order.metadata?.last_name) {
      const first = order.metadata.first_name?.trim() || '';
      const last = order.metadata.last_name?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.profiles?.full_name) return order.profiles.full_name;
    if (order.email) {
      const name = order.email.split('@')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Guest';
  };

  const getCustomerEmail = (order: Order) => {
    return order.email || order.profiles?.email || 'N/A';
  };

  const getCustomerAvatar = (order: Order) => {
    const name = getCustomerName(order);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getItemCount = (order: Order) => {
    if (!order.order_items) return 0;
    return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const handleBulkAction = async (action: string, newStatus?: string) => {
    if (newStatus) {
      try {
        await Promise.all(
          selectedOrders.map(id =>
            fetch(`/api/admin/orders/${id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus }),
            })
          )
        );

        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        const updatedOrders = orders.filter(o => selectedOrders.includes(o.id));
        updatedOrders.forEach(order => {
          fetch('/api/notifications', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken && { 'Authorization': `Bearer ${authToken}` })
            },
            body: JSON.stringify({
              type: 'order_updated',
              payload: { order, status: newStatus }
            })
          }).catch(err => console.error('Notification error', err));
        });

        await fetchOrders();
        setSelectedOrders([]);
        alert(`${selectedOrders.length} orders updated to ${newStatus}`);
      } catch (error) {
        console.error('Error updating orders:', error);
        alert('Failed to update orders');
      }
    } else if (action === 'Export') {
      const ordersToExport = orders.filter(o => selectedOrders.includes(o.id));
      const csvContent = `Order ID,Customer,Email,Date,Items,Total,Status,Payment\n${ordersToExport.map(o =>
        `${o.order_number || o.id},${getCustomerName(o)},${getCustomerEmail(o)},${formatDate(o.created_at)},${getItemCount(o)},${o.total},${o.status},${o.payment_method || 'N/A'}`
      ).join('\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isPosMode ? 'selected-sales.csv' : 'selected-orders.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleExportAll = () => {
    const csvContent = `Order ID,Customer,Email,Date,Items,Total,Status,Payment\n${orders.map(o =>
      `${o.order_number || o.id},${getCustomerName(o)},${getCustomerEmail(o)},${formatDate(o.created_at)},${getItemCount(o)},${o.total},${o.status},${o.payment_method || 'N/A'}`
    ).join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintInvoice = (orderId: string) => {
    window.open(`/admin/orders/${orderId}?print=true`, '_blank');
  };

  const handleResendPaymentLink = async (order: Order) => {
    setSendingPaymentLink(order.id);
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment_link',
          payload: order
        })
      });

      if (!response.ok) throw new Error('Failed to send');

      alert(`Payment link sent to ${order.phone || order.email}`);
    } catch (error) {
      console.error('Error sending payment link:', error);
      alert('Failed to send payment link');
    } finally {
      setSendingPaymentLink(null);
    }
  };

  // Total revenue for the currently visible channel — surfaced as a chip on
  // the Sales page so cashiers see at a glance how the day/week is going.
  const totalRevenue = orders
    .filter((o) => o.payment_status === 'paid')
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const filteredOrders = orders.filter(order => {
    const customerName = getCustomerName(order).toLowerCase();
    const customerEmail = getCustomerEmail(order).toLowerCase();
    const orderId = (order.order_number || order.id).toLowerCase();

    const isConfirmed = order.payment_status === 'paid';
    // POS mode always shows the "confirmed" set — abandoned carts only exist online.
    const matchesViewTab = isPosMode
      ? isConfirmed
      : orderViewTab === 'confirmed'
        ? isConfirmed
        : !isConfirmed;

    const matchesSearch = orderId.includes(searchQuery.toLowerCase()) ||
      customerName.includes(searchQuery.toLowerCase()) ||
      customerEmail.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesProduct = productFilter === 'all' ||
      order.order_items?.some((item: any) => item.product_name === productFilter);
    return matchesViewTab && matchesSearch && matchesStatus && matchesProduct;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
            {isPosMode ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                <i className="ri-store-3-line"></i>
                POS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
                <i className="ri-global-line"></i>
                Website
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-1">{pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {isPosMode && (
            <Link
              href="/admin/pos"
              className="flex-1 md:flex-none bg-brand-greenDark hover:bg-brand-green text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
            >
              <i className="ri-add-line mr-2"></i>
              New POS Sale
            </Link>
          )}
          <button
            onClick={() => setShowProductStats(true)}
            className="flex-1 md:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-bar-chart-groupped-line mr-2"></i>
            Stats
          </button>
          <button
            onClick={handleExportAll}
            className="flex-1 md:flex-none bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-download-line mr-2"></i>
            Export
          </button>
        </div>
      </div>

      {/* Confirmed vs Abandoned tabs only make sense for online orders */}
      {!isPosMode && (
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setOrderViewTab('confirmed'); setStatusFilter('all'); }}
            className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
              orderViewTab === 'confirmed'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="ri-check-double-line mr-2"></i>
            Confirmed Orders ({confirmedCount})
          </button>
          <button
            onClick={() => { setOrderViewTab('abandoned'); setStatusFilter('all'); }}
            className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
              orderViewTab === 'abandoned'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="ri-shopping-cart-2-line mr-2"></i>
            Abandoned Carts ({abandonedCount})
          </button>
        </div>
      )}

      {/* POS revenue ribbon — quick "what did we sell?" glance */}
      {isPosMode && !loading && (
        <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-100 rounded-xl px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Total POS revenue</p>
            <p className="text-2xl font-bold text-gray-900">GH₵ {totalRevenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Total sales</p>
            <p className="text-2xl font-bold text-gray-900">{confirmedCount}</p>
          </div>
        </div>
      )}

      {(isPosMode || orderViewTab === 'confirmed') && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {orderStats.map((stat) => (
            <button
              key={stat.status}
              onClick={() => setStatusFilter(stat.status)}
              className={`p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${statusFilter === stat.status
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
            >
              <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
              <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {!isPosMode && orderViewTab === 'abandoned' && abandonedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <i className="ri-information-line text-xl text-amber-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-semibold text-amber-800">Abandoned Carts</p>
              <p className="text-sm text-amber-700 mt-1">
                These orders were created but payment was not completed. You can resend payment links to customers.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isPosMode
                    ? 'Search by sale ID, cashier name, or customer…'
                    : 'Search by order ID, customer name, or email…'}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-filter-line mr-2"></i>
                Filters
              </button>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option value="all">All Products</option>
                {availableProducts.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option value="date">Sort by Date</option>
                <option value="total">Sort by Total</option>
                <option value="customer">Sort by Customer</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date Range</label>
                <input type="date" className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                <select className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer">
                  <option>All Methods</option>
                  <option>Moolre</option>
                  <option>Mobile Money</option>
                  <option>Card</option>
                  {isPosMode && <option>Cash</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isPosMode ? 'Cashier' : 'Shipping Method'}
                </label>
                <select className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer">
                  {isPosMode ? (
                    <>
                      <option>All Cashiers</option>
                    </>
                  ) : (
                    <>
                      <option>All Methods</option>
                      <option>Standard</option>
                      <option>Express</option>
                      <option>Store Pickup</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}
        </div>

        {selectedOrders.length > 0 && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-gray-800 font-semibold">
              {selectedOrders.length} {isPosMode ? 'sale' : 'order'}{selectedOrders.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              {!isPosMode && (
                <>
                  <button
                    onClick={() => handleBulkAction('Mark as Processing', 'processing')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Mark Processing
                  </button>
                  <button
                    onClick={() => handleBulkAction('Mark as Packaged', 'shipped')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Mark Packaged
                  </button>
                  <button
                    onClick={() => handleBulkAction('Mark as Dispatched To Rider', 'dispatched_to_rider')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Dispatched To Rider
                  </button>
                </>
              )}
              <button
                onClick={() => handleBulkAction('Export')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">{isPosMode ? 'Sale ID' : 'Order ID'}</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Items</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Payment</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
                    <p className="mt-2">Loading {isPosMode ? 'sales' : 'orders'}…</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500">
                    <i className="ri-inbox-line text-4xl text-gray-300"></i>
                    <p className="mt-2">{emptyTitle}</p>
                    <p className="text-sm">{emptyHint}</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <Link href={`/admin/orders/${order.id}`} className="text-gray-900 hover:text-gray-800 font-semibold whitespace-nowrap cursor-pointer">
                          {order.order_number || order.id.substring(0, 8)}
                        </Link>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-full font-semibold text-sm">
                          {getCustomerAvatar(order)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">{getCustomerName(order)}</p>
                          <p className="text-sm text-gray-500">{getCustomerEmail(order)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="py-4 px-4 text-gray-700">{getItemCount(order)}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">GH₵ {order.total?.toFixed(2) || '0.00'}</td>
                    <td className="py-4 px-4 text-sm whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-gray-700">{order.payment_method || 'N/A'}</span>
                        {!isPosMode && orderViewTab === 'abandoned' && (
                          <span className={`text-xs mt-1 ${order.payment_status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                            {order.payment_status === 'failed' ? 'Failed' : 'Pending'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {formatStatus(order.status)}
                        </span>
                        {(order.is_preorder || order.order_items?.some((i: any) => i.is_preorder)) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                            <i className="ri-time-line"></i>
                            Preorder
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                          title={isPosMode ? 'View Sale' : 'View Order'}
                        >
                          <i className="ri-eye-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </Link>
                        {!isPosMode && orderViewTab === 'abandoned' && order.payment_status !== 'paid' && (
                          <button
                            onClick={() => handleResendPaymentLink(order)}
                            disabled={sendingPaymentLink === order.id}
                            className="w-8 h-8 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Resend Payment Link"
                          >
                            {sendingPaymentLink === order.id ? (
                              <i className="ri-loader-4-line text-lg w-4 h-4 flex items-center justify-center animate-spin"></i>
                            ) : (
                              <i className="ri-send-plane-line text-lg w-4 h-4 flex items-center justify-center"></i>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintInvoice(order.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title={isPosMode ? 'Print Receipt' : 'Print Invoice'}
                        >
                          <i className="ri-printer-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredOrders.length > 0 && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            <p className="text-gray-600">
              Showing {filteredOrders.length} of {orders.length} {isPosMode ? 'sales' : 'orders'}
            </p>
          </div>
        )}
      </div>

      <ProductSalesStats isOpen={showProductStats} onClose={() => setShowProductStats(false)} />
    </div>
  );
}
