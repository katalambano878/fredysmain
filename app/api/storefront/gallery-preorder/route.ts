import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSMS } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const ADMIN_PHONE = process.env.CONTACT_PHONE || '0244720197';

export async function POST(req: NextRequest) {
  try {
    // Each request texts the shop, so one visitor may only send a few.
    if (!checkRateLimit(`gallery-preorder:${getClientIdentifier(req)}`, { maxRequests: 4, windowSeconds: 600 }).success) {
      return NextResponse.json(
        { error: 'You have sent several requests already. Please wait a few minutes, or call us.' },
        { status: 429 }
      );
    }
    const body = await req.json();
    const {
      gallery_item_id,
      gallery_title,
      gallery_image_url,
      customer_name,
      customer_phone,
      customer_email,
      preferred_size,
      notes,
    } = body;

    if (!gallery_item_id || !customer_name?.trim() || !customer_phone?.trim()) {
      return NextResponse.json(
        { error: 'Name, phone, and gallery item are required.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('gallery_preorders')
      .insert({
        gallery_item_id,
        gallery_title: gallery_title || null,
        gallery_image_url: gallery_image_url || null,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        customer_email: customer_email?.trim() || null,
        preferred_size: preferred_size?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[gallery-preorder] insert error:', error);
      return NextResponse.json({ error: 'Could not submit preorder.' }, { status: 500 });
    }

    try {
      await sendSMS({
        to: ADMIN_PHONE,
        message: `New gallery preorder from ${customer_name.trim()} (${customer_phone.trim()}) for "${gallery_title || 'Gallery design'}". Size: ${preferred_size || 'Not specified'}. Check admin panel.`,
      });
    } catch (smsErr) {
      console.error('[gallery-preorder] SMS notification failed:', smsErr);
    }

    return NextResponse.json({ id: data.id, message: 'Preorder submitted successfully!' });
  } catch (err) {
    console.error('[gallery-preorder] unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
