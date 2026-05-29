#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const password = args[0];

const masterKey = randomBytes(32).toString('hex');
const sessionSecret = randomBytes(32).toString('base64url');

console.log('# Generated secrets — copy into .env');
console.log(`MASTER_KEY=${masterKey}`);
console.log(`SESSION_SECRET=${sessionSecret}`);

if (password) {
  const hash = await bcrypt.hash(password, 12);
  // Escape `$` with `\$` so Next.js's env loader (dotenv-expand) doesn't
  // treat fragments like `$2b$12$abc` as variable references and replace
  // them with empty strings, mangling the bcrypt hash.
  const escaped = hash.replace(/\$/g, '\\$');
  console.log(`ADMIN_PASSWORD_HASH=${escaped}`);
} else {
  console.log('# Run again with a password argument to generate ADMIN_PASSWORD_HASH:');
  console.log('# node scripts/gen-secrets.mjs "your-password"');
}
