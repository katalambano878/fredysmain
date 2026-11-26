'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
  category: string;
}

const colorMap: Record<string, string> = {
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-purple-100 text-purple-600',
  emerald: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-600',
  amber: 'bg-amber-100 text-amber-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  gray: 'bg-gray-100 text-gray-600'
};

export default function ModulesPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Base definitions of modules
  const [modules, setModules] = useState<Module[]>([
    {
      id: 'notifications',
      name: 'Marketing Notifications',
      description: 'Send Email and SMS campaigns to customers',
      icon: 'ri-notification-3-line',
      color: 'red',
      enabled: false,
      category: 'Marketing'
    },
    {
      id: 'blog',
      name: 'Blog Management',
      description: 'Create and manage blog posts',
      icon: 'ri-article-line',
      color: 'gray',
      enabled: false,
      category: 'Marketing'
    },
    {
      id: 'customer-insights',
      name: 'Customer Insights',
      description: 'Advanced analytics on customer behavior',
      icon: 'ri-user-search-line',
      color: 'orange',
      enabled: false,
      category: 'Analytics'
    },
    {
      id: 'ai-chat',
      name: 'AI Chat Assistant',
      description: 'Floating AI chatbot and support assistant on the storefront',
      icon: 'ri-robot-2-line',
      color: 'gray',
      enabled: false,
      category: 'Support'
    },
    {
      id: 'maintenance-mode',
      name: 'Maintenance Mode',
      description: 'Put storefront in maintenance mode while keeping admin accessible',
      icon: 'ri-tools-line',
      color: 'red',
      enabled: false,
      category: 'System'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    fetchModuleStates();
  }, []);

  const fetchModuleStates = async () => {
    try {
      const { data, error } = await supabase.from('store_modules').select('*');
      if (error) throw error;

      if (data) {
        setModules(prev => prev.map(m => {
          const dbState = data.find((d: any) => d.id === m.id);
          return dbState ? { ...m, enabled: dbState.enabled } : m;
        }));
      }
      setLoadError('');
    } catch (err) {
      console.error('Error fetching modules:', err);
      setLoadError('The current settings could not load, so the switches below may not show what is really on. Refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (id: string, currentState: boolean) => {
    const newState = !currentState;

    // Maintenance mode closes the shop to customers, so make sure it is meant.
    if (id === 'maintenance-mode' && newState) {
      if (!confirm('Turn on maintenance mode? Customers will see a "back soon" page and cannot shop until you turn it off.')) return;
    }

    // Optimistic Update
    setModules(prev => prev.map(m =>
      m.id === id ? { ...m, enabled: newState } : m
    ));

    try {
      const res = await fetch('/api/admin/modules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, enabled: newState }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }

      // Optional: refetch so storefront sees change without full reload
      fetchModuleStates();
    } catch (err) {
      console.error('Error updating module:', err);
      // Revert optimistic update
      setModules(prev => prev.map(m =>
        m.id === id ? { ...m, enabled: currentState } : m
      ));
      alert(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const categories = ['all', ...Array.from(new Set(modules.map(m => m.category)))];

  const filteredModules = modules.filter(module => {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      module.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || module.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedModules = filteredModules.reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  }, {} as Record<string, typeof modules>);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Modules & Features</h1>
        {loadError && (
          <p role="alert" className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>
        )}
        <p className="text-gray-600 mb-8">Enable or disable features to customize your admin dashboard.</p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search modules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 outline-none"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg outline-none"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading modules...</div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedModules).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-gray-600 pl-3">{category}</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(module => (
                    <div key={module.id} className={`bg-white rounded-xl border-2 p-6 transition-all ${module.enabled ? 'border-gray-600 shadow-md' : 'border-gray-200 opacity-75'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorMap[module.color] || 'bg-gray-100 text-gray-600'}`}>
                          <i className={`${module.icon} text-2xl`}></i>
                        </div>
                        <button
                          onClick={() => toggleModule(module.id, module.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${module.enabled ? 'bg-gray-700' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${module.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{module.name}</h3>
                      <p className="text-sm text-gray-500 mt-1 h-10">{module.description}</p>
                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${module.enabled ? 'bg-gray-100 text-gray-900' : 'bg-gray-100 text-gray-600'}`}>
                          {module.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
