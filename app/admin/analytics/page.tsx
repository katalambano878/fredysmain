'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30days');
  const [reportType, setReportType] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [salesData, setSalesData] = useState<any[]>([]);
  const [categoryRevenue, setCategoryRevenue] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);

  const [metrics, setMetrics] = useState({
    revenue: 0,
    revenueGrowth: 0,
    orders: 0,
    ordersGrowth: 0,
    aov: 0,
    aovGrowth: 0,
    conversion: 0,
    conversionGrowth: 0
  });

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchWithTimeout(
        `/api/admin/analytics?range=${encodeURIComponent(timeRange)}`,
        { credentials: 'include', timeoutMs: 25_000 }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message || json?.error || 'Analytics failed to load');
      }
      setMetrics({
        revenue: Number(json.metrics?.revenue) || 0,
        revenueGrowth: Number(json.metrics?.revenueGrowth) || 0,
        orders: Number(json.metrics?.orders) || 0,
        ordersGrowth: Number(json.metrics?.ordersGrowth) || 0,
        aov: Number(json.metrics?.aov) || 0,
        aovGrowth: Number(json.metrics?.aovGrowth) || 0,
        conversion: Number(json.metrics?.conversion) || 0,
        conversionGrowth: Number(json.metrics?.conversionGrowth) || 0,
      });
      setSalesData(Array.isArray(json.salesData) ? json.salesData : []);
      setCategoryRevenue(Array.isArray(json.categoryRevenue) ? json.categoryRevenue : []);
      setTopProducts(Array.isArray(json.topProducts) ? json.topProducts : []);
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setLoadError(err?.message || 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const COLORS = ['#171717', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Analytics...</div>;
  }

  if (loadError) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="text-gray-900 font-semibold">Analytics unavailable</p>
        <p className="text-sm text-gray-500">{loadError}</p>
        <button
          type="button"
          onClick={() => fetchAnalytics()}
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
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Advanced Analytics</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Detailed insights and performance metrics</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium pr-8 cursor-pointer bg-white"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="year">This Year</option>
            </select>
            <button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center">
              <i className="ri-download-line mr-2"></i>
              Export
            </button>
            <Link
              href="/admin"
              className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
            >
              Back
            </Link>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg">
                <i className="ri-money-dollar-circle-line text-2xl text-gray-900"></i>
              </div>
              <span className="text-gray-900 font-semibold text-sm">Live</span>
            </div>
            <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
            <p className="text-3xl font-bold text-gray-900">GH₵{metrics.revenue.toLocaleString()}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-lg">
                <i className="ri-shopping-cart-line text-2xl text-blue-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Total Orders</p>
            <p className="text-3xl font-bold text-gray-900">{metrics.orders}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg">
                <i className="ri-bar-chart-box-line text-2xl text-purple-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Avg. Order Value</p>
            <p className="text-3xl font-bold text-gray-900">GH₵{metrics.aov.toFixed(2)}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-lg">
                <i className="ri-percent-line text-2xl text-amber-700"></i>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">Conversion Rate</p>
            <p className="text-3xl font-bold text-gray-900">--</p>
            <p className="text-xs text-gray-400 mt-1">Setup Tracking</p>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Revenue & Performance Trends</h2>
            {/* Report Type Toggles omitted for brevity, hardcoded to Sales for now */}
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <AreaChart data={salesData.length > 0 ? salesData : [{ date: 'No Data', sales: 0 }]}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#171717" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#171717" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="sales" stroke="#171717" fillOpacity={1} fill="url(#colorSales)" name="Sales (GH₵)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Pie Chart */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Revenue by Category</h2>
            <div className="flex items-center justify-center mb-6">
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={categoryRevenue.length > 0 ? categoryRevenue : [{ name: 'No Data', value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryRevenue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Top Performing Products</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left pb-3 text-sm font-semibold text-gray-600">Product</th>
                    <th className="text-right pb-3 text-sm font-semibold text-gray-600">Units</th>
                    <th className="text-right pb-3 text-sm font-semibold text-gray-600">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topProducts.map((product, index) => (
                    <tr key={index}>
                      <td className="py-3 text-sm font-medium text-gray-900">{product.name}</td>
                      <td className="py-3 text-right text-sm text-gray-600">{product.units}</td>
                      <td className="py-3 text-right text-sm font-semibold text-gray-700">GH₵{product.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No sales data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
