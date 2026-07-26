import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import {
  createAddress,
  listAddressesForUser,
  type AddressInput,
} from '@/lib/data/addresses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const addresses = await listAddressesForUser(auth.user.id);
    return NextResponse.json(addresses);
  } catch (err) {
    console.error('[addresses GET]', err);
    return NextResponse.json({ error: 'Failed to load addresses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAuth(request);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AddressInput;
    if (!body.full_name?.trim() || !body.phone?.trim() || !body.address_line1?.trim()) {
      return NextResponse.json({ error: 'Name, phone, and address are required' }, { status: 400 });
    }
    if (!body.city?.trim() || !body.state?.trim()) {
      return NextResponse.json({ error: 'City and region are required' }, { status: 400 });
    }

    const address = await createAddress(auth.user.id, body);
    return NextResponse.json(address, { status: 201 });
  } catch (err) {
    console.error('[addresses POST]', err);
    return NextResponse.json({ error: 'Failed to save address' }, { status: 500 });
  }
}
