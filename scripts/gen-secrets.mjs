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
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
} else {
  console.log('# Run again with a password argument to generate ADMIN_PASSWORD_HASH:');
  console.log('# node scripts/gen-secrets.mjs "your-password"');
}
