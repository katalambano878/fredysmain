'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import DeliveryNav from '../DeliveryNav';

interface Rider {
    id: string; full_name: string; phone: string; vehicle_type: string; status: string;
}

interface Order {
    id: string; order_number: string; email: string; phone: string;
    shipping_address: any; shipping_method: string; total: number; status: string; created_at: string;
}

interface Assignment {
    id: string; order_id: string; rider_id: string; status: string; priority: string;
    assigned_at: string; picked_up_at: string | null; in_transit_at: string | null;
    delivered_at: string | null; failed_at: string | null; delivery_notes: string | null;
    failure_reason: string | null; delivery_fee: number; estimated_delivery: string | null;
    riders: Rider | null; orders: Order | null;
}

const STATUS_COLORS: Record<string, string> = {
    assigned: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    picked_up: 'bg-blue-100 text-blue-800 border-blue-200',
    in_transit: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    delivered: 'bg-gray-100 text-gray-800 border-gray-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    returned: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_ICONS: Record<string, string> = {
    assigned: 'ri-time-line',
    picked_up: 'ri-hand-heart-line',
    in_transit: 'ri-truck-line',
    delivered: 'ri-checkbox-circle-line',
    failed: 'ri-close-circle-line',
    returned: 'ri-arrow-go-back-line',
};

const PRIORITY_COLORS: Record<string, string> = {
    low: 'text-gray-500',
    normal: 'text-blue-600',
    high: 'text-orange-600',
    urgent: 'text-red-600',
};

