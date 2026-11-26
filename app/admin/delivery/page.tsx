'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DeliveryNav from './DeliveryNav';

interface Stats {
    totalAssignments: number;
    activeDeliveries: number;
    deliveredToday: number;
    failedToday: number;
    totalRiders: number;
    activeRiders: number;
    onDeliveryRiders: number;
    pendingOrders: number;
    activeZones: number;
    todayRevenue: number;
}

interface Assignment {
    id: string;
    status: string;
    priority: string;
    assigned_at: string;
    delivered_at: string | null;
    delivery_fee: number;
    delivery_notes: string | null;
    riders: { id: string; full_name: string; phone: string; vehicle_type: string } | null;
    orders: {
        id: string; order_number: string; email: string; phone: string;
        shipping_address: any; total: number; status: string; created_at: string;
    } | null;
}

const STATUS_COLORS: Record<string, string> = {
    assigned: 'bg-yellow-100 text-yellow-800',
    picked_up: 'bg-blue-100 text-blue-800',
    in_transit: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-gray-100 text-gray-800',
    failed: 'bg-red-100 text-red-800',
    returned: 'bg-gray-100 text-gray-800',
};

const VEHICLE_ICONS: Record<string, string> = {
    motorcycle: 'ri-e-bike-2-line',
    bicycle: 'ri-riding-line',
    car: 'ri-car-line',
    van: 'ri-truck-line',
};

