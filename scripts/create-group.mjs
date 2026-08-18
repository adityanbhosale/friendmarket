// Creates a group with a hashed password. There is no UI for this on purpose —
// opening a group is an operator action, not a public one.
//
//   node --env-file=.env.local scripts/create-group.mjs "Moab 2026" moab-2026 "the password"

import { randomBytes, scrypt } from "node:crypto";

const [name, linkId, password] = process.argv.slice(2);

if (!name || !linkId || !password) {
  console.error(
    'usage: node --env-file=.env.local scripts/create-group.mjs "<name>" <link-id> "<password>"',
  );
  process.exit(1);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

// Must stay in step with app/lib/password.ts.
const N = 16384, R = 8, P = 1, KEYLEN = 64;

const salt = randomBytes(16);
const key = await new Promise((resolve, reject) =>
  scrypt(
    password.normalize("NFKC"),
    salt,
    KEYLEN,
    { N, r: R, p: P, maxmem: 64 * 1024 * 1024 },
    (err, out) => (err ? reject(err) : resolve(out)),
  ),
);

const password_hash = `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;

const res = await fetch(`${URL}/rest/v1/groups`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ name, link_id: linkId, password_hash }),
});

if (!res.ok) {
  console.error(`failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const [group] = await res.json();
console.log(`created "${group.name}"`);
console.log(`  join at: /join/${group.link_id}`);
console.log(`  group id: ${group.id}`);
