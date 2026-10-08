'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'admin' | 'staff';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  admin: { label: 'Super Admin', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: 'ri-shield-star-line' },
  staff: { label: 'Staff', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: 'ri-shield-user-line' },
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [canDeleteStaff, setCanDeleteStaff] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', phone: '', role: 'staff', password: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Edit modal state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', role: 'staff' });
  const [editLoading, setEditLoading] = useState(false);

  // Remove confirmation
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff', { credentials: 'include' });
      const data = await res.json();
      if (data.staff) setStaff(data.staff);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      let role: string | null = null;
      let canDelete = false;
      try {
        const res = await fetch('/api/admin/me', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          role = json?.profile?.role != null ? String(json.profile.role) : null;
          setCurrentUserId(json?.user?.id ?? null);
          canDelete = role === 'admin' || json?.permissions?.delete_staff === true;
        }
      } catch (err) {
        console.error('Error loading current user:', err);
      }
      if (!role) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setCurrentUserId(session.user.id);
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
          if (profile) role = profile.role;
        }
      }
      setUserRole(role);
      setCanDeleteStaff(canDelete);
      fetchStaff();
    }
    init();
  }, [fetchStaff]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: inviteForm.email,
          fullName: inviteForm.fullName,
          phone: inviteForm.phone,
          role: inviteForm.role,
          password: inviteForm.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error || 'Failed to add staff member.');
        return;
      }

      setInviteSuccess(data.message || 'Staff member added successfully!');
      setInviteForm({ email: '', fullName: '', phone: '', role: 'staff', password: '' });
      fetchStaff();
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess('');
      }, 2000);
    } catch {
      setInviteError('Network error. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStaff) return;
    setEditLoading(true);

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: editingStaff.id,
          fullName: editForm.fullName,
          phone: editForm.phone,
          role: editForm.role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update.');
        return;
      }

      setEditingStaff(null);
      fetchStaff();
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveLoading(true);
    try {
      const res = await fetch(`/api/admin/staff?userId=${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to remove staff.');
        return;
      }
      setRemovingId(null);
      fetchStaff();
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setRemoveLoading(false);
    }
  }

  function openEdit(member: StaffMember) {
    setEditingStaff(member);
    setEditForm({
      fullName: member.full_name || '',
      phone: member.phone || '',
      role: member.role,
    });
  }

  if (userRole !== 'admin' && !canDeleteStaff) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <i className="ri-lock-line text-5xl text-gray-300 mb-4 block" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Super Admins can manage staff members.</p>
        </div>
      </div>
    );
  }

  const canManage = userRole === 'admin';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-gray-200 rounded-lg w-48 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const admins = staff.filter(s => s.role === 'admin');
  const staffMembers = staff.filter(s => s.role === 'staff');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600 mt-1">
            {staff.length} team member{staff.length !== 1 ? 's' : ''} &middot;
            {' '}{admins.length} admin{admins.length !== 1 ? 's' : ''}, {staffMembers.length} staff
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setShowInviteModal(true);
              setInviteError('');
              setInviteSuccess('');
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white font-semibold rounded-xl hover:bg-gray-900 transition-colors shadow-sm cursor-pointer"
          >
            <i className="ri-user-add-line text-lg" />
            Add Staff
          </button>
        )}
      </div>

      {/* Staff List */}
      <div className="grid gap-4">
        {staff.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <i className="ri-team-line text-5xl text-gray-300 mb-4 block" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">No staff members yet</h3>
            <p className="text-gray-500 mb-4">Add your first team member to get started.</p>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-900 transition-colors cursor-pointer"
            >
              Add Staff Member
            </button>
          </div>
        ) : (
          staff.map(member => {
            const roleMeta = ROLE_LABELS[member.role] || ROLE_LABELS.staff;
            const isCurrentUser = member.id === currentUserId;
            const initials = (member.full_name || member.email)
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={member.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.full_name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-100"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${
                        member.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-900'
                      }`}>
                        {initials}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900">{member.full_name || 'Unnamed'}</h3>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase">You</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{member.email}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleMeta.color}`}>
                          <i className={`${roleMeta.icon} text-sm`} />
                          {roleMeta.label}
                        </span>
                        {member.phone && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <i className="ri-phone-line" />
                            {member.phone}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          Added {new Date(member.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManage && (
                      <button
                        onClick={() => openEdit(member)}
                        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <i className="ri-pencil-line text-lg" />
                      </button>
                    )}
                    {!isCurrentUser && (canManage || member.role !== 'admin') && (
                      <button
                        onClick={() => setRemovingId(member.id)}
                        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove staff access"
                      >
                        <i className="ri-user-unfollow-line text-lg" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Remove Confirmation */}
                {removingId === member.id && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-red-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <i className="ri-error-warning-line text-red-500 text-lg" />
                        <p className="text-sm text-red-800">
                          Remove <strong>{member.full_name}</strong> from staff? They will be demoted to a regular customer.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRemovingId(null)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRemove(member.id)}
                          disabled={removeLoading}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                        >
                          {removeLoading ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInviteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <i className="ri-user-add-line text-xl text-gray-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Add Staff Member</h2>
                    <p className="text-xs text-gray-500">Create a new account with admin panel access</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
            </div>

            <form onSubmit={handleInvite} className="p-6 space-y-4">
              {inviteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line text-lg" />
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 flex items-center gap-2">
                  <i className="ri-check-line text-lg" />
                  {inviteSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={inviteForm.fullName}
                  onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))}
                  required
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  required
                  placeholder="staff@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password *</label>
                <input
                  type="password"
                  value={inviteForm.password}
                  onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Share this password with the staff member for their first login.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. 0535998837"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteForm(f => ({ ...f, role: 'staff' }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      inviteForm.role === 'staff'
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <i className="ri-shield-user-line text-gray-700" />
                      <span className="font-semibold text-sm text-gray-900">Staff</span>
                    </div>
                    <p className="text-xs text-gray-500">Limited access based on role permissions</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteForm(f => ({ ...f, role: 'admin' }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      inviteForm.role === 'admin'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <i className="ri-shield-star-line text-amber-600" />
                      <span className="font-semibold text-sm text-gray-900">Admin</span>
                    </div>
                    <p className="text-xs text-gray-500">Full access to everything</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 px-4 py-2.5 bg-gray-700 text-white font-semibold rounded-xl hover:bg-gray-900 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {inviteLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="ri-loader-4-line animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    'Add Staff Member'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingStaff(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <i className="ri-pencil-line text-xl text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Edit Staff Member</h2>
                    <p className="text-xs text-gray-500">{editingStaff.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingStaff(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role</label>
                {editingStaff.id === currentUserId ? (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <i className="ri-lock-line" />
                      You cannot change your own role.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, role: 'staff' }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        editForm.role === 'staff'
                          ? 'border-gray-300 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <i className="ri-shield-user-line text-gray-700" />
                        <span className="font-semibold text-sm text-gray-900">Staff</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, role: 'admin' }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        editForm.role === 'admin'
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <i className="ri-shield-star-line text-amber-600" />
                        <span className="font-semibold text-sm text-gray-900">Admin</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 px-4 py-2.5 bg-gray-700 text-white font-semibold rounded-xl hover:bg-gray-900 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
