import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from './supabaseConfig';

const config = getSupabasePublicConfig();

if (!config) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before importing the client.',
  );
}

export const supabase = createClient(config.url, config.anonKey);
