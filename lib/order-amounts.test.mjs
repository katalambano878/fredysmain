// Run with: node --test lib/order-amounts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./order-amounts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { amountDue, depositPaid } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('an ordinary order owes its total', () => {
  assert.equal(amountDue({ total: 165 }), 165);
  assert.equal(amountDue({ total: '165.50', metadata: null }), 165.5);
  assert.equal(depositPaid({ total: 165, metadata: {} }), 0);
});

test('a preorder with a deposit owes only the balance', () => {
  const order = { total: 165, metadata: { deposit_paid: true, deposit_amount: 65, balance_due: 100 } };
  assert.equal(amountDue(order), 100);
  assert.equal(depositPaid(order), 65);
});

test('a balance is ignored unless a deposit was really recorded', () => {
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: false, balance_due: 100 } }), 165);
  assert.equal(amountDue({ total: 165, metadata: { balance_due: 100 } }), 165);
});

test('a balance that makes no sense falls back to the full total', () => {
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: true, balance_due: 0 } }), 165);
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: true, balance_due: -5 } }), 165);
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: true, balance_due: 165 } }), 165);
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: true, balance_due: 500 } }), 165);
  assert.equal(amountDue({ total: 165, metadata: { deposit_paid: true, balance_due: 'abc' } }), 165);
});

test('amounts are rounded to pesewas', () => {
  assert.equal(amountDue({ total: 100.1, metadata: { deposit_paid: true, balance_due: 33.335 } }), 33.34);
});
