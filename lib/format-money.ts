/** Safe money formatting — PG/json often return numeric as string. */
export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value: unknown, digits = 2): string {
  return asNumber(value).toFixed(digits);
}

export function moneyLabel(value: unknown, prefix = 'GH₵'): string {
  return `${prefix}${money(value)}`;
}
