'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { adminFetch } from '@/lib/admin-fetch';

export default function AdminCustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sortOption, setSortOption] = useState('Sort by Join Date');
  const [filterStatus, setFilterStatus] = useState('All Customers');

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // Built on the server from the customers table and every order (matched by account, email or phone).
      const data = await adminFetch<{ customers: any[] }>('/api/admin/customers');
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const processed = (data.customers || []).map((c: any) => {
        const joined = c.joinedAt ? new Date(c.joinedAt) : null;
        const lastOrder = c.lastOrderAt ? new Date(c.lastOrderAt) : null;
        let status = 'New';
        if (c.totalSpent > 1000) status = 'VIP';
        else if (c.orders > 0) status = 'Active';
        else if (joined && joined.getTime() < monthAgo) status = 'Inactive';
        const name = c.name || 'No name given';
        return {
          id: c.id,
          name,
          email: c.email || '',
          phone: c.phone || '',
          avatar: getInitials(c.name || c.email || c.phone || '?'),
          orders: c.orders,
          totalSpent: c.totalSpent,
          joined: joined ? joined.toLocaleDateString() : 'Unknown',
          lastOrder: lastOrder ? timeAgo(lastOrder) : 'Never',
          status,
          rawJoined: joined || new Date(0),
          rawLastOrder: lastOrder,
          isGuest: c.isGuest,
        };
      });
      setCustomers(processed);
      setLoadError('');
    } catch (error) {
      console.error('Error fetching customers:', error);
      setLoadError(error instanceof Error ? error.message : 'The customers could not load.');
    } finally {
      setLoading(false);
    }
  };

  /** Download the given rows as a spreadsheet file. */
  const exportCustomers = (rows: any[]) => {
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Name', 'Email', 'Phone', 'Orders', 'Total spent (GHS)', 'Last order', 'Joined', 'Status', 'Account'].map(quote).join(','),
      ...rows.map((c) =>
        [
          c.name,
          c.email,
          c.phone,
          c.orders,
          c.totalSpent.toFixed(2),
          c.rawLastOrder ? c.rawLastOrder.toISOString().slice(0, 10) : '',
          c.rawJoined.getTime() > 0 ? c.rawJoined.toISOString().slice(0, 10) : '',
          c.status,
          c.isGuest ? 'Guest' : 'Registered',
        ]
          .map(quote)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  };

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    return "Just now";
  }

  const statusColors: any = {
    'New': 'bg-blue-100 text-blue-700',
    'Active': 'bg-gray-100 text-gray-900',
    'VIP': 'bg-purple-100 text-purple-700',
    'Inactive': 'bg-gray-100 text-gray-700'
  };

  const handleSelectAll = () => {
    // Only the rows on screen: a search or filter must not select hidden customers.
    const shown = filteredCustomers.map(c => c.id);
    if (shown.length > 0 && shown.every(id => selectedCustomers.includes(id))) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(shown);
    }
  };

  const handleSelectCustomer = (customerId: string) => {
    if (selectedCustomers.includes(customerId)) {
      setSelectedCustomers(selectedCustomers.filter(id => id !== customerId));
    } else {
      setSelectedCustomers([...selectedCustomers, customerId]);
    }
  };

  // Memoized filter and sort
  const filteredCustomers = useMemo(() => {
    let result = customers;

    // Filter by Status
    if (filterStatus !== 'All Customers') {
      result = result.filter(c => c.status === filterStatus);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q.replace(/\s+/g, ''))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortOption === 'Sort by Name') return a.name.localeCompare(b.name);
      if (sortOption === 'Sort by Orders') return b.orders - a.orders;
      if (sortOption === 'Sort by Spent') return b.totalSpent - a.totalSpent;
      if (sortOption === 'Sort by Join Date') return b.rawJoined.getTime() - a.rawJoined.getTime();
      return 0;
    });

    return result;
  }, [customers, searchQuery, sortOption, filterStatus]);

  // Derived Stats
  const stats = useMemo(() => ({
    total: customers.length,
    newThisMonth: customers.filter(c => {
      const d = new Date(c.rawJoined);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    vip: customers.filter(c => c.status === 'VIP').length,
    avgLTV: customers.length > 0 ? (customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length) : 0
  }), [customers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600 mt-1">Manage your customer base and relationships</p>
        </div>
        <button
          onClick={() => exportCustomers(filteredCustomers)}
          disabled={loading || filteredCustomers.length === 0}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-download-line mr-2" aria-hidden></i>
          Export Customers
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Customers</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">New This Month</p>
          <p className="text-2xl font-bold text-gray-900">{stats.newThisMonth}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">VIP Customers</p>
          <p className="text-2xl font-bold text-purple-700">{stats.vip}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Lifetime Value</p>
          <p className="text-2xl font-bold text-gray-900">GH₵ {stats.avgLTV.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option>All Customers</option>
                <option>New</option>
                <option>Active</option>
                <option>VIP</option>
                <option>Inactive</option>
              </select>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option>Sort by Join Date</option>
                <option>Sort by Name</option>
                <option>Sort by Orders</option>
                <option>Sort by Spent</option>
              </select>
            </div>
          </div>
        </div>

        {selectedCustomers.length > 0 && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-gray-800 font-semibold">
              {selectedCustomers.length} customer{selectedCustomers.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => exportCustomers(customers.filter((c) => selectedCustomers.includes(c.id)))}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line mr-2" aria-hidden></i>
                Export selected
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
                    checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedCustomers.includes(c.id))}
                    aria-label="Select all customers shown"
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Contact</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Orders</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total Spent</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Last Order</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-10 text-center text-gray-500">Loading customers...</td></tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <p className="font-medium text-gray-900">The customers could not load.</p>
                    <p className="text-sm text-gray-600 mt-1">{loadError}</p>
                    <button onClick={fetchCustomers} className="mt-3 px-4 py-2 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50">
                      Try again
                    </button>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-gray-500">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.includes(customer.id)}
                        onChange={() => handleSelectCustomer(customer.id)}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 text-gray-900 rounded-full font-semibold">
                          {customer.avatar}
                        </div>
                        <div>
                          <Link href={`/admin/customers/${customer.id}`} className="font-semibold text-gray-900 hover:text-gray-900 whitespace-nowrap">
                            {customer.name}
                          </Link>
                          <p className="text-sm text-gray-500">Joined {customer.joined}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-gray-700 text-sm">{customer.email || 'No email'}</p>
                      <p className="text-gray-600 text-sm">{customer.phone || 'No phone'}</p>
                    </td>
                    <td className="py-4 px-4 font-semibold text-gray-900">{customer.orders}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">GH₵ {customer.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{customer.lastOrder}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[customer.status]}`}>
                          {customer.status}
                        </span>
                        {customer.isGuest && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Guest
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          aria-label={`View ${customer.name}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <i className="ri-eye-line text-lg" aria-hidden></i>
                        </Link>
                        {customer.email && (
                          <a
                            href={`mailto:${customer.email}`}
                            aria-label={`Email ${customer.name}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <i className="ri-mail-line text-lg" aria-hidden></i>
                          </a>
                        )}
                        {customer.phone && (
                          <a
                            href={`tel:${customer.phone}`}
                            aria-label={`Call ${customer.name}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <i className="ri-phone-line text-lg" aria-hidden></i>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-600">Showing {filteredCustomers.length} of {customers.length} customers</p>
          <div className="flex items-center space-x-2">
            {/* Simple pagination place holder logic or hidden if few */}
          </div>
        </div>
      </div>
    </div>
  );
}
