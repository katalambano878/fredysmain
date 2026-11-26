'use client';

import { useState, useEffect } from 'react';
import DeliveryNav from '../DeliveryNav';

interface Zone { id: string; name: string; }

interface Rider {
    id: string; full_name: string; phone: string; email: string | null;
    vehicle_type: string; license_plate: string | null; status: string;
    zone_id: string | null; total_deliveries: number; successful_deliveries: number;
    rating_avg: number; created_at: string;
    delivery_zones: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-gray-100 text-gray-800',
    inactive: 'bg-gray-100 text-gray-800',
    on_delivery: 'bg-blue-100 text-blue-800',
    off_duty: 'bg-yellow-100 text-yellow-800',
};

const VEHICLE_ICONS: Record<string, string> = {
    motorcycle: 'ri-e-bike-2-line',
    bicycle: 'ri-riding-line',
    car: 'ri-car-line',
    van: 'ri-truck-line',
};

export default function RidersPage() {
    const [riders, setRiders] = useState<Rider[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingRider, setEditingRider] = useState<Rider | null>(null);
    const [form, setForm] = useState({
        full_name: '', phone: '', email: '', vehicle_type: 'motorcycle', license_plate: '', zone_id: '',
    });
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        try {
            const [ridersRes, zonesRes] = await Promise.all([
                fetch('/api/delivery/riders'),
                fetch('/api/delivery/zones'),
            ]);
            for (const res of [ridersRes, zonesRes]) {
                if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired. Sign in again.' : 'The delivery data could not load.');
            }
            const ridersData = await ridersRes.json();
            const zonesData = await zonesRes.json();
            setRiders(ridersData.riders || []);
            setZones(zonesData.zones || []);
            setLoadError('');
        } catch (err) {
            console.error('Failed to fetch:', err);
            setLoadError(err instanceof Error ? err.message : 'The delivery data could not load.');
        } finally {
            setLoading(false);
        }
    }

    function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

    function openAddModal() {
        setEditingRider(null);
        setForm({ full_name: '', phone: '', email: '', vehicle_type: 'motorcycle', license_plate: '', zone_id: '' });
        setShowModal(true);
    }

    function openEditModal(rider: Rider) {
        setEditingRider(rider);
        setForm({
            full_name: rider.full_name, phone: rider.phone, email: rider.email || '',
            vehicle_type: rider.vehicle_type, license_plate: rider.license_plate || '', zone_id: rider.zone_id || '',
        });
        setShowModal(true);
    }

    async function handleSave() {
        if (!form.full_name.trim() || !form.phone.trim()) { showToast('Error: Name and phone are required'); return; }
        setSaving(true);
        try {
            if (editingRider) {
                const res = await fetch('/api/delivery/riders', {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editingRider.id, ...form }),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                showToast('Rider updated');
            } else {
                const res = await fetch('/api/delivery/riders', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                showToast('Rider added');
            }
            setShowModal(false);
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleStatus(rider: Rider) {
        const newStatus = rider.status === 'active' ? 'inactive' : 'active';
        try {
            const res = await fetch('/api/delivery/riders', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rider.id, status: newStatus }),
            });
            if (!res.ok) throw new Error('Failed to update status');
            showToast(`Rider set to ${newStatus}`);
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    async function handleDelete(rider: Rider) {
        if (!confirm(`Remove rider "${rider.full_name}"? A rider with past deliveries is set to inactive instead, so their delivery history is kept.`)) return;
        try {
            const res = await fetch(`/api/delivery/riders?id=${rider.id}`, { method: 'DELETE' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'The rider was not removed');
            showToast(json.deactivated ? `${rider.full_name} has past deliveries, so they were set to inactive.` : 'Rider removed');
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    const filtered = riders.filter(r => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return r.full_name.toLowerCase().includes(q) || r.phone.includes(q) || (r.email && r.email.toLowerCase().includes(q));
        }
        return true;
    });

    return (
        <div className="space-y-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
                    toast.startsWith('Error') ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'
                }`}>{toast}</div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Delivery Hub</h1>
                    <p className="text-gray-500 mt-1">Manage your delivery fleet</p>
                </div>
                <button onClick={openAddModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-medium text-sm">
                    <i className="ri-add-line" /> Add Rider
                </button>
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
                    <span className="text-gray-500">Loading riders...</span>
                </div>
            ) : (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-2xl font-bold text-gray-900">{riders.length}</p>
                            <p className="text-xs text-gray-500 mt-1">Total Riders</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-2xl font-bold text-gray-700">{riders.filter(r => r.status === 'active').length}</p>
                            <p className="text-xs text-gray-500 mt-1">Available</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-2xl font-bold text-blue-600">{riders.filter(r => r.status === 'on_delivery').length}</p>
                            <p className="text-xs text-gray-500 mt-1">On Delivery</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <p className="text-2xl font-bold text-gray-400">{riders.filter(r => r.status === 'inactive' || r.status === 'off_duty').length}</p>
                            <p className="text-xs text-gray-500 mt-1">Off Duty / Inactive</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600"
                                placeholder="Search riders..." />
                        </div>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 bg-white">
                            <option value="all">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="on_delivery">On Delivery</option>
                            <option value="off_duty">Off Duty</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    {/* Riders Grid */}
                    {filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
                            <i className="ri-e-bike-2-line text-4xl mb-3 block" />
                            <p className="font-medium">No riders found</p>
                            <p className="text-sm mt-1">Add riders to start assigning deliveries</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered.map(rider => {
                                const successRate = rider.total_deliveries > 0
                                    ? Math.round((rider.successful_deliveries / rider.total_deliveries) * 100) : 0;
                                return (
                                    <div key={rider.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                                                    <i className={`${VEHICLE_ICONS[rider.vehicle_type] || 'ri-e-bike-2-line'} text-gray-700 text-xl`} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{rider.full_name}</p>
                                                    <p className="text-xs text-gray-500 capitalize">{rider.vehicle_type}
                                                        {rider.license_plate && ` — ${rider.license_plate}`}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[rider.status]}`}>
                                                {rider.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                                            <div className="flex items-center gap-2"><i className="ri-phone-line text-gray-400" /> {rider.phone}</div>
                                            {rider.email && <div className="flex items-center gap-2"><i className="ri-mail-line text-gray-400" /> {rider.email}</div>}
                                            <div className="flex items-center gap-2">
                                                <i className="ri-map-pin-line text-gray-400" />
                                                {rider.delivery_zones?.name || 'No zone assigned'}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 py-3 border-t border-gray-100">
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-gray-900">{rider.total_deliveries}</p>
                                                <p className="text-[10px] text-gray-500">Total</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-gray-700">{rider.successful_deliveries}</p>
                                                <p className="text-[10px] text-gray-500">Success</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-gray-700">{successRate}%</p>
                                                <p className="text-[10px] text-gray-500">Rate</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                                            <button onClick={() => openEditModal(rider)}
                                                className="flex-1 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                                                <i className="ri-edit-line mr-1" /> Edit
                                            </button>
                                            <button onClick={() => handleToggleStatus(rider)}
                                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                                                    rider.status === 'active' ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-700 hover:bg-gray-50'
                                                }`}>
                                                <i className={`${rider.status === 'active' ? 'ri-pause-line' : 'ri-play-line'} mr-1`} />
                                                {rider.status === 'active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button onClick={() => handleDelete(rider)}
                                                className="py-2 px-3 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                <i className="ri-delete-bin-line" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">{editingRider ? 'Edit Rider' : 'Add New Rider'}</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><i className="ri-close-line text-xl" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Full Name *</label>
                                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="Kwame Asante" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Phone Number *</label>
                                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="0551234567" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Email</label>
                                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="kwame@example.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">Vehicle Type</label>
                                    <select value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600">
                                        <option value="motorcycle">Motorcycle</option>
                                        <option value="bicycle">Bicycle</option>
                                        <option value="car">Car</option>
                                        <option value="van">Van</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">License Plate</label>
                                    <input type="text" value={form.license_plate} onChange={e => setForm(f => ({ ...f, license_plate: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                        placeholder="GW 1234-22" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Delivery Zone</label>
                                <select value={form.zone_id} onChange={e => setForm(f => ({ ...f, zone_id: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600">
                                    <option value="">No zone assigned</option>
                                    {zones.map(z => (<option key={z.id} value={z.id}>{z.name}</option>))}
                                </select>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
                                <button onClick={handleSave} disabled={saving}
                                    className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold disabled:opacity-50 transition-colors">
                                    {saving ? 'Saving...' : editingRider ? 'Update Rider' : 'Add Rider'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
