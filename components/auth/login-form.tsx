"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Account created. You can sign in now.");
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
              onChange={(e) => setEmail(e.target.value)}
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
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "…" : "Sign in"}
            </Button>
            <Button type="button" variant="secondary" className="flex-1" disabled={loading} onClick={signUp}>
              Create account
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
