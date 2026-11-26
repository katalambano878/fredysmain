/**
 * Create an admin user in Supabase Auth and set their profile role to admin.
 * Run from project root: node scripts/create-admin.mjs
 *
 * Uses .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and optionally ADMIN_EMAIL, ADMIN_PASSWORD (defaults below if not set).
 *
 * Default credentials: admin@delizbeauty.com / Admin123!
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) {
    console.error('Missing .env.local. Create it with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const content = readFileSync(path, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function ensureAdminProfile(supabase, userId, email) {
  return supabase
    .from('profiles')
    .upsert(
      { id: userId, email, role: 'admin' },
      { onConflict: 'id', ignoreDuplicates: false }
    );
}

async function findUserByEmail(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { userId: null, error };
  const user = data?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  return { userId: user?.id ?? null, error: null };
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
// No built-in email or password: a default here becomes a known login on every store.
const adminEmail = env.ADMIN_EMAIL;
const adminPassword = env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword || adminPassword.length < 10) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) in .env.local before running this.');
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Creating admin user...');
  console.log('Email:', adminEmail);

  const { data: user, error: createError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (createError) {
    if (createError.message && createError.message.includes('already been registered')) {
      console.log('User already exists. Looking up user and ensuring admin profile...');
      const { userId: existingUserId, error: listErr } = await findUserByEmail(supabase, adminEmail);
      if (listErr || !existingUserId) {
        console.error('Could not find existing user by email:', listErr?.message || 'Not found');
        process.exit(1);
      }
      const { error: upsertError } = await ensureAdminProfile(supabase, existingUserId, adminEmail);
      if (upsertError) {
        console.error('Failed to set admin profile:', upsertError.message);
        process.exit(1);
      }
      console.log('Done. Existing user is now an admin.');
      console.log('Email:', adminEmail);
      console.log('Password: use your existing password, or set ADMIN_PASSWORD in .env.local and reset in Supabase Dashboard (Authentication → Users → user → Send password recovery).');
      console.log('Log in at: /admin/login');
      return;
    }
    console.error('Create user failed:', createError.message);
    process.exit(1);
  }

  const userId = user?.user?.id;
  if (!userId) {
    console.error('User created but no id returned');
    process.exit(1);
  }

  const { error: upsertError } = await ensureAdminProfile(supabase, userId, adminEmail);
  if (upsertError) {
    console.error('User created but failed to set admin profile:', upsertError.message);
    process.exit(1);
  }

  console.log('Admin user created successfully.');
  console.log('Email:', adminEmail);
  console.log('Password:', adminPassword);
  console.log('Log in at: /admin/login');
  console.log('Change the password after first login or set ADMIN_PASSWORD in .env.local and re-run this script.');
}

main();
