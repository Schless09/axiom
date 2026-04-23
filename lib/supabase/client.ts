import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey } from "@/lib/supabase/env";

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseAnonKey());
}
