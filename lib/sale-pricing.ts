/**
 * Sale prices for the admin Discounts screen.
 *
 * Frebys keeps the price a shopper pays in `price`. A sale that is switched on is a row
 * (a product, or one of its sizes) whose `compare_at_price` holds the regular price and is
 * higher than `price`. The shop, cart, checkout and POS already read those two columns, so
 * a sale needs no changes anywhere else.
 *
 * A sale that is switched off puts the regular price back in `price`, clears
 * `compare_at_price`, and keeps the sale price in `metadata.sale_price` so it can be
 * switched on again later.
 *
 * No imports here, so the same file runs in the browser, on the server and in node tests.
 */

export type PriceRow = {
  price?: number | string | null;
  compare_at_price?: number | string | null;
  metadata?: unknown;
  [key: string]: unknown;
};

export type SaleProduct = PriceRow & {
  product_variants?: PriceRow[] | null;
};

export type RowState = {
  /** The normal price of this row. */
  regular: number;
  /** Its sale price, whether the sale is switched on or off. Null when it has no sale. */
  sale: number | null;
  /** True when shoppers are paying the sale price right now. */
  live: boolean;
};

/** The columns to write back for one row. */
export type RowPatch = {
  price: number;
  compare_at_price: number | null;
  metadata: Record<string, unknown>;
};

/** A sale takes between 1% and 99% off. */
export const MAX_PERCENT_OFF = 99;

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function positive(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metadataOf(row: PriceRow): Record<string, unknown> {
  const m = row.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? { ...(m as Record<string, unknown>) } : {};
}

/** What one row costs normally, what its sale price is, and whether the sale is on. */
export function rowState(row: PriceRow): RowState {
  const price = positive(row.price) ?? 0;
  const compareAt = positive(row.compare_at_price) ?? 0;
  if (price > 0 && compareAt > price) return { regular: compareAt, sale: price, live: true };
  const kept = positive(metadataOf(row).sale_price);
  if (price > 0 && kept != null && kept < price) return { regular: price, sale: round2(kept), live: false };
  return { regular: price, sale: null, live: false };
}

/** The price a percentage takes a regular price down to. Null when it would not be lower. */
export function percentPrice(regular: number, percent: number): number | null {
  const r = Number(regular) || 0;
  const p = Number(percent);
  if (!(r > 0) || !Number.isFinite(p) || p < 1 || p > MAX_PERCENT_OFF) return null;
  const next = round2(r * (1 - p / 100));
  return next > 0 && next < r ? next : null;
}

/** Put a row on sale at `salePrice`, switched on or off. Null when the price is not below the regular price. */
export function withSale(row: PriceRow, salePrice: number, live: boolean): RowPatch | null {
  const { regular } = rowState(row);
  const sale = round2(Number(salePrice));
  if (!(regular > 0) || !Number.isFinite(sale) || !(sale > 0) || !(sale < regular)) return null;
  const metadata = metadataOf(row);
  if (live) {
    delete metadata.sale_price;
    return { price: sale, compare_at_price: regular, metadata };
  }
  metadata.sale_price = sale;
  return { price: regular, compare_at_price: null, metadata };
}

/** Switch a row's sale on or off. Null when it has no sale, or is already where it should be. */
export function withSwitch(row: PriceRow, live: boolean): RowPatch | null {
  const state = rowState(row);
  if (state.sale == null || state.live === live) return null;
  return withSale(row, state.sale, live);
}

/** Take a row off sale and bring its regular price back. Null when there is nothing to remove. */
export function withoutSale(row: PriceRow): RowPatch | null {
  const state = rowState(row);
  const metadata = metadataOf(row);
  const hadKept = 'sale_price' in metadata;
  if (state.sale == null && !hadKept) return null;
  delete metadata.sale_price;
  return { price: state.regular, compare_at_price: null, metadata };
}

function variantsOf(product: SaleProduct): PriceRow[] {
  return Array.isArray(product.product_variants) ? product.product_variants : [];
}

/**
 * Every row of a product that carries a price of its own: the product itself and each size.
 * A size with no price of its own sells at the product price, so it has nothing to change.
 */
export function pricedRows(product: SaleProduct): { row: PriceRow; isVariant: boolean }[] {
  const rows: { row: PriceRow; isVariant: boolean }[] = [];
  if (rowState(product).regular > 0) rows.push({ row: product, isVariant: false });
  for (const v of variantsOf(product)) {
    if (rowState(v).regular > 0) rows.push({ row: v, isVariant: true });
  }
  return rows;
}

export type SaleSummary = {
  /** Regular price to show: the product's, or its cheapest size's. */
  regular: number;
  /** Sale price to show next to it, whether the sale is on or off. Null when not on sale. */
  sale: number | null;
  percentOff: number;
  hasSale: boolean;
  live: boolean;
};

/** One line for the admin table: what the sale is, and whether it is switched on. */
export function summarizeSale(product: SaleProduct): SaleSummary {
  const own = rowState(product);
  const variants = variantsOf(product);
  // What a shopper sees for each size; a size without its own price follows the product.
  const lines = variants.length
    ? variants.map((v) => {
        const s = rowState(v);
        return s.regular > 0 ? s : own;
      })
    : [own];

  const discounted = lines.filter((l) => l.sale != null);
  const pool = discounted.length ? discounted : own.sale != null ? [own] : lines.filter((l) => l.regular > 0);
  const shown = [...pool].sort((a, b) => (a.sale ?? a.regular) - (b.sale ?? b.regular))[0] || own;

  const hasSale = shown.sale != null;
  const live = pricedRows(product).some(({ row }) => rowState(row).live);
  return {
    regular: shown.regular,
    sale: hasSale ? shown.sale : null,
    percentOff:
      hasSale && shown.sale != null && shown.regular > 0 ? Math.round((1 - shown.sale / shown.regular) * 100) : 0,
    hasSale,
    live: hasSale && live,
  };
}
