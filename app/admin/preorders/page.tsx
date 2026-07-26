'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { moneyLabel } from '@/lib/format-money';

interface PreorderItem {
    quantity: number;
    product_name?: string;
    variant_name?: string | null;
    is_preorder?: boolean;
}

interface PreorderOrder {
    id: string;
    order_number: string;
    email: string;
    total: number;
    status: string;
    payment_status: string;
    payment_method?: string;
    shipping_method?: string;
    created_at: string;
    phone?: string;
    shipping_address?: any;
    metadata?: any;
    is_preorder?: boolean;
    order_items?: PreorderItem[];
}

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    processing: 'bg-blue-100 text-blue-700 border-blue-200',
    shipped: 'bg-purple-100 text-purple-700 border-purple-200',
    dispatched_to_rider: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    delivered: 'bg-gray-100 text-gray-900 border-gray-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
    awaiting_payment: 'bg-gray-100 text-gray-700 border-gray-200',
};

function formatStatus(status: string) {
    if (status === 'shipped') return 'Packaged';
    if (status === 'dispatched_to_rider') return 'Dispatched To Rider';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
}

function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function getCustomerName(order: PreorderOrder) {
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
    if (order.email) {
        const name = order.email.split('@')[0];
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Guest';
}

export default function AdminPreordersPage() {
    const [orders, setOrders] = useState<PreorderOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'in_production' | 'ready'>('all');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetchPreorders();
    }, []);

    async function fetchPreorders() {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/orders?preorder=1', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to fetch preorders');
            setOrders(json.orders || []);
        } catch (err) {
            console.error('[Preorders] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }

    const stats = useMemo(() => {
        const paid = orders.filter((o) => o.payment_status === 'paid');
        const unpaid = orders.filter((o) => o.payment_status !== 'paid');
        const inProduction = paid.filter((o) => o.status === 'processing' || o.status === 'pending');
        const ready = paid.filter((o) => o.status === 'shipped' || o.status === 'dispatched_to_rider' || o.status === 'delivered');
        return { total: orders.length, paid: paid.length, unpaid: unpaid.length, inProduction: inProduction.length, ready: ready.length };
    }, [orders]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter((o) => {
            if (statusFilter === 'paid' && o.payment_status !== 'paid') return false;
            if (statusFilter === 'unpaid' && o.payment_status === 'paid') return false;
            if (statusFilter === 'in_production' && !(o.payment_status === 'paid' && (o.status === 'pending' || o.status === 'processing'))) return false;
            if (statusFilter === 'ready' && !(o.payment_status === 'paid' && (o.status === 'shipped' || o.status === 'dispatched_to_rider' || o.status === 'delivered'))) return false;

            if (!q) return true;
            const name = getCustomerName(o).toLowerCase();
            return (
                (o.order_number || '').toLowerCase().includes(q) ||
                (o.email || '').toLowerCase().includes(q) ||
                name.includes(q) ||
                o.order_items?.some((it) => (it.product_name || '').toLowerCase().includes(q))
            );
        });
    }, [orders, search, statusFilter]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <i className="ri-time-line text-amber-600"></i>
                        Preorders
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Orders for out-of-stock items. Produce these, then mark them packaged or dispatched. Preorder items take 3–4 business days.
                    </p>
                </div>
                <button
                    onClick={fetchPreorders}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
                >
                    <i className="ri-refresh-line"></i>
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'All Preorders', key: 'all' as const, count: stats.total },
                    { label: 'Unpaid', key: 'unpaid' as const, count: stats.unpaid },
                    { label: 'Paid', key: 'paid' as const, count: stats.paid },
                    { label: 'In Production', key: 'in_production' as const, count: stats.inProduction },
                    { label: 'Ready / Out', key: 'ready' as const, count: stats.ready },
                ].map((s) => (
                    <button
                        key={s.key}
                        onClick={() => setStatusFilter(s.key)}
                        className={`p-4 rounded-xl border-2 text-left cursor-pointer transition-all ${
                            statusFilter === s.key ? 'border-amber-600 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                        <p className="text-2xl font-bold text-gray-900">{s.count}</p>
                        <p className="text-sm text-gray-600 mt-1">{s.label}</p>
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                    <div className="relative max-w-md">
                        <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by order, customer, email or product..."
                            className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Order ID</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Date</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Preorder Items</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Payment</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-gray-500">
                                        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
                                        <p className="mt-2">Loading preorders...</p>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-gray-500">
                                        <i className="ri-time-line text-4xl text-gray-300"></i>
                                        <p className="mt-2">No preorders yet</p>
                                        <p className="text-sm">Orders that include out-of-stock items will appear here.</p>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((order) => {
                                    const preorderItems = (order.order_items || []).filter((i) => i.is_preorder !== false);
                                    const isOpen = !!expanded[order.id];
                                    return (
                                        <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top">
                                            <td className="py-4 px-4">
                                                <Link
                                                    href={`/admin/orders/${order.id}`}
                                                    className="text-gray-900 hover:text-gray-800 font-semibold whitespace-nowrap"
                                                >
                                                    {order.order_number || order.id.substring(0, 8)}
                                                </Link>
                                            </td>
                                            <td className="py-4 px-4">
                                                <p className="font-medium text-gray-900 whitespace-nowrap">{getCustomerName(order)}</p>
                                                <p className="text-xs text-gray-500">{order.email}</p>
                                                {order.phone && <p className="text-xs text-gray-500">{order.phone}</p>}
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">{formatDate(order.created_at)}</td>
                                            <td className="py-4 px-4 text-sm text-gray-800 min-w-[220px]">
                                                {preorderItems.length === 0 ? (
                                                    <span className="text-gray-400">—</span>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => setExpanded((e) => ({ ...e, [order.id]: !isOpen }))}
                                                            className="text-left font-medium text-amber-800 hover:underline"
                                                        >
                                                            {preorderItems.length} item{preorderItems.length > 1 ? 's' : ''}{' '}
                                                            <i className={`ri-arrow-down-s-line transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
                                                        </button>
                                                        {isOpen && (
                                                            <ul className="mt-2 space-y-1 text-xs">
                                                                {preorderItems.map((it, idx) => (
                                                                    <li key={idx} className="flex items-start gap-2">
                                                                        <span className="inline-block w-5 text-right text-gray-500">{it.quantity}×</span>
                                                                        <span>
                                                                            {it.product_name}
                                                                            {it.variant_name && <span className="text-gray-500"> — {it.variant_name}</span>}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                                                {moneyLabel(order.total)}
                                            </td>
                                            <td className="py-4 px-4 text-sm whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                                        order.payment_status === 'paid'
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}
                                                >
                                                    <i className={order.payment_status === 'paid' ? 'ri-checkbox-circle-line' : 'ri-time-line'}></i>
                                                    {order.payment_status === 'paid' ? 'Paid' : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                                                        statusColors[order.status] || 'bg-gray-100 text-gray-700 border-gray-200'
                                                    }`}
                                                >
                                                    {formatStatus(order.status)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <Link
                                                    href={`/admin/orders/${order.id}`}
                                                    className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 font-medium"
                                                >
                                                    Open
                                                    <i className="ri-arrow-right-line"></i>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {filtered.length > 0 && (
                    <div className="p-6 border-t border-gray-200 flex items-center justify-between">
                        <p className="text-gray-600">
                            Showing {filtered.length} of {orders.length} preorders
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
