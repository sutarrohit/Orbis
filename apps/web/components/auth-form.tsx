"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const inputClass = cn(
  "h-8 w-full rounded-md bg-input/30 px-2.5 text-xs/relaxed ring-1 ring-foreground/10",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
);

// Only allow internal, single-leading-slash paths to prevent open redirects.
function safeRedirect(target: string | null) {
  if (target && target.startsWith("/") && !target.startsWith("//")) return target;
  return "/";
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message ?? "Something went wrong");
      return;
    }
    router.push(redirectTo);
  }

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);

    // Redirects to Google, then back to the API callback, then to callbackURL.
    // callbackURL must be absolute: a relative path resolves against the auth
    // server's origin (:4000), sending us back to the API instead of the web app.
    // window.location.origin (:3000) is in the server's trustedOrigins.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${redirectTo}`
    });

    if (error) {
      setError(error.message ?? "Could not sign in with Google");
      setGoogleLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isSignUp ? "Create your account" : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Sign up to get a workspace and connect your bots."
            : "Sign in to your workspace."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onGoogle}
          disabled={googleLoading || loading}
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="h-px flex-1 bg-foreground/10" />
          <span className="text-xs">or</span>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {isSignUp && (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Name</span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Email</span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Password</span>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>

          {error && <p className="text-destructive">{error}</p>}

          <Button type="submit" size="lg" disabled={loading || googleLoading}>
            {loading ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="text-muted-foreground">
        {isSignUp ? (
          <span>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </span>
        ) : (
          <span>
            Need an account?{" "}
            <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
              Sign up
            </Link>
          </span>
        )}
      </CardFooter>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.39Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.97A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.21a6.9 6.9 0 0 1 0-4.42V6.82H1.76a11.5 11.5 0 0 0 0 10.36l3.84-2.97Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.68 0 3.2.58 4.39 1.72l3.29-3.29C17.69 1.3 15.1.25 12 .25A11.5 11.5 0 0 0 1.76 6.82l3.84 2.97C6.5 6.76 9.02 4.75 12 4.75Z"
      />
    </svg>
  );
}
