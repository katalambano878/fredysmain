import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { sendPaymentLink, sendOrderConfirmation } from '@/lib/notifications';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    if (parsed?.access_token) return parsed.access_token;
    if (typeof parsed === 'string') return parsed;
  } catch {
    return decoded;
  }
  return null;
}

async function requireAdminOrStaff(
  request: Request
): Promise<{ error: NextResponse } | { userId: string; fullName: string | null }> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 }) };
  }
  const token = getAccessToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: user.id, fullName: profile?.full_name || null };
}

const SOURCES = new Set(['phone', 'whatsapp', 'walk_in', 'other']);
const PAYMENT_ACTIONS = new Set([
  'unpaid',
  'send_payment_link',
  'mark_paid_cash',
  'mark_paid_momo',
  'deposit_cash',
]);

function asMoney(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
}

function sanitizePhone(phone: string): string {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

function syntheticEmail(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits || 'preorder'}@preorder.local`;
}

function buildVariantLabel(item: any): string | null {
  if (item.variant_name) return String(item.variant_name).trim() || null;
  const parts = [item.size, item.color, item.fabric].filter(
    (p) => typeof p === 'string' && p.trim()
  );
  return parts.length ? parts.map((p: string) => p.trim()).join(' · ') : null;
}

/**
 * POST /api/admin/preorders
 * Staff-created phone / WhatsApp / walk-in / custom made-to-order preorders.
 */
export async function POST(request: Request) {
  const auth = await requireAdminOrStaff(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const source = String(body.source || 'phone').toLowerCase();
    const paymentAction = String(body.paymentAction || 'unpaid').toLowerCase();
    const shippingMethod = body.shippingMethod === 'doorstep' ? 'doorstep' : 'pickup';
    const customer = body.customer || {};
    const itemsIn = Array.isArray(body.items) ? body.items : [];

    if (!SOURCES.has(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }
    if (!PAYMENT_ACTIONS.has(paymentAction)) {
      return NextResponse.json({ error: 'Invalid payment action' }, { status: 400 });
    }

    const firstName = String(customer.firstName || '').trim();
    const lastName = String(customer.lastName || '').trim();
    const phone = sanitizePhone(String(customer.phone || ''));
    let email = String(customer.email || '').trim().toLowerCase();

    if (!firstName && !lastName) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }
    if (!phone || phone.replace(/\D/g, '').length < 9) {
      return NextResponse.json({ error: 'A valid customer phone is required' }, { status: 400 });
    }
    if (!email) email = syntheticEmail(phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@preorder.local')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    if (itemsIn.length === 0) {
      return NextResponse.json({ error: 'Add at least one preorder item' }, { status: 400 });
    }

    const lineItems: any[] = [];
    for (const raw of itemsIn) {
      const productName = String(raw.product_name || raw.name || '').trim();
      const qty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      const unit = asMoney(raw.unit_price ?? raw.price);
      if (!productName) {
        return NextResponse.json({ error: 'Each item needs a name / description' }, { status: 400 });
      }
      if (!(unit > 0)) {
        return NextResponse.json(
          { error: `Set a price for “${productName}”` },
          { status: 400 }
        );
      }
      const isCustom = raw.type === 'custom' || !raw.product_id;
      let productId: string | null = raw.product_id || null;
      if (productId && !/^[0-9a-f-]{36}$/i.test(productId)) {
        return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
      }
      if (productId) {
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('id, name')
          .eq('id', productId)
          .maybeSingle();
        if (!product) {
          return NextResponse.json({ error: `Product not found: ${productName}` }, { status: 400 });
        }
      }

      const variantName = buildVariantLabel(raw);
      lineItems.push({
        product_id: isCustom ? null : productId,
        product_name: productName,
        variant_name: variantName,
        quantity: qty,
        unit_price: unit,
        total_price: asMoney(unit * qty),
        is_preorder: true,
        metadata: {
          is_preorder: true,
          line_type: isCustom ? 'custom' : 'catalog',
          fabric: raw.fabric ? String(raw.fabric).trim() : null,
          color: raw.color ? String(raw.color).trim() : null,
          size: raw.size ? String(raw.size).trim() : null,
          style: raw.style ? String(raw.style).trim() : null,
          notes: raw.notes ? String(raw.notes).trim() : null,
          image: raw.image || null,
        },
      });
    }

    const subtotal = asMoney(lineItems.reduce((s, i) => s + i.total_price, 0));
    const total = subtotal;
    let depositAmount = asMoney(body.depositAmount);
    if (depositAmount > total) depositAmount = total;
    if (paymentAction === 'deposit_cash' && !(depositAmount > 0)) {
      return NextResponse.json(
        { error: 'Enter a deposit amount greater than 0' },
        { status: 400 }
      );
    }
    if (
      (paymentAction === 'mark_paid_cash' || paymentAction === 'mark_paid_momo') &&
      depositAmount > 0 &&
      depositAmount < total
    ) {
      // Full pay actions ignore partial deposit field
      depositAmount = 0;
    }

    const address = body.address || {};
    if (shippingMethod === 'doorstep') {
      if (!String(address.address || '').trim() || !String(address.city || '').trim()) {
        return NextResponse.json(
          { error: 'Delivery address and city are required for doorstep' },
          { status: 400 }
        );
      }
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const shippingAddress = {
      firstName,
      lastName,
      full_name: fullName,
      email,
      phone,
      address: String(address.address || '').trim() || null,
      city: String(address.city || '').trim() || null,
      region: String(address.region || '').trim() || null,
    };

    const orderNumber = `PRE-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const promisedDate = body.promisedDate ? String(body.promisedDate).trim() : null;
    const adminNotes = body.adminNotes ? String(body.adminNotes).trim() : null;
    const customerNotes = body.customerNotes ? String(body.customerNotes).trim() : null;

    const markFullyPaid =
      paymentAction === 'mark_paid_cash' || paymentAction === 'mark_paid_momo';
    const paymentMethod =
      paymentAction === 'mark_paid_cash'
        ? 'cash'
        : paymentAction === 'mark_paid_momo'
          ? 'hubtel'
          : paymentAction === 'deposit_cash'
            ? 'cash'
            : paymentAction === 'send_payment_link'
              ? 'hubtel'
              : 'pending';

    const balanceDue =
      paymentAction === 'deposit_cash' ? asMoney(total - depositAmount) : markFullyPaid ? 0 : total;

    const metadata: Record<string, unknown> = {
      is_preorder: true,
      guest_checkout: true,
      staff_created: true,
      order_source: source,
      preorder_channel: source,
      first_name: firstName,
      last_name: lastName,
      phone,
      created_by_staff_id: auth.userId,
      created_by_staff_name: auth.fullName,
      promised_date: promisedDate,
      customer_notes: customerNotes,
      admin_notes: adminNotes,
      has_custom_items: lineItems.some((i) => i.metadata.line_type === 'custom'),
      deposit_amount: depositAmount > 0 ? depositAmount : null,
      balance_due: balanceDue,
      deposit_paid:
        paymentAction === 'deposit_cash'
          ? true
          : markFullyPaid
            ? true
            : false,
      deposit_payment_method: paymentAction === 'deposit_cash' ? 'cash' : null,
      deposit_recorded_at: paymentAction === 'deposit_cash' ? new Date().toISOString() : null,
    };

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: null,
        email,
        phone,
        status: 'processing',
        payment_status: markFullyPaid ? 'pending' : 'pending', // mark_order_paid below for full pay
        currency: 'GHS',
        subtotal,
        tax_total: 0,
        shipping_total: 0,
        discount_total: 0,
        total,
        shipping_method: shippingMethod,
        payment_method: paymentMethod,
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
        notes: adminNotes,
        is_preorder: true,
        staff_id: auth.userId,
        metadata,
      })
      .select('*')
      .single();

    if (orderError || !order) {
      console.error('[admin/preorders] insert error:', orderError);
      return NextResponse.json(
        { error: orderError?.message || 'Failed to create preorder' },
        { status: 500 }
      );
    }

    const orderItems = lineItems.map((item) => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('[admin/preorders] items error:', itemsError);
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    try {
      await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: email,
        p_phone: phone,
        p_full_name: fullName,
        p_first_name: firstName || null,
        p_last_name: lastName || null,
        p_user_id: null,
        p_address: shippingAddress,
      });
    } catch (e: any) {
      console.warn('[admin/preorders] customer upsert skipped:', e?.message || e);
    }

    let paymentLinkSent = false;
    let paymentUrl: string | null = null;
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'https://www.frebysfashion.com'
    ).replace(/\/+$/, '');
    paymentUrl = `${baseUrl}/pay/${order.id}`;

    if (markFullyPaid) {
      const ref =
        paymentAction === 'mark_paid_cash'
          ? `preorder-cash-${Date.now()}`
          : `preorder-momo-${Date.now()}`;
      const { data: paidJson, error: payErr } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: orderNumber,
        moolre_ref: ref,
      });
      if (payErr) {
        console.error('[admin/preorders] mark_order_paid failed:', payErr.message);
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'paid',
            status: 'processing',
            metadata: {
              ...metadata,
              manually_marked_paid: true,
              balance_due: 0,
              deposit_amount: total,
              deposit_paid: true,
            },
          })
          .eq('id', order.id);
      } else {
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'processing',
            payment_method: paymentMethod,
            metadata: {
              ...metadata,
              manually_marked_paid: true,
              balance_due: 0,
              deposit_amount: total,
              deposit_paid: true,
              payment_verified_at: new Date().toISOString(),
            },
          })
          .eq('id', order.id);
        try {
          await sendOrderConfirmation(paidJson || { ...order, payment_status: 'paid' });
        } catch {
          /* non-fatal */
        }
        void fireMetaPurchaseForOrder(paidJson || order);
      }
    } else if (paymentAction === 'deposit_cash') {
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'processing',
          payment_status: 'pending',
          metadata: {
            ...metadata,
            deposit_paid: true,
            deposit_amount: depositAmount,
            balance_due: balanceDue,
            deposit_recorded_at: new Date().toISOString(),
          },
        })
        .eq('id', order.id);
    }

    if (paymentAction === 'send_payment_link' || body.sendPaymentLink === true) {
      try {
        const { data: fresh } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', order.id)
          .single();
        await sendPaymentLink(fresh || order);
        paymentLinkSent = true;
        await supabaseAdmin
          .from('orders')
          .update({
            metadata: {
              ...(fresh?.metadata || metadata),
              payment_link_sent_at: new Date().toISOString(),
              payment_link_url: paymentUrl,
            },
          })
          .eq('id', order.id);
      } catch (e: any) {
        console.error('[admin/preorders] payment link failed:', e?.message || e);
      }
    }

    const { data: finalOrder } = await supabaseAdmin
      .from('orders')
      .select(
        `
        *,
        staff:profiles!orders_staff_id_fkey(full_name),
        order_items (id, product_id, product_name, variant_name, quantity, unit_price, total_price, is_preorder, metadata)
      `
      )
      .eq('id', order.id)
      .single();

    return NextResponse.json({
      success: true,
      order: finalOrder || order,
      paymentUrl,
      paymentLinkSent,
      message:
        paymentAction === 'send_payment_link'
          ? paymentLinkSent
            ? 'Preorder created and payment link sent'
            : 'Preorder created — payment link could not be sent (check SMS/email config)'
          : markFullyPaid
            ? 'Preorder created and marked paid — ready for production'
            : paymentAction === 'deposit_cash'
              ? `Preorder created. Deposit GH₵${depositAmount.toFixed(2)} recorded; balance GH₵${balanceDue.toFixed(2)}`
              : 'Preorder created (awaiting payment)',
    });
  } catch (e: any) {
    console.error('[admin/preorders] error:', e);
    return NextResponse.json({ error: e?.message || 'Failed to create preorder' }, { status: 500 });
  }
}
