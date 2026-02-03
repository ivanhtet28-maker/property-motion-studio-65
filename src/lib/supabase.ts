// Supabase client configuration
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pxhpfewunsetuxygeprp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is properly configured
export const isSupabaseConfigured = !!supabaseAnonKey;

// Create the Supabase client only if we have the key, otherwise create a mock
let supabaseClient: SupabaseClient;

if (supabaseAnonKey) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('VITE_SUPABASE_ANON_KEY is not set. Using placeholder client. Supabase functionality will not work.');
  // Create a placeholder with a dummy key to prevent crash - it won't work but won't crash
  supabaseClient = createClient(supabaseUrl, 'placeholder-key-supabase-not-configured');
}

export const supabase = supabaseClient;
