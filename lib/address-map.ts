/** Client-safe address ↔ checkout field mapping (no DB imports). */

export type AddressLike = {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
};

export function addressToShippingData(addr: AddressLike, email = '') {
  const parts = (addr.full_name || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || firstName;
  return {
    firstName,
    lastName,
    email,
    phone: addr.phone || '',
    address: addr.address_line1 || '',
    city: addr.city || '',
    region: addr.state || '',
  };
}

export function shippingDataToAddressInput(
  shipping: Record<string, string>,
  opts: { is_default?: boolean } = {}
) {
  return {
    full_name: `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim() || 'Customer',
    phone: shipping.phone || '',
    address_line1: shipping.address || '',
    city: shipping.city || '',
    state: shipping.region || '',
    postal_code: shipping.postalCode || '-',
    country: 'Ghana',
    is_default: opts.is_default ?? true,
    type: 'shipping' as const,
  };
}
