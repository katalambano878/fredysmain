/**
 * Create two staff users in Frebys plain-Postgres auth + profiles.
 * Run inside frebys app container: node /tmp/vps-create-staff-employees.mjs
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Client } = pg;

const STAFF = [
  {
    // Name not provided in the request — using Rica from the password hint.
    // Admin can rename in Staff Management if needed.
    fullName: 'Rica',
    phone: '0594954031',
    password: 'rica123',
    email: '0594954031@staff.frebys.local',
  },
  {
    fullName: 'Charity Azaanga',
    phone: '0547105061',
    password: '#helloworld',
    email: '0547105061@staff.frebys.local',
  },
];

async function upsertStaff(client, person) {
  const email = person.email.toLowerCase();
  const phone = person.phone;
  const fullName = person.fullName;
  const hash = bcrypt.hashSync(person.password, 10);

  const existing = await client.query(
    `SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );

  let userId;
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    await client.query(
      `UPDATE auth.users
       SET encrypted_password = $1, updated_at = now(), email_confirmed_at = COALESCE(email_confirmed_at, now())
       WHERE id = $2`,
      [hash, userId]
    );
    console.log(`Updated password for existing auth user ${email}`);
  } else {
    userId = randomUUID();
    await client.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, confirmation_token, recovery_token,
         email_change_token_new, email_change
       ) VALUES (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         $2, $3, now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb,
         now(), now(), '', '', '', ''
       )`,
      [
        userId,
        email,
        hash,
        JSON.stringify({ full_name: fullName, phone }),
      ]
    );
    console.log(`Created auth user ${email}`);
  }

  // Trigger may have already created a profile for this auth user id.
  const byId = await client.query(`SELECT id FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
  if (byId.rows[0]) {
    await client.query(
      `UPDATE profiles
       SET email = $2, full_name = $3, phone = $4, role = 'staff', updated_at = now()
       WHERE id = $1`,
      [userId, email, fullName, phone]
    );
  } else {
    const byEmail = await client.query(
      `SELECT id FROM profiles WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    if (byEmail.rows[0] && byEmail.rows[0].id !== userId) {
      // Orphan/wrong-id profile with this email — re-point to auth user id if free
      await client.query(`DELETE FROM profiles WHERE id = $1`, [byEmail.rows[0].id]);
    }
    await client.query(
      `INSERT INTO profiles (id, email, full_name, phone, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'staff', now(), now())
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         role = 'staff',
         updated_at = now()`,
      [userId, email, fullName, phone]
    );
  }

  console.log(`Staff profile ready: ${fullName} | phone ${phone} | login with phone or ${email}`);
  return userId;
}

async function ensureStaffPermissions(client) {
  // Same feature set as existing staff + explicit preorders access.
  const permissions = {
    dashboard: false,
    end_of_day: false,
    orders: true,
    preorders: true,
    pos: true,
    products: true,
    categories: true,
    customers: true,
    reviews: true,
    inventory: true,
    analytics: false,
    finance: false,
    coupons: false,
    support: false,
    customer_insights: false,
    notifications: false,
    sms_debugger: false,
    blog: false,
    modules: false,
    staff: false,
    delivery: false,
    roles: false,
  };

  await client.query(
    `UPDATE roles
     SET permissions = $1::jsonb, updated_at = now()
     WHERE id = 'staff'`,
    [JSON.stringify(permissions)]
  );
  console.log('Staff role permissions updated (includes preorders).');
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING;

  if (!databaseUrl) {
    console.error('Missing DATABASE_URL in container env');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureStaffPermissions(client);
    for (const person of STAFF) {
      await upsertStaff(client, person);
    }
    const { rows } = await client.query(
      `SELECT full_name, email, phone, role FROM profiles WHERE role = 'staff' ORDER BY full_name`
    );
    console.log('\nCurrent staff:');
    for (const r of rows) {
      console.log(` - ${r.full_name} | ${r.phone} | ${r.email}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
