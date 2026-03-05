// ================================================================
// SchoolOS – Supabase Client
// Single shared instance used across the entire backend.
// Never import createClient anywhere else — always use this file.
// ================================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] SUPABASE_URL or SUPABASE_KEY is missing in .env');
  process.exit(1); // Hard stop — app cannot run without DB credentials
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;