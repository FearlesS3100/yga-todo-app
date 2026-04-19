import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SupabaseLoginResponse {
  user_id: string;
  user_name: string;
  is_new_user: boolean;
}

// Helper: login_or_register by name
export async function supabaseLogin(name: string): Promise<SupabaseLoginResponse | null> {
  const { data, error } = await supabase.rpc('login_or_register', { p_name: name });
  if (error) throw error;

  if (!data) {
    return null;
  }

  const normalized = Array.isArray(data) ? data[0] : data;
  if (!normalized) {
    return null;
  }

  return normalized as SupabaseLoginResponse;
}