export default function AssignmentsPage() {
    const searchParams = useSearchParams();
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [unassignedOrders, setUnassignedOrders] = useState<Order[]>([]);
    const [riders, setRiders] = useState<Rider[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [total, setTotal] = useState(0);

    const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'all');
    const [filterRider, setFilterRider] = useState('');
    const [page, setPage] = useState(1);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

    const [assignForm, setAssignForm] = useState({ rider_id: '', priority: 'normal', delivery_notes: '', delivery_fee: '', estimated_delivery: '' });
    const [updateForm, setUpdateForm] = useState({ status: '', delivery_notes: '', failure_reason: '' });
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const params = new URLSearchParams({ status: filterStatus, page: String(page), limit: '30' });
            if (filterRider) params.set('rider_id', filterRider);

            const [assignRes, unassignedRes, ridersRes] = await Promise.all([
                fetch(`/api/delivery/assignments?${params}`),
                fetch('/api/delivery?action=unassigned'),
                fetch('/api/delivery/riders?status=active'),
            ]);

            for (const res of [assignRes, unassignedRes, ridersRes]) {
                if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired. Sign in again.' : 'The delivery data could not load.');
            }
            const assignData = await assignRes.json();
            const unassignedData = await unassignedRes.json();
            const ridersData = await ridersRes.json();
            setLoadError('');

            setAssignments(assignData.assignments || []);
            setTotal(assignData.total || 0);
            setUnassignedOrders(unassignedData.orders || []);
            setRiders(ridersData.riders || []);
        } catch (err) {
            console.error('Failed to fetch:', err);
            setLoadError(err instanceof Error ? err.message : 'The delivery data could not load.');
        } finally {
            setLoading(false);
        }
    }, [filterStatus, filterRider, page]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    }

    function openAssignModal(order: Order) {
        setSelectedOrder(order);
        setAssignForm({ rider_id: '', priority: 'normal', delivery_notes: '', delivery_fee: '', estimated_delivery: '' });
        setShowAssignModal(true);
    }

    function openUpdateModal(assignment: Assignment) {
        setSelectedAssignment(assignment);
        setUpdateForm({ status: assignment.status, delivery_notes: assignment.delivery_notes || '', failure_reason: '' });
        setShowUpdateModal(true);
    }

    async function handleAssign() {
        if (!selectedOrder || !assignForm.rider_id) return;
        setSaving(true);
        try {
            const res = await fetch('/api/delivery/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: selectedOrder.id,
                    rider_id: assignForm.rider_id,
                    priority: assignForm.priority,
                    delivery_notes: assignForm.delivery_notes || null,
                    delivery_fee: parseFloat(assignForm.delivery_fee) || 0,
                    estimated_delivery: assignForm.estimated_delivery || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Order assigned to rider successfully');
            setShowAssignModal(false);
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleStatusUpdate() {
        if (!selectedAssignment || !updateForm.status) return;
        setSaving(true);
        try {
            const res = await fetch('/api/delivery/assignments', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedAssignment.id,
                    status: updateForm.status,
                    delivery_notes: updateForm.delivery_notes || null,
                    failure_reason: updateForm.failure_reason || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Status updated to "${updateForm.status.replace('_', ' ')}"`);
            setShowUpdateModal(false);
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Remove this assignment? The order will revert to processing.')) return;
        try {
            const res = await fetch(`/api/delivery/assignments?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Assignment removed');
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    const totalPages = Math.ceil(total / 30);

    return (
        <div className="space-y-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
                    toast.startsWith('Error') ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'
                }`}>{toast}</div>
            )}

            <div>
                <h1 className="text-2xl font-bold text-gray-900">Delivery Hub</h1>
                <p className="text-gray-500 mt-1">Assign orders to riders and track delivery progress</p>
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
                    <span className="text-gray-500">Loading assignments...</span>
                </div>
            ) : (
                <>
                    {/* Unassigned Orders */}
                    {unassignedOrders.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <i className="ri-alarm-warning-line text-amber-600 text-xl" />
                                <h2 className="font-bold text-amber-900">
                                    {unassignedOrders.length} Order{unassignedOrders.length > 1 ? 's' : ''} Awaiting Dispatch
                                </h2>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {unassignedOrders.map(order => (
                                    <div key={order.id} className="bg-white rounded-xl border border-amber-200 p-4 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-gray-900 text-sm">#{order.order_number}</span>
                                            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                                {order.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 space-y-1">
                                            <p><i className="ri-map-pin-line mr-1" />{order.shipping_address?.city || 'N/A'}, {order.shipping_address?.region || ''}</p>
                                            <p><i className="ri-phone-line mr-1" />{order.phone || order.email}</p>
                                            <p><i className="ri-money-cny-circle-line mr-1" />GH₵ {order.total?.toFixed(2)}</p>
                                        </div>
                                        <button onClick={() => openAssignModal(order)}
                                            className="mt-2 w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
                                            <i className="ri-user-add-line mr-1" /> Assign Rider
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 bg-white">
                            <option value="all">All Statuses</option>
                            <option value="assigned">Assigned</option>
                            <option value="picked_up">Picked Up</option>
                            <option value="in_transit">In Transit</option>
                            <option value="delivered">Delivered</option>
                            <option value="failed">Failed</option>
                            <option value="returned">Returned</option>
                        </select>
                        <select value={filterRider} onChange={e => { setFilterRider(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 bg-white">
                            <option value="">All Riders</option>
                            {riders.map(r => (
                                <option key={r.id} value={r.id}>{r.full_name}</option>
                            ))}
                        </select>
                        <button onClick={fetchData}
                            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors text-sm">
                            <i className="ri-refresh-line mr-1" /> Refresh
                        </button>
                        <span className="text-sm text-gray-400 ml-auto">{total} total</span>
                    </div>

                    {/* Assignments Table */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        {assignments.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <i className="ri-route-line text-4xl mb-3 block" />
                                <p className="font-medium">No assignments match your filters</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50">
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Rider</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Destination</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Priority</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Fee</th>
                                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Assigned</th>
                                            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {assignments.map(a => (
                                            <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <p className="font-semibold text-gray-900 text-sm">#{a.orders?.order_number}</p>
                                                    <p className="text-xs text-gray-500">{a.orders?.phone || a.orders?.email}</p>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <p className="font-medium text-gray-900 text-sm">{a.riders?.full_name || '—'}</p>
                                                    <p className="text-xs text-gray-500">{a.riders?.phone}</p>
                                                </td>
                                                <td className="px-5 py-3 hidden md:table-cell">
                                                    <p className="text-sm text-gray-700">{a.orders?.shipping_address?.city || 'N/A'}</p>
                                                    <p className="text-xs text-gray-400">{a.orders?.shipping_address?.region || ''}</p>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[a.status]}`}>
                                                        <i className={STATUS_ICONS[a.status]} />
                                                        {a.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 hidden lg:table-cell">
                                                    <span className={`text-sm font-medium capitalize ${PRIORITY_COLORS[a.priority]}`}>
                                                        {a.priority}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-gray-700 hidden lg:table-cell">
                                                    GH₵ {a.delivery_fee?.toFixed(2)}
                                                </td>
                                                <td className="px-5 py-3 text-xs text-gray-500 hidden sm:table-cell">
                                                    {new Date(a.assigned_at).toLocaleDateString()}
                                                    <br />{new Date(a.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {!['delivered', 'returned'].includes(a.status) && (
                                                            <button onClick={() => openUpdateModal(a)}
                                                                className="p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors" title="Update Status">
                                                                <i className="ri-edit-line" />
                                                            </button>
                                                        )}
                                                        {a.status === 'assigned' && (
                                                            <button onClick={() => handleDelete(a.id)}
                                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove">
                                                                <i className="ri-delete-bin-line" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">Previous</button>
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Assign Modal */}
            {showAssignModal && selectedOrder && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Assign Rider to Order</h2>
                            <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><i className="ri-close-line text-xl" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-sm font-bold text-gray-900">#{selectedOrder.order_number}</p>
                                <div className="mt-2 text-xs text-gray-600 space-y-1">
                                    <p><i className="ri-map-pin-line mr-1" />{selectedOrder.shipping_address?.street_address || ''}, {selectedOrder.shipping_address?.city || ''}, {selectedOrder.shipping_address?.region || ''}</p>
                                    <p><i className="ri-phone-line mr-1" />{selectedOrder.phone || selectedOrder.email}</p>
                                    <p><i className="ri-money-cny-circle-line mr-1" />Order Total: GH₵ {selectedOrder.total?.toFixed(2)}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Select Rider *</label>
                                <select value={assignForm.rider_id} onChange={e => setAssignForm(f => ({ ...f, rider_id: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600">
                                    <option value="">Choose a rider...</option>
                                    {riders.filter(r => r.status === 'active').map(r => (
                                        <option key={r.id} value={r.id}>{r.full_name} — {r.vehicle_type} ({r.phone})</option>
                                    ))}
                                </select>
                                {riders.filter(r => r.status === 'active').length === 0 && (
                                    <p className="text-xs text-red-500 mt-1">No available riders. Add riders first.</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Priority</label>
                                    <select value={assignForm.priority} onChange={e => setAssignForm(f => ({ ...f, priority: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600">
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Delivery Fee (GH₵)</label>
                                    <input type="number" step="0.01" value={assignForm.delivery_fee}
                                        onChange={e => setAssignForm(f => ({ ...f, delivery_fee: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600"
                                        placeholder="20.00" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Delivery Notes</label>
                                <textarea value={assignForm.delivery_notes}
                                    onChange={e => setAssignForm(f => ({ ...f, delivery_notes: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 resize-none"
                                    rows={2} placeholder="Special instructions for the rider..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowAssignModal(false)}
                                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
                                <button onClick={handleAssign} disabled={saving || !assignForm.rider_id}
                                    className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold disabled:opacity-50 transition-colors">
                                    {saving ? 'Assigning...' : 'Assign Rider'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Update Status Modal */}
            {showUpdateModal && selectedAssignment && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Update Delivery Status</h2>
                            <button onClick={() => setShowUpdateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><i className="ri-close-line text-xl" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold">#{selectedAssignment.orders?.order_number}</p>
                                    <p className="text-xs text-gray-500">Rider: {selectedAssignment.riders?.full_name}</p>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[selectedAssignment.status]}`}>
                                    {selectedAssignment.status.replace('_', ' ')}
                                </span>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-3">New Status</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'].map(s => (
                                        <button key={s} onClick={() => setUpdateForm(f => ({ ...f, status: s }))}
                                            className={`p-3 rounded-xl border-2 text-center text-xs font-semibold transition-colors ${
                                                updateForm.status === s
                                                    ? 'border-gray-600 bg-gray-50 text-gray-900'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}>
                                            <i className={`${STATUS_ICONS[s]} text-lg block mb-1`} />
                                            {s.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {updateForm.status === 'failed' && (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Failure Reason *</label>
                                    <textarea value={updateForm.failure_reason}
                                        onChange={e => setUpdateForm(f => ({ ...f, failure_reason: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 resize-none"
                                        rows={2} placeholder="Why did the delivery fail?" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Notes</label>
                                <textarea value={updateForm.delivery_notes}
                                    onChange={e => setUpdateForm(f => ({ ...f, delivery_notes: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 resize-none"
                                    rows={2} placeholder="Optional delivery notes..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowUpdateModal(false)}
                                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
                                <button onClick={handleStatusUpdate}
                                    disabled={saving || updateForm.status === selectedAssignment.status || (updateForm.status === 'failed' && !updateForm.failure_reason)}
                                    className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold disabled:opacity-50 transition-colors">
                                    {saving ? 'Updating...' : 'Update Status'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
