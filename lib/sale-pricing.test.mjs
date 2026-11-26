// Run with: node --test lib/sale-pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Node 20 cannot import TypeScript, so the real file is compiled in memory first.
const source = readFileSync(new URL('./sale-pricing.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { percentPrice, pricedRows, rowState, summarizeSale, withSale, withSwitch, withoutSale } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

/** Apply a patch the way the database would, to chain steps. */
const apply = (row, patch) => (patch ? { ...row, ...patch } : row);

test('a row with no sale reports its price as the regular price', () => {
  assert.deepEqual(rowState({ price: 100 }), { regular: 100, sale: null, live: false });
  assert.deepEqual(rowState({ price: '100.00', compare_at_price: null, metadata: null }), {
    regular: 100,
    sale: null,
    live: false,
  });
});

test('a compare-at price that is not higher than the price is not a sale', () => {
  assert.deepEqual(rowState({ price: 100, compare_at_price: 100 }), { regular: 100, sale: null, live: false });
  assert.deepEqual(rowState({ price: 100, compare_at_price: 80 }), { regular: 100, sale: null, live: false });
});

test('a discount already in the database (price below compare-at) reads as a live sale', () => {
  assert.deepEqual(rowState({ price: 90, compare_at_price: 100 }), { regular: 100, sale: 90, live: true });
});

test('putting a row on sale, switched on, writes the sale price and keeps the regular price', () => {
  const patch = withSale({ price: 200, metadata: { color_hex: '#fff' } }, 150, true);
  assert.deepEqual(patch, { price: 150, compare_at_price: 200, metadata: { color_hex: '#fff' } });
});

test('putting a row on sale, switched off, leaves the price alone and remembers the sale price', () => {
  const patch = withSale({ price: 200, metadata: { color_hex: '#fff' } }, 150, false);
  assert.deepEqual(patch, { price: 200, compare_at_price: null, metadata: { color_hex: '#fff', sale_price: 150 } });
  assert.deepEqual(rowState(apply({ price: 200 }, patch)), { regular: 200, sale: 150, live: false });
});

test('a sale price must be below the regular price', () => {
  assert.equal(withSale({ price: 200 }, 200, true), null);
  assert.equal(withSale({ price: 200 }, 250, true), null);
  assert.equal(withSale({ price: 200 }, 0, true), null);
  assert.equal(withSale({ price: 0 }, 10, true), null);
});

test('switching off then on brings back the exact same prices', () => {
  const start = { price: 134.99, compare_at_price: 149.99, metadata: { color_hex: '#000' } };
  const off = apply(start, withSwitch(start, false));
  assert.equal(off.price, 149.99);
  assert.equal(off.compare_at_price, null);
  assert.equal(off.metadata.sale_price, 134.99);
  const on = apply(off, withSwitch(off, true));
  assert.equal(on.price, 134.99);
  assert.equal(on.compare_at_price, 149.99);
  assert.equal('sale_price' in on.metadata, false);
  assert.equal(on.metadata.color_hex, '#000');
});

test('switching does nothing when there is no sale or it is already there', () => {
  assert.equal(withSwitch({ price: 100 }, true), null);
  assert.equal(withSwitch({ price: 100 }, false), null);
  assert.equal(withSwitch({ price: 90, compare_at_price: 100 }, true), null);
  assert.equal(withSwitch({ price: 100, metadata: { sale_price: 90 } }, false), null);
});

test('removing a live sale restores the regular price', () => {
  assert.deepEqual(withoutSale({ price: 90, compare_at_price: 100, metadata: { a: 1 } }), {
    price: 100,
    compare_at_price: null,
    metadata: { a: 1 },
  });
});

test('removing a switched-off sale forgets the sale price', () => {
  assert.deepEqual(withoutSale({ price: 100, metadata: { sale_price: 90, a: 1 } }), {
    price: 100,
    compare_at_price: null,
    metadata: { a: 1 },
  });
  assert.equal(withoutSale({ price: 100, metadata: { a: 1 } }), null);
});

test('a new percentage on a row already on sale is taken off the regular price, never stacked', () => {
  const live = { price: 90, compare_at_price: 100 };
  const patch = withSale(live, percentPrice(rowState(live).regular, 20), true);
  assert.equal(patch.price, 80);
  assert.equal(patch.compare_at_price, 100);

  const off = { price: 100, metadata: { sale_price: 90 } };
  const offPatch = withSale(off, percentPrice(rowState(off).regular, 20), false);
  assert.equal(offPatch.price, 100);
  assert.equal(offPatch.metadata.sale_price, 80);
});

test('percentPrice rounds to pesewas and rejects percentages outside 1 to 99', () => {
  assert.equal(percentPrice(149.99, 10), 134.99);
  assert.equal(percentPrice(100, 99), 1);
  assert.equal(percentPrice(100, 0), null);
  assert.equal(percentPrice(100, 100), null);
  assert.equal(percentPrice(0, 10), null);
  // 1% of one pesewa cannot be lower
  assert.equal(percentPrice(0.01, 1), null);
});

test('a kept sale price that is no longer below the price is ignored', () => {
  assert.deepEqual(rowState({ price: 80, metadata: { sale_price: 90 } }), { regular: 80, sale: null, live: false });
});

test('pricedRows lists the product and each size that has its own price', () => {
  const product = {
    id: 'p',
    price: 0,
    product_variants: [
      { id: 'a', price: 100 },
      { id: 'b', price: 0 },
      { id: 'c', price: 120, compare_at_price: 150 },
    ],
  };
  assert.deepEqual(
    pricedRows(product).map((r) => [r.row.id, r.isVariant]),
    [
      ['a', true],
      ['c', true],
    ]
  );
  assert.deepEqual(
    pricedRows({ id: 'p', price: 50, product_variants: [] }).map((r) => [r.row.id, r.isVariant]),
    [['p', false]]
  );
});

test('summary of a simple product', () => {
  assert.deepEqual(summarizeSale({ price: 100 }), { regular: 100, sale: null, percentOff: 0, hasSale: false, live: false });
  assert.deepEqual(summarizeSale({ price: 75, compare_at_price: 100 }), {
    regular: 100,
    sale: 75,
    percentOff: 25,
    hasSale: true,
    live: true,
  });
  assert.deepEqual(summarizeSale({ price: 100, metadata: { sale_price: 75 } }), {
    regular: 100,
    sale: 75,
    percentOff: 25,
    hasSale: true,
    live: false,
  });
});

test('summary of a product with sizes shows the cheapest discounted size', () => {
  const summary = summarizeSale({
    price: 0,
    product_variants: [
      { price: 180, compare_at_price: 200 },
      { price: 90, compare_at_price: 100 },
      { price: 50 },
    ],
  });
  assert.deepEqual(summary, { regular: 100, sale: 90, percentOff: 10, hasSale: true, live: true });
});

test('summary of a product with sizes and no sale shows the cheapest regular price', () => {
  const summary = summarizeSale({ price: 0, product_variants: [{ price: 200 }, { price: 120 }] });
  assert.deepEqual(summary, { regular: 120, sale: null, percentOff: 0, hasSale: false, live: false });
});

test('a size without its own price follows the product', () => {
  const summary = summarizeSale({ price: 90, compare_at_price: 100, product_variants: [{ price: 0 }, { price: null }] });
  assert.deepEqual(summary, { regular: 100, sale: 90, percentOff: 10, hasSale: true, live: true });
});

test('a product whose sizes are all switched off reads as on sale but not live', () => {
  const summary = summarizeSale({
    price: 0,
    product_variants: [
      { price: 200, metadata: { sale_price: 150 } },
      { price: 100, metadata: { sale_price: 75 } },
    ],
  });
  assert.deepEqual(summary, { regular: 100, sale: 75, percentOff: 25, hasSale: true, live: false });
});
