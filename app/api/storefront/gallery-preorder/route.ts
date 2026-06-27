import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSMS } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_PHONE = process.env.CONTACT_PHONE || '0244720197';

export async function POST(req: NextRequest) {
  try {
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
