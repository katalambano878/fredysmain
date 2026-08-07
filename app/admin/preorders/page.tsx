'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { moneyLabel } from '@/lib/format-money';
import NewPreorderModal from '@/components/admin/NewPreorderModal';

interface PreorderItem {
    quantity: number;
    product_name?: string;
    variant_name?: string | null;
    is_preorder?: boolean;
    metadata?: any;
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
    staff?: { full_name?: string } | null;
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

function sourceLabel(order: PreorderOrder): string | null {
    const src = order.metadata?.order_source || order.metadata?.preorder_channel;
    if (!src) {
        if (order.metadata?.staff_created) return 'Staff';
        return null;
    }
    const map: Record<string, string> = {
        whatsapp: 'WhatsApp',
        phone: 'Phone',
        walk_in: 'Walk-in',
        other: 'Other',
        website: 'Website',
    };
    return map[String(src)] || String(src);
}

export default function AdminPreordersPage() {
    const [orders, setOrders] = useState<PreorderOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'in_production' | 'ready'>('all');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [showNew, setShowNew] = useState(false);
    const [sendingLink, setSendingLink] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        fetchPreorders();
    }, []);

    async function fetchPreorders() {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/orders?preorder=1&limit=500', { credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to fetch preorders');
            setOrders(json.orders || []);
        } catch (err) {
            console.error('[Preorders] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }

    async function resendPaymentLink(order: PreorderOrder) {
        setSendingLink(order.id);
        setToast(null);
        try {
            const { supabase } = await import('@/lib/supabase');
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/notifications', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({
                    type: 'payment_link',
                    payload: order,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'Failed to send payment link');
            setToast(`Payment link sent for ${order.order_number}`);
        } catch (e: any) {
            setToast(e?.message || 'Could not send payment link');
        } finally {
            setSendingLink(null);
        }
    }

    const stats = useMemo(() => {
        const paid = orders.filter((o) => o.payment_status === 'paid');
        const unpaid = orders.filter((o) => o.payment_status !== 'paid');
        const inProduction = paid.filter((o) => o.status === 'processing' || o.status === 'pending');
        const ready = paid.filter((o) =>
            o.status === 'shipped' || o.status === 'dispatched_to_rider' || o.status === 'delivered'
        );
        const staffCreated = orders.filter((o) => o.metadata?.staff_created).length;
        return {
            total: orders.length,
            paid: paid.length,
            unpaid: unpaid.length,
            inProduction: inProduction.length,
            ready: ready.length,
            staffCreated,
        };
    }, [orders]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter((o) => {
            if (statusFilter === 'paid' && o.payment_status !== 'paid') return false;
            if (statusFilter === 'unpaid' && o.payment_status === 'paid') return false;
            if (
                statusFilter === 'in_production' &&
                !(o.payment_status === 'paid' && (o.status === 'pending' || o.status === 'processing'))
            ) {
                return false;
            }
            if (
                statusFilter === 'ready' &&
                !(
                    o.payment_status === 'paid' &&
                    (o.status === 'shipped' ||
                        o.status === 'dispatched_to_rider' ||
                        o.status === 'delivered')
                )
            ) {
                return false;
            }

            if (!q) return true;
            const name = getCustomerName(o).toLowerCase();
            const src = sourceLabel(o)?.toLowerCase() || '';
            return (
                (o.order_number || '').toLowerCase().includes(q) ||
                (o.email || '').toLowerCase().includes(q) ||
                (o.phone || '').includes(q) ||
                name.includes(q) ||
                src.includes(q) ||
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
                    <p className="text-gray-600 mt-1 max-w-2xl">
                        Website out-of-stock checkouts <strong>and</strong> staff-entered phone / WhatsApp /
                        custom made-to-order jobs. Produce these, then mark packaged or dispatched. Typical
                        turnaround: 3–4 business days.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={fetchPreorders}
                        className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2"
                    >
                        <i className="ri-refresh-line"></i>
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowNew(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 shadow-sm"
                    >
                        <i className="ri-add-line"></i>
                        New preorder
                    </button>
                </div>
            </div>

            {toast && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex justify-between gap-3">
                    <span>{toast}</span>
                    <button type="button" onClick={() => setToast(null)} className="text-amber-700 font-semibold">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                        <i className="ri-customer-service-2-line text-xl" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900">Replace the order book</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Phone, WhatsApp, walk-in, or a custom dress not on the site — use{' '}
                            <strong>New preorder</strong> above. It stamps your login and counts in End of Day
                            once paid ({stats.staffCreated} staff-created so far).
                        </p>
                    </div>
                </div>
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
                            statusFilter === s.key
                                ? 'border-amber-600 bg-amber-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'
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
                            placeholder="Search by order, customer, phone, source or product..."
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
                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Source</th>
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
                                    <td colSpan={9} className="py-12 text-center text-gray-500">
                                        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
                                        <p className="mt-2">Loading preorders...</p>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-gray-500">
                                        <i className="ri-time-line text-4xl text-gray-300"></i>
                                        <p className="mt-2">No preorders yet</p>
                                        <p className="text-sm mb-4">
                                            Website OOS checkouts or staff-entered phone/custom orders appear here.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowNew(true)}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold"
                                        >
                                            <i className="ri-add-line" /> Create first staff preorder
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((order) => {
                                    const preorderItems = (order.order_items || []).filter(
                                        (i) => i.is_preorder !== false
                                    );
                                    const isOpen = !!expanded[order.id];
                                    const src = sourceLabel(order);
                                    const deposit = Number(order.metadata?.deposit_amount) || 0;
                                    const balance = Number(order.metadata?.balance_due);
                                    const depositPaid = Boolean(order.metadata?.deposit_paid);
                                    return (
                                        <tr
                                            key={order.id}
                                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top"
                                        >
                                            <td className="py-4 px-4">
                                                <Link
                                                    href={`/admin/orders/${order.id}`}
                                                    className="text-gray-900 hover:text-gray-800 font-semibold whitespace-nowrap"
                                                >
                                                    {order.order_number || order.id.substring(0, 8)}
                                                </Link>
                                                {order.staff?.full_name && (
                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        by {order.staff.full_name}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                <p className="font-medium text-gray-900 whitespace-nowrap">
                                                    {getCustomerName(order)}
                                                </p>
                                                {order.phone && (
                                                    <p className="text-xs text-gray-500">{order.phone}</p>
                                                )}
                                                {order.email && !order.email.endsWith('.local') && (
                                                    <p className="text-xs text-gray-500">{order.email}</p>
                                                )}
                                            </td>
                                            <td className="py-4 px-4">
                                                {src ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                                                        {src}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200">
                                                        Website
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">
                                                {formatDate(order.created_at)}
                                                {order.metadata?.promised_date && (
                                                    <p className="text-[11px] text-amber-700 mt-0.5">
                                                        Due {order.metadata.promised_date}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-800 min-w-[220px]">
                                                {preorderItems.length === 0 ? (
                                                    <span className="text-gray-400">—</span>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() =>
                                                                setExpanded((e) => ({
                                                                    ...e,
                                                                    [order.id]: !isOpen,
                                                                }))
                                                            }
                                                            className="text-left font-medium text-amber-800 hover:underline"
                                                        >
                                                            {preorderItems.length} item
                                                            {preorderItems.length > 1 ? 's' : ''}{' '}
                                                            <i
                                                                className={`ri-arrow-down-s-line transition-transform ${
                                                                    isOpen ? 'rotate-180' : ''
                                                                }`}
                                                            ></i>
                                                        </button>
                                                        {isOpen && (
                                                            <ul className="mt-2 space-y-1 text-xs">
                                                                {preorderItems.map((it, idx) => (
                                                                    <li key={idx} className="flex items-start gap-2">
                                                                        <span className="inline-block w-5 text-right text-gray-500">
                                                                            {it.quantity}×
                                                                        </span>
                                                                        <span>
                                                                            {it.product_name}
                                                                            {it.variant_name && (
                                                                                <span className="text-gray-500">
                                                                                    {' '}
                                                                                    — {it.variant_name}
                                                                                </span>
                                                                            )}
                                                                            {it.metadata?.line_type === 'custom' && (
                                                                                <span className="ml-1 text-amber-700 font-semibold">
                                                                                    custom
                                                                                </span>
                                                                            )}
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
                                                {depositPaid &&
                                                    order.payment_status !== 'paid' &&
                                                    deposit > 0 && (
                                                        <p className="text-[11px] font-normal text-amber-700 mt-0.5">
                                                            Deposit {moneyLabel(deposit)}
                                                            {Number.isFinite(balance) && balance > 0
                                                                ? ` · bal ${moneyLabel(balance)}`
                                                                : ''}
                                                        </p>
                                                    )}
                                            </td>
                                            <td className="py-4 px-4 text-sm whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                                        order.payment_status === 'paid'
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : depositPaid
                                                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                                                              : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}
                                                >
                                                    <i
                                                        className={
                                                            order.payment_status === 'paid'
                                                                ? 'ri-checkbox-circle-line'
                                                                : 'ri-time-line'
                                                        }
                                                    ></i>
                                                    {order.payment_status === 'paid'
                                                        ? 'Paid'
                                                        : depositPaid
                                                          ? 'Deposit'
                                                          : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                                                        statusColors[order.status] ||
                                                        'bg-gray-100 text-gray-700 border-gray-200'
                                                    }`}
                                                >
                                                    {formatStatus(order.status)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex flex-col items-start gap-1.5">
                                                    <Link
                                                        href={`/admin/orders/${order.id}`}
                                                        className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 font-medium"
                                                    >
                                                        Open
                                                        <i className="ri-arrow-right-line"></i>
                                                    </Link>
                                                    {order.payment_status !== 'paid' && (
                                                        <button
                                                            type="button"
                                                            disabled={sendingLink === order.id}
                                                            onClick={() => resendPaymentLink(order)}
                                                            className="text-xs font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50"
                                                        >
                                                            {sendingLink === order.id
                                                                ? 'Sending…'
                                                                : 'Send pay link'}
                                                        </button>
                                                    )}
                                                </div>
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

            <NewPreorderModal
                open={showNew}
                onClose={() => setShowNew(false)}
                onCreated={() => {
                    setToast('Preorder created');
                    fetchPreorders();
                }}
            />
        </div>
    );
}
