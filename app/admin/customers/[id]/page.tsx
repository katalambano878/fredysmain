'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function CustomerDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const customerId = params.id as string;
    
    const [customer, setCustomer] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (customerId) {
            fetchCustomerData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when customerId changes
    }, [customerId]);

    const fetchCustomerData = async () => {
        try {
            // One customer and all their orders: by account, by email or by phone (most buyers are guests).
            const data = await adminFetch<{ customer: any; orders: any[] }>(
                `/api/admin/customers/${encodeURIComponent(customerId)}`
            );
            setCustomer({
                ...data.customer,
                full_name: data.customer.name || '',
            });
            setOrders(data.orders || []);
            setLoadError('');
        } catch (err) {
            console.error('Error fetching customer:', err);
            setLoadError(err instanceof Error ? err.message : 'The customer could not load.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading customer details...</div>;
    if (!customer) {
        return (
            <div className="p-8 text-center">
                <p className="font-medium text-gray-900">{loadError || 'Customer not found'}</p>
                <Link href="/admin/customers" className="mt-3 inline-block font-semibold text-gray-900 underline">
                    Back to customers
                </Link>
            </div>
        );
    }

    // What has actually been paid, and the orders that were not cancelled.
    const totalSpent = Number(customer.totalSpent) || 0;
    const liveOrders = orders.filter((order) => order.status !== 'cancelled').length;
    const initial = (customer.full_name || customer.email || customer.phone || '?').charAt(0).toUpperCase();

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <i className="ri-arrow-left-line text-xl"></i>
                    </Link>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 text-2xl font-bold">
                        {initial}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{customer.full_name || 'No name given'}</h1>
                        <p className="text-gray-600">
                            {customer.email || 'No email'}
                            {customer.isGuest ? ' · Guest (no account)' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex space-x-3">
                    {customer.phone && (
                        <a href={`tel:${customer.phone}`} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">
                            <i className="ri-phone-line mr-2" aria-hidden></i>
                            Call
                        </a>
                    )}
                    {customer.email && (
                        <a href={`mailto:${customer.email}`} className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800">
                            <i className="ri-mail-send-line mr-2" aria-hidden></i>
                            Email
                        </a>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Paid</p>
                    <p className="text-2xl font-bold text-gray-900">GH₵{totalSpent.toFixed(2)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{liveOrders}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Last Order</p>
                    <p className="text-xl font-bold text-gray-900">
                        {orders[0] ? new Date(orders[0].created_at).toLocaleDateString() : 'Never'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                    <p className="text-lg font-bold text-gray-900">{customer.phone || 'N/A'}</p>
                </div>
            </div>

            {/* Orders History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Order History</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No orders found.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Order ID</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Total</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                        <Link href={`/admin/orders/${order.id}`}>{order.order_number || `#${order.id.slice(0, 8)}`}</Link>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(order.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${order.status === 'completed' || order.status === 'delivered' ? 'bg-gray-100 text-gray-800' :
                                                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                        order.status === 'dispatched_to_rider' ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {order.status === 'dispatched_to_rider' ? 'Dispatched To Rider' : order.status.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                        GH₵{(order.total || 0).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/admin/orders/${order.id}`} aria-label="View order" className="text-gray-600 hover:text-gray-900">
                                            <i className="ri-eye-line text-lg" aria-hidden></i>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
