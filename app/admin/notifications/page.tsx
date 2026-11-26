'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function NotificationsPage() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        subject: '',
        message: '',
        channels: { email: true, sms: false },
    });

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (!form.channels.email && !form.channels.sms) {
            setError('Tick Email, SMS or both.');
            return;
        }
        if (form.channels.email && !form.subject.trim()) {
            setError('Give the email a subject.');
            return;
        }
        if (!form.message.trim()) {
            setError('Write the message first.');
            return;
        }
        setLoading(true);

        try {
            // 1. Get auth token for admin verification
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('You must be logged in as admin to send campaigns');
            }

            // 2. Fetch Recipients from the customers table (includes secondary contacts)
            const { data: customers, error: fetchError } = await supabase
                .from('customers')
                .select('email, phone, full_name, secondary_phone, secondary_email');

            if (fetchError) throw fetchError;

            // Build recipients with deduplication
            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();

            const normalizePhone = (p: string) => p.replace(/[\s\-\(\)\.]+/g, '').replace(/^00/, '+');

            const recipients: any[] = [];
            for (const c of (customers || [])) {
                const phones = [c.phone, c.secondary_phone].filter(Boolean).map((p: string) => normalizePhone(p));
                // Walk-in POS customers are stored under a made-up address (0244000000@pos.local): never email those.
                const emails = [c.email, c.secondary_email]
                    .filter(Boolean)
                    .map((e: string) => e.toLowerCase().trim())
                    .filter((e: string) => !e.endsWith('.local'));

                // Pick first unique phone for this customer
                const uniquePhone = phones.find(p => !seenPhones.has(p)) || null;
                if (uniquePhone) seenPhones.add(uniquePhone);

                // Pick first unique email for this customer
                const uniqueEmail = emails.find(e => !seenEmails.has(e)) || null;
                if (uniqueEmail) seenEmails.add(uniqueEmail);

                // Also mark all their contact info as seen to avoid duplicates from other customers
                phones.forEach(p => seenPhones.add(p));
                emails.forEach(e => seenEmails.add(e));

                const recipient = { email: uniqueEmail, phone: uniquePhone, name: c.full_name };

                // Filter based on selected channels
                if (form.channels.sms && !form.channels.email && !recipient.phone) continue;
                if (form.channels.email && !form.channels.sms && !recipient.email) continue;
                if (!recipient.email && !recipient.phone) continue;

                recipients.push(recipient);
            }

            if (recipients.length === 0) throw new Error('No recipients found with valid contact info');

            // Confirm before sending
            const smsCount = recipients.filter(r => r.phone).length;
            const emailCount = recipients.filter(r => r.email).length;
            const summary = [];
            if (form.channels.sms) summary.push(`${smsCount} SMS (deduplicated)`);
            if (form.channels.email) summary.push(`${emailCount} emails`);

            if (!window.confirm(`This will send ${summary.join(' and ')} to your customers. Continue?`)) {
                setLoading(false);
                return;
            }

            // 3. Send in batches to avoid API timeout
            const BATCH_SIZE = 50;
            let totalEmail = 0;
            let totalSms = 0;
            let totalErrors = 0;

            for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                const batch = recipients.slice(i, i + BATCH_SIZE);

                const res = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        type: 'campaign',
                        payload: {
                            recipients: batch,
                            // A subject only matters for email. A text-only campaign still sends a short
                            // label so the request is accepted either way.
                            subject: form.channels.email ? form.subject.trim() : form.subject.trim() || 'SMS campaign',
                            message: form.message,
                            channels: form.channels,
                        }
                    })
                });

                // Handle non-JSON responses (e.g. timeouts, server errors)
                let data;
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    data = await res.json();
                } else {
                    const text = await res.text();
                    throw new Error(`Server error (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${text.slice(0, 100)}`);
                }

                if (!res.ok) throw new Error(data.error || 'Failed to send');

                // Parse results from response
                const msg = data.message || '';
                const emailMatch = msg.match(/(\d+) emails/);
                const smsMatch = msg.match(/(\d+) SMS/);
                const errorMatch = msg.match(/(\d+) failed/);
                if (emailMatch) totalEmail += parseInt(emailMatch[1]);
                if (smsMatch) totalSms += parseInt(smsMatch[1]);
                if (errorMatch) totalErrors += parseInt(errorMatch[1]);
            }

            const resultParts = [];
            if (totalEmail > 0) resultParts.push(`${totalEmail} emails`);
            if (totalSms > 0) resultParts.push(`${totalSms} SMS`);
            const errorNote = totalErrors > 0 ? ` (${totalErrors} failed)` : '';
            setSuccess(`Campaign sent successfully! ${resultParts.join(', ')} sent.${errorNote}`);
            setForm(prev => ({ ...prev, subject: '', message: '' }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Marketing & Notifications</h1>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-semibold mb-6">Send New Campaign</h2>

                {success && <div className="bg-gray-50 text-gray-900 p-4 rounded-lg mb-4">{success}</div>}
                {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">{error}</div>}

                <form onSubmit={handleSend} className="space-y-6">
                    <p className="text-sm text-gray-600">
                        This goes to every customer on record who has the contact detail for the channel you choose.
                    </p>

                    <div className="flex gap-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.channels.email}
                                onChange={e => setForm({ ...form, channels: { ...form.channels, email: e.target.checked } })}
                                className="w-5 h-5 text-gray-700 rounded focus:ring-gray-600 cursor-pointer"
                            />
                            <span className="font-medium text-gray-900">Send Email</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.channels.sms}
                                onChange={e => setForm({ ...form, channels: { ...form.channels, sms: e.target.checked } })}
                                className="w-5 h-5 text-gray-700 rounded focus:ring-gray-600 cursor-pointer"
                            />
                            <span className="font-medium text-gray-900">Send SMS</span>
                        </label>
                    </div>

                    {form.channels.email && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Subject</label>
                            <input
                                type="text"
                                value={form.subject}
                                onChange={e => setForm({ ...form, subject: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gray-600"
                                placeholder="e.g., Summer Sale Starts Now!"
                                required={form.channels.email}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Message Content</label>
                        <textarea
                            value={form.message}
                            onChange={e => setForm({ ...form, message: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg h-40 outline-none focus:ring-2 focus:ring-gray-600"
                            placeholder="Write your message here... For emails, this supports plain text."
                            required
                        />
                        <p className="text-sm text-gray-500 mt-1">This message will be used for the email body (wrapped in a template) and SMS content (if selected).</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || (!form.channels.email && !form.channels.sms)}
                        className="w-full bg-gray-900 text-white py-4 rounded-lg font-bold text-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <i className="ri-loader-4-line animate-spin mr-2"></i> Sending...
                            </span>
                        ) : 'Send Campaign'}
                    </button>
                </form>
            </div>
        </div>
    );
}
