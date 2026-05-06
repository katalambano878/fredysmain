import { supabaseAdmin } from '@/lib/supabase-admin';

export type PerVariantCostEntry = {
  fabric_cost?: number | null;
  other_cost?: number | null;
  labour_cost?: number | null;
};

export type PerVariantCostMap = Record<string, PerVariantCostEntry>;

export type CopPayload = {
  enabled?: boolean;
  cop_description?: string | null;
  fabric_cost?: number | string | null;
  other_cost?: number | string | null;
  labour_cost?: number | string | null;
  production_staff_id?: string | null;
  /**
   * Optional per-variant overrides keyed by `${color}|||${size}` (matching the
   * key the admin form uses). Any of the three numeric fields may be omitted
   * to inherit the product-level default. Empty/zeroed entries are stripped
   * before saving so the JSON stays clean.
   */
  per_variant_costs?: PerVariantCostMap | null;
};

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Strip any per-variant entries that don't actually override anything,
 * coerce the surviving numbers, and drop the whole map if nothing is left.
 */
function normalisePerVariantCosts(map: PerVariantCostMap | null | undefined): PerVariantCostMap {
  if (!map || typeof map !== 'object') return {};
  const out: PerVariantCostMap = {};
  for (const [rawKey, raw] of Object.entries(map)) {
    if (!rawKey || !raw || typeof raw !== 'object') continue;
    const entry: PerVariantCostEntry = {};
    if (raw.fabric_cost != null && raw.fabric_cost !== ('' as unknown as number)) {
      const v = num(raw.fabric_cost);
      if (v > 0) entry.fabric_cost = v;
    }
    if (raw.other_cost != null && raw.other_cost !== ('' as unknown as number)) {
      const v = num(raw.other_cost);
      if (v > 0) entry.other_cost = v;
    }
    if (raw.labour_cost != null && raw.labour_cost !== ('' as unknown as number)) {
      const v = num(raw.labour_cost);
      if (v > 0) entry.labour_cost = v;
    }
    if (Object.keys(entry).length > 0) {
      out[rawKey] = entry;
    }
  }
  return out;
}

export async function syncProductCostOfProduction(productId: string, cop: CopPayload | null | undefined) {
  if (!cop || cop.enabled === false) {
    await supabaseAdmin.from('product_cost_of_production').delete().eq('product_id', productId);
    return;
  }
  const fabric = num(cop.fabric_cost);
  const other = num(cop.other_cost);
  const labour = num(cop.labour_cost);
  const desc = cop.cop_description != null ? String(cop.cop_description).trim() : '';
  const hasStaff = !!cop.production_staff_id;
  const perVariant = normalisePerVariantCosts(cop.per_variant_costs);
  const hasPerVariant = Object.keys(perVariant).length > 0;

  if (fabric === 0 && other === 0 && labour === 0 && !hasStaff && !desc && !hasPerVariant) {
    await supabaseAdmin.from('product_cost_of_production').delete().eq('product_id', productId);
    return;
  }
  const { error } = await supabaseAdmin.from('product_cost_of_production').upsert(
    {
      product_id: productId,
      cop_description: desc || null,
      fabric_cost: fabric,
      other_cost: other,
      labour_cost: labour,
      production_staff_id: cop.production_staff_id || null,
      per_variant_costs: perVariant,
    },
    { onConflict: 'product_id' }
  );
  if (error) throw new Error(error.message);
}
