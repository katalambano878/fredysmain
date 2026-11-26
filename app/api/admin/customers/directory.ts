import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * The shop's customers, worked out on the server from the `customers` table and every order.
 *
 * An order belongs to a customer when it carries their account id, their email, or their
 * phone number (most shoppers check out as guests, and POS sales are matched by phone).
 * Staff logins are left out: they are not customers.
 */

export type DirectoryOrder = {
  id: string;
  order_number: string | null;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
};

export type DirectoryCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isGuest: boolean;
  /** Orders that were not cancelled. */
  orders: number;
  /** Money actually received: paid orders that were not cancelled or refunded. */
  totalSpent: number;
  lastOrderAt: string | null;
  joinedAt: string | null;
  orderList: DirectoryOrder[];
};

const PAGE = 1000;

async function all(table: string, select: string, order: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(select)
      .order(order, { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

const cleanEmail = (value: unknown) => String(value || '').trim().toLowerCase();
/** The last nine digits identify a Ghana number however it was typed (0244…, +233244…, 233244…). */
const phoneKey = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
};
/** POS sales with no email are stored under a made-up address like 0244000000@pos.local. */
const isPlaceholderEmail = (email: string) => email.endsWith('@pos.local') || email.startsWith('pos-walkin');

export function guestId(key: string): string {
  return `guest-${Buffer.from(key).toString('base64url')}`;
}

export async function loadCustomerDirectory(): Promise<DirectoryCustomer[]> {
  const [customerRows, orderRows, staffRes] = await Promise.all([
    all(
      'customers',
      'id, email, phone, full_name, first_name, last_name, user_id, secondary_phone, secondary_email, created_at',
      'created_at'
    ),
    all('orders', 'id, order_number, user_id, email, phone, total, status, payment_status, created_at, shipping_address', 'created_at'),
    supabaseAdmin.from('profiles').select('id, email').in('role', ['admin', 'staff']),
  ]);
  if (staffRes.error) throw new Error(staffRes.error.message);
  const staffIds = new Set<string>((staffRes.data || []).map((p: any) => String(p.id)));
  const staffEmails = new Set<string>((staffRes.data || []).map((p: any) => cleanEmail(p.email)).filter(Boolean));

  const byId = new Map<string, DirectoryCustomer>();
  const byUser = new Map<string, DirectoryCustomer>();
  const byEmail = new Map<string, DirectoryCustomer>();
  const byPhone = new Map<string, DirectoryCustomer>();

  for (const c of customerRows) {
    const email = cleanEmail(c.email);
    if ((c.user_id && staffIds.has(String(c.user_id))) || (email && staffEmails.has(email))) continue;
    const name =
      String(c.full_name || '').trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '';
    const entry: DirectoryCustomer = {
      id: String(c.id),
      name,
      email: isPlaceholderEmail(email) ? '' : email,
      phone: String(c.phone || '').trim(),
      isGuest: !c.user_id,
      orders: 0,
      totalSpent: 0,
      lastOrderAt: null,
      joinedAt: c.created_at || null,
      orderList: [],
    };
    byId.set(entry.id, entry);
    if (c.user_id) byUser.set(String(c.user_id), entry);
    for (const e of [email, cleanEmail(c.secondary_email)]) {
      if (e && !isPlaceholderEmail(e) && !byEmail.has(e)) byEmail.set(e, entry);
    }
    for (const p of [phoneKey(c.phone), phoneKey(c.secondary_phone)]) if (p && !byPhone.has(p)) byPhone.set(p, entry);
  }

  for (const o of orderRows) {
    const rawEmail = cleanEmail(o.email);
    if ((o.user_id && staffIds.has(String(o.user_id))) || (rawEmail && staffEmails.has(rawEmail))) continue;
    // Walk-in POS sales share one made-up email: it says nothing about who bought.
    const email = isPlaceholderEmail(rawEmail) ? '' : rawEmail;
    const phone = phoneKey(o.phone) || phoneKey(o.shipping_address?.phone);

    let entry =
      (o.user_id && byUser.get(String(o.user_id))) || (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || null;

    if (!entry) {
      // A buyer with no customer record: listed as a guest, found again by email or phone.
      const key = email ? `e:${email}` : phone ? `p:${phone}` : '';
      // A walk-in sale with no phone number cannot be tied to anyone.
      if (!key) continue;
      const address = o.shipping_address || {};
      const name =
        String(address.full_name || '').trim() || [address.firstName, address.lastName].filter(Boolean).join(' ').trim();
      entry = {
        id: guestId(key),
        name,
        email,
        phone: String(o.phone || address.phone || '').trim(),
        isGuest: true,
        orders: 0,
        totalSpent: 0,
        lastOrderAt: null,
        joinedAt: o.created_at || null,
        orderList: [],
      };
      byId.set(entry.id, entry);
      if (email) byEmail.set(email, entry);
      if (phone) byPhone.set(phone, entry);
    }

    const total = Number(o.total) || 0;
    const status = String(o.status || '');
    const paymentStatus = String(o.payment_status || '');
    entry.orderList.push({
      id: String(o.id),
      order_number: o.order_number || null,
      total,
      status,
      payment_status: paymentStatus,
      created_at: o.created_at,
    });
    if (status !== 'cancelled') entry.orders += 1;
    if (paymentStatus === 'paid' && status !== 'cancelled' && status !== 'refunded') entry.totalSpent += total;
    if (!entry.lastOrderAt || String(o.created_at) > entry.lastOrderAt) entry.lastOrderAt = o.created_at;
    if (!entry.joinedAt || String(o.created_at) < entry.joinedAt) entry.joinedAt = o.created_at;
    if (!entry.name) {
      const address = o.shipping_address || {};
      entry.name =
        String(address.full_name || '').trim() || [address.firstName, address.lastName].filter(Boolean).join(' ').trim();
    }
  }

  const list = Array.from(byId.values());
  for (const entry of list) entry.totalSpent = Math.round(entry.totalSpent * 100) / 100;
  return list;
}
