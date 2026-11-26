/**
 * Plain-Postgres mode is active when DATABASE_URL is set.
 * Production keeps using hosted Supabase until cutover.
 */
export function isPlainPostgres(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function authJwtSecret(): string {
  const secret =
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;
  if (secret) return secret;
  // With a known default, anyone could make their own admin session. Refuse to run that way live.
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET must be set");
  }
  return "dev-auth-secret-change-me";
}
