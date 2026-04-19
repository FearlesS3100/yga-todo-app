#!/usr/bin/env node
/**
 * License Key Generator
 * Usage: node scripts/generate-license.js [count]
 * Example: node scripts/generate-license.js 10
 * 
 * Generates license keys in format: XXX-XXX-XXX-XXX
 * Inserts them into Supabase licenses table.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion

function randomSegment(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

function generateLicenseKey() {
  return `${randomSegment(3)}-${randomSegment(3)}-${randomSegment(3)}-${randomSegment(3)}`;
}

async function main() {
  const count = parseInt(process.argv[2] || '1', 10);
  if (isNaN(count) || count < 1 || count > 100) {
    console.error('Please provide a count between 1 and 100.');
    process.exit(1);
  }

  console.log(`\nGenerating ${count} license key(s)...\n`);

  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({ license_key: generateLicenseKey() });
  }

  const { data, error } = await supabase
    .from('licenses')
    .insert(keys)
    .select('license_key');

  if (error) {
    console.error('Failed to insert licenses:', error.message);
    process.exit(1);
  }

  console.log('┌─────────────────────┐');
  console.log('│   LICENSE KEYS      │');
  console.log('├─────────────────────┤');
  for (const row of data) {
    console.log(`│  ${row.license_key}      │`);
  }
  console.log('└─────────────────────┘');
  console.log(`\n✓ ${data.length} license(s) saved to Supabase.\n`);
}

main();