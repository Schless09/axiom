"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInputWithToggle } from "@/components/auth/password-input-with-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignupNotice =
  | { kind: "confirm_email"; email: string }
  | { kind: "ambiguous" };

export function LoginForm() {
  const router = useRouter();
  const signupBannerRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState<SignupNotice | null>(null);
  const [loadingAction, setLoadingAction] = useState<null | "signin" | "signup">(null);

  useEffect(() => {
    if (signupNotice && signupBannerRef.current) {
      signupBannerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [signupNotice]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoadingAction("signin");
    setError(null);
    setSignupNotice(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoadingAction(null);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoadingAction("signup");
    setError(null);
    setSignupNotice(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setLoadingAction(null);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }
    if (data.user) {
      setSignupNotice({ kind: "confirm_email", email });
      return;
    }
    setSignupNotice({ kind: "ambiguous" });
  }

  return (
    <Card className="w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use the email and password for your Supabase project user.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={signIn}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSignupNotice(null);
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInputWithToggle
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {signupNotice ? (
            <div
              ref={signupBannerRef}
              role="status"
              aria-live="polite"
              className="flex gap-3 rounded-lg border border-primary/25 bg-accent/60 p-4 text-card-foreground shadow-sm"
            >
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold leading-tight">
                  {signupNotice.kind === "confirm_email"
                    ? "Account created — one more step"
                    : "Request received"}
                </p>
                {signupNotice.kind === "confirm_email" ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Open the confirmation link we sent to{" "}
                    <span className="font-medium text-foreground">{signupNotice.email}</span>, then
                    sign in here.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    If this email can sign up, you may need to confirm it from your inbox before
                    signing in. If you already have an account, use Sign in instead.
                  </p>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={loadingAction !== null}>
              {loadingAction === "signin" ? "Signing in…" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={loadingAction !== null}
              onClick={signUp}
            >
              {loadingAction === "signup" ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
