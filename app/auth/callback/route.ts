import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAnonKey } from "@/lib/supabase/env";

/**
 * Handles PKCE auth redirects from Supabase (e.g. password recovery email).
 * Add this URL to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
 *   http://localhost:3000/auth/callback
 *   https://your-domain.com/auth/callback
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {
              // ignore when called from Server Component boundary
            }
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
  }

  return NextResponse.redirect(`${url.origin}/login?error=auth`);
}