export default function DeliveryDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    async function fetchData() {
        try {
            const [statsRes, recentRes] = await Promise.all([
                fetch('/api/delivery?action=stats'),
                fetch('/api/delivery?action=recent'),
            ]);
            for (const res of [statsRes, recentRes]) {
                if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired. Sign in again.' : 'The delivery data could not load.');
            }
            const statsData = await statsRes.json();
            const recentData = await recentRes.json();
            setStats(statsData.stats);
            setRecentAssignments(recentData.assignments || []);
            setLoadError('');
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err);
            setLoadError(err instanceof Error ? err.message : 'The delivery data could not load.');
        } finally {
            setLoading(false);
        }
    }

    const activeAssignments = recentAssignments.filter(a => ['assigned', 'picked_up', 'in_transit'].includes(a.status));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Delivery Hub</h1>
                    <p className="text-gray-500 mt-1">Logistics & dispatch management</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/admin/delivery/assignments"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-medium text-sm">
                        <i className="ri-add-line" /> New Assignment
                    </Link>
                    <button onClick={fetchData}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                        <i className="ri-refresh-line" /> Refresh
                    </button>
                </div>
            </div>

            <DeliveryNav />
            {loadError && (
                <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    {loadError} The figures below may be out of date or empty.
                </p>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <i className="ri-loader-4-line animate-spin text-3xl text-gray-700 mr-3" />
                    <span className="text-gray-500 text-lg">Loading delivery data...</span>
                </div>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <StatCard icon="ri-route-line" color="gray" label="Active Deliveries" value={stats?.activeDeliveries || 0} />
                        <StatCard icon="ri-checkbox-circle-line" color="gray" label="Delivered Today" value={stats?.deliveredToday || 0} />
                        <StatCard icon="ri-error-warning-line" color="red" label="Failed Today" value={stats?.failedToday || 0} />
                        <StatCard icon="ri-e-bike-2-line" color="blue" label="Riders on Delivery" value={stats?.onDeliveryRiders || 0}
                            sub={`${stats?.activeRiders || 0} available`} />
                        <StatCard icon="ri-inbox-unarchive-line" color="amber" label="Awaiting Dispatch" value={stats?.pendingOrders || 0} />
                    </div>

                    {/* Revenue + Fleet + Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-2xl p-6 text-white">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-gray-200 text-sm font-medium">Today&apos;s Delivery Revenue</span>
                                <i className="ri-money-cny-circle-line text-2xl text-gray-200" />
                            </div>
                            <p className="text-3xl font-bold">GH₵ {(stats?.todayRevenue || 0).toFixed(2)}</p>
                            <p className="text-gray-200 text-sm mt-2">{stats?.deliveredToday || 0} deliveries completed</p>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h3 className="text-sm font-semibold text-gray-500 mb-4">Fleet Overview</h3>
                            <div className="space-y-3">
                                <FleetRow label="Total Riders" value={stats?.totalRiders || 0} color="text-gray-900" />
                                <FleetRow label="Available" value={stats?.activeRiders || 0} color="text-gray-700" />
                                <FleetRow label="On Delivery" value={stats?.onDeliveryRiders || 0} color="text-blue-600" />
                                <FleetRow label="Active Zones" value={stats?.activeZones || 0} color="text-indigo-600" />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h3 className="text-sm font-semibold text-gray-500 mb-4">Quick Actions</h3>
                            <div className="space-y-2">
                                <Link href="/admin/delivery/assignments"
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <i className="ri-route-line text-gray-700" />
                                    </div>
                                    View All Assignments
                                </Link>
                                <Link href="/admin/delivery/riders"
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                                    <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <i className="ri-e-bike-2-line text-blue-600" />
                                    </div>
                                    Manage Riders
                                </Link>
                                <Link href="/admin/delivery/zones"
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                                    <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                                        <i className="ri-map-pin-range-line text-amber-600" />
                                    </div>
                                    Manage Zones
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Active Deliveries */}
                    <div className="bg-white rounded-2xl border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Active Deliveries</h2>
                            <span className="text-sm text-gray-500">{activeAssignments.length} in progress</span>
                        </div>
                        {activeAssignments.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <i className="ri-truck-line text-4xl mb-3 block" />
                                <p className="font-medium">No active deliveries right now</p>
                                <p className="text-sm mt-1">Assign orders to riders from the Assignments tab</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {activeAssignments.slice(0, 10).map(a => (
                                    <div key={a.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                                                <i className={`${VEHICLE_ICONS[a.riders?.vehicle_type || 'motorcycle'] || 'ri-e-bike-2-line'} text-gray-700 text-lg`} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 text-sm">#{a.orders?.order_number}</p>
                                                <p className="text-xs text-gray-500 truncate">{a.riders?.full_name || 'Unassigned'} &middot; {a.riders?.phone}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[a.status]}`}>
                                                {a.status.replace('_', ' ')}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                                {a.orders?.shipping_address?.city || 'N/A'}
                                            </span>
                                            {a.priority === 'urgent' && (
                                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">URGENT</span>
                                            )}
                                            {a.priority === 'high' && (
                                                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">HIGH</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Completed */}
                    <div className="bg-white rounded-2xl border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Recent Completions</h2>
                            <Link href="/admin/delivery/assignments?status=delivered" className="text-sm text-gray-700 hover:text-gray-900 font-medium">
                                View all
                            </Link>
                        </div>
                        {recentAssignments.filter(a => a.status === 'delivered').length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">No completed deliveries yet today</div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {recentAssignments.filter(a => a.status === 'delivered').slice(0, 5).map(a => (
                                    <div key={a.id} className="px-6 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <i className="ri-checkbox-circle-fill text-gray-700 text-lg" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">#{a.orders?.order_number}</p>
                                                <p className="text-xs text-gray-500">{a.riders?.full_name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-gray-900">GH₵ {a.delivery_fee?.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500">
                                                {a.delivered_at ? new Date(a.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ icon, color, label, value, sub }: { icon: string; color: string; label: string; value: number; sub?: string }) {
    const colorMap: Record<string, string> = {
        gray: 'bg-gray-100 text-gray-700',
        red: 'bg-red-100 text-red-600',
        blue: 'bg-blue-100 text-blue-600',
        amber: 'bg-amber-100 text-amber-600',
    };
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
                    <i className={`${icon} text-lg`} />
                </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
            {sub && <p className="text-xs text-gray-700 mt-0.5">{sub}</p>}
        </div>
    );
}

function FleetRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{label}</span>
            <span className={`text-sm font-bold ${color}`}>{value}</span>
        </div>
    );
}
