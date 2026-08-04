'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetch-timeout';

// Helper for currency formatting
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS'
  }).format(amount);
};

export default function CustomerInsightsPage() {
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Statistics
  const [stats, setStats] = useState({
    vip: 0,
    returning: 0,
    new: 0,
    atRisk: 0,
    avgCLV: 0
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchCustomerData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        limit: '200',
        segment: selectedSegment,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetchWithTimeout(`/api/admin/customer-insights?${params}`, {
        credentials: 'include',
        timeoutMs: 20_000,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message || json?.error || 'Failed to load insights');
      }
      setCustomers(Array.isArray(json.customers) ? json.customers : []);
      setStats({
        vip: Number(json.stats?.vip) || 0,
        returning: Number(json.stats?.returning) || 0,
        new: Number(json.stats?.new) || 0,
        atRisk: Number(json.stats?.atRisk) || 0,
        avgCLV: Number(json.stats?.avgCLV) || 0,
      });
    } catch (err: any) {
      console.error('Error fetching customer insights:', err);
      setLoadError(err?.message || 'Unable to load customer insights');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSegment, debouncedSearch]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  const filteredCustomers = customers;

  const getSegmentBadge = (segment: string) => {
    const badges: any = {
      vip: 'bg-gray-100 text-gray-900',
      returning: 'bg-blue-100 text-blue-700',
      new: 'bg-amber-100 text-amber-700',
      'at-risk': 'bg-red-100 text-red-700'
    };
    return badges[segment] || 'bg-gray-100 text-gray-700';
  };

  const getSegmentLabel = (segment: string) => {
    const labels: any = {
      vip: 'VIP Customer',
      returning: 'Returning',
      new: 'New Customer',
      'at-risk': 'At Risk'
    };
    return labels[segment] || segment;
  };

  const getRiskBadge = (risk: string) => {
    const badges: any = {
      low: 'bg-gray-100 text-gray-900',
      medium: 'bg-amber-100 text-amber-700',
      high: 'bg-red-100 text-red-700'
    };
    return badges[risk] || 'bg-gray-100';
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Insights...</div>;

  if (loadError) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="text-gray-900 font-semibold">Customer insights unavailable</p>
        <p className="text-sm text-gray-500">{loadError}</p>
        <button
          type="button"
          onClick={() => fetchCustomerData()}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Customer Insights</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Deep dive into customer behavior and lifetime value</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center justify-center">
              <i className="ri-download-line mr-2"></i>
              Export List
            </button>
            <Link
              href="/admin"
              className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                <i className="ri-vip-crown-line text-2xl text-gray-900"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">VIP Customers</p>
            <p className="text-3xl font-bold text-gray-900">{stats.vip}</p>
            <p className="text-sm text-gray-900 font-semibold mt-2">Spent &gt; GH₵1,000</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-refresh-line text-2xl text-blue-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Returning Customers</p>
            <p className="text-3xl font-bold text-gray-900">{stats.returning}</p>
            <p className="text-sm text-blue-700 font-semibold mt-2">More than 1 order</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg">
                <i className="ri-alert-line text-2xl text-red-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">At Risk</p>
            <p className="text-3xl font-bold text-gray-900">{stats.atRisk}</p>
            <p className="text-sm text-red-700 font-semibold mt-2">Inactive &gt; 90 days</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
                <i className="ri-line-chart-line text-2xl text-purple-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Avg. Lifetime Value</p>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.avgCLV)}</p>
            <p className="text-sm text-gray-500 mt-2">Per customer</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl"></i>
                <input
                  type="text"
                  placeholder="Search customers by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 bg-gray-100 rounded-lg p-1">
              {[
                { value: 'all', label: 'All', count: customers.length },
                { value: 'vip', label: 'VIP', count: stats.vip },
                { value: 'returning', label: 'Returning', count: stats.returning },
                { value: 'new', label: 'New', count: stats.new },
                { value: 'at-risk', label: 'At Risk', count: stats.atRisk }
              ].map((segment) => (
                <button
                  key={segment.value}
                  onClick={() => setSelectedSegment(segment.value)}
                  className={`px-3 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap flex-grow sm:flex-grow-0 ${selectedSegment === segment.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  {segment.label} ({segment.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">No customers found matching this criteria.</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div key={customer.id} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-16 h-16 flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-900 rounded-full text-white text-2xl font-bold">
                      {customer.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{customer.name}</h3>
                      <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                        <span className="flex items-center">
                          <i className="ri-mail-line mr-1"></i>
                          {customer.email}
                        </span>
                        <span className="flex items-center">
                          <i className="ri-phone-line mr-1"></i>
                          {customer.phone}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 mt-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSegmentBadge(customer.segment)} whitespace-nowrap`}>
                          {getSegmentLabel(customer.segment)}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskBadge(customer.riskLevel)} whitespace-nowrap`}>
                          {customer.riskLevel === 'low' && 'Low Risk'}
                          {customer.riskLevel === 'medium' && 'Medium Risk'}
                          {customer.riskLevel === 'high' && 'High Risk'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* <button className="text-gray-400 hover:text-gray-600 transition-colors">
                    <i className="ri-more-2-fill text-2xl"></i>
                    </button> */}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer.totalSpent)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{customer.orders}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Avg. Order</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer.avgOrderValue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Lifetime Value</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer.lifetimeValue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Engagement</p>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${customer.engagementScore >= 80 ? 'bg-gray-700' :
                            customer.engagementScore >= 60 ? 'bg-blue-600' :
                              customer.engagementScore >= 40 ? 'bg-amber-600' : 'bg-red-600'
                            }`}
                          style={{ width: `${customer.engagementScore}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold text-gray-900">{customer.engagementScore}%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <span>
                      <span className="font-medium">Joined:</span> {new Date(customer.joinDate).toLocaleDateString('en-GB')}
                    </span>
                    <span>
                      <span className="font-medium">Last Order:</span> {new Date(customer.lastOrder).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
