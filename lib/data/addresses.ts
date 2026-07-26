import { supabaseAdmin } from '@/lib/supabase-admin';

export type AddressRow = {
  id: string;
  user_id: string;
  type: string;
  is_default: boolean;
  label: string | null;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  created_at: string;
  updated_at: string;
};

export type AddressInput = {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code?: string | null;
  country?: string | null;
  label?: string | null;
  is_default?: boolean;
  type?: string;
};

async function clearOtherDefaults(userId: string, keepId?: string) {
  let q = supabaseAdmin
    .from('addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true);
  if (keepId) q = q.neq('id', keepId);
  await q;
}

export async function listAddressesForUser(userId: string): Promise<AddressRow[]> {
  const { data, error } = await supabaseAdmin
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as AddressRow[];
}

export async function createAddress(userId: string, input: AddressInput): Promise<AddressRow> {
  const makeDefault = Boolean(input.is_default);
  if (makeDefault) await clearOtherDefaults(userId);

  const { count } = await supabaseAdmin
    .from('addresses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const isFirst = !count || count === 0;
  const isDefault = makeDefault || isFirst;

  const { data, error } = await supabaseAdmin
    .from('addresses')
    .insert({
      user_id: userId,
      type: input.type || 'shipping',
      is_default: isDefault,
      label: input.label || null,
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      address_line1: input.address_line1.trim(),
      address_line2: input.address_line2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      postal_code: (input.postal_code || '-').trim() || '-',
      country: (input.country || 'Ghana').trim() || 'Ghana',
    })
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Failed to create address');
  return data as AddressRow;
}

export async function updateAddress(
  userId: string,
  id: string,
  input: Partial<AddressInput>
): Promise<AddressRow | null> {
  const { data: current } = await supabaseAdmin
    .from('addresses')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!current) return null;

  if (input.is_default) await clearOtherDefaults(userId, id);

  const patch: Record<string, unknown> = {};
  if (input.full_name !== undefined) patch.full_name = input.full_name.trim();
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.address_line1 !== undefined) patch.address_line1 = input.address_line1.trim();
  if (input.address_line2 !== undefined) patch.address_line2 = input.address_line2?.trim() || null;
  if (input.city !== undefined) patch.city = input.city.trim();
  if (input.state !== undefined) patch.state = input.state.trim();
  if (input.postal_code !== undefined) patch.postal_code = input.postal_code?.trim() || '-';
  if (input.country !== undefined) patch.country = input.country?.trim() || 'Ghana';
  if (input.label !== undefined) patch.label = input.label;
  if (input.is_default !== undefined) patch.is_default = Boolean(input.is_default);

  const { data, error } = await supabaseAdmin
    .from('addresses')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return (data as AddressRow) || null;
}

export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const { data: deleted, error } = await supabaseAdmin
    .from('addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, is_default')
    .maybeSingle();

  if (error) throw error;
  if (!deleted) return false;

  if (deleted.is_default) {
    const { data: next } = await supabaseAdmin
      .from('addresses')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await supabaseAdmin.from('addresses').update({ is_default: true }).eq('id', next.id);
    }
  }
  return true;
}

export async function setDefaultAddress(userId: string, id: string): Promise<AddressRow | null> {
  const { data: current } = await supabaseAdmin
    .from('addresses')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!current) return null;

  await clearOtherDefaults(userId, id);
  const { data, error } = await supabaseAdmin
    .from('addresses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as AddressRow;
}

export {
  addressToShippingData,
  shippingDataToAddressInput,
} from '@/lib/address-map';
