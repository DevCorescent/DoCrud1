import { createBrowserClient } from '@supabase/ssr';

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase browser client env vars are missing.');
  }

  return { supabaseUrl, supabaseKey };
}

export const createClient = () => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  return createBrowserClient(supabaseUrl, supabaseKey);
};
