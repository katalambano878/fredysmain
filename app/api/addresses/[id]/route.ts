import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import {
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from '@/lib/data/addresses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const body = (await request.json()) as Partial<AddressInput> & { set_default?: boolean };

    if (body.set_default) {
      const address = await setDefaultAddress(auth.user.id, id);
      if (!address) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(address);
    }

    const address = await updateAddress(auth.user.id, id, body);
    if (!address) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(address);
  } catch (err) {
    console.error('[addresses PATCH]', err);
    return NextResponse.json({ error: 'Failed to update address' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const ok = await deleteAddress(auth.user.id, id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[addresses DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 });
  }
}
