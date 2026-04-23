/** Supabase dashboard may label the public key as "anon" or "publishable default" — both work as the client API key. */
export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ""
  );
}
