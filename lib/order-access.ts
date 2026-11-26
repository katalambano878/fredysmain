/**
 * The email a shopper gives to open an order must be that order's email, exactly
 * (ignoring case and outer spaces). The lookups used to run it as a search pattern,
 * so "%@%" matched every order and showed its address and phone number.
 */
export function emailsMatch(orderEmail: unknown, given: unknown): boolean {
  const a = String(orderEmail ?? '').trim().toLowerCase();
  const b = String(given ?? '').trim().toLowerCase();
  return a.length > 0 && a === b;
}
