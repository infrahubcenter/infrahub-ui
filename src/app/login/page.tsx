"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_NAME, APP_DESCRIPTION, pageTitle } from "@/lib/branding";
import { isAdminRole, ApiError, getOAuthProviders, login, oauthStartUrl } from "@/lib/api";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  no_account: "No InfraHub account exists for that email. Ask an admin to invite you first.",
  disabled: "This account has been disabled. Contact an administrator.",
  failed: "Sign-in failed. Please try again.",
};

// Recognizable brand marks as inline SVG -- lucide-react v1 dropped
// brand/logo icons entirely, so neither GitHub's nor Google's is
// available from the icon set already used throughout this app.
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

// A small, recognizable Google "G" mark.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.6 5.6 0 0 1-2.42 3.62v3h3.9c2.28-2.1 3.54-5.2 3.54-8.86Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.73-2.09-6.67-4.9H1.3v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.33 14.35A7.2 7.2 0 0 1 4.95 12c0-.82.14-1.61.38-2.35v-3.1H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.44Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.78l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.56l4.03 3.1C6.27 6.84 8.9 4.75 12 4.75Z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Lazy initializer (not an effect): searchParams is already available
  // synchronously at render time, and this must only ever reflect the
  // URL as it was on arrival -- re-deriving on every searchParams
  // identity change would fight a user editing the form.
  const [error, setError] = useState<string | null>(() => {
    const oauthError = searchParams.get("oauth_error");
    return oauthError ? (OAUTH_ERROR_MESSAGES[oauthError] ?? OAUTH_ERROR_MESSAGES.failed) : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<{ github: boolean; google: boolean }>({
    github: false,
    google: false,
  });

  useEffect(() => {
    document.title = pageTitle("Login");
  }, []);

  useEffect(() => {
    getOAuthProviders()
      .then(setOauthProviders)
      .catch(() => setOauthProviders({ github: false, google: false }));
  }, []);

  // Already-authenticated users land on their role's home rather than
  // seeing the login form again.
  useEffect(() => {
    if (!loading && user) {
      router.replace(isAdminRole(user.role) ? "/" : "/workspaces");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      await refresh();
      const next = searchParams.get("next");
      if (isAdminRole(loggedInUser.role)) {
        router.replace(next && next !== "/login" ? next : "/");
      } else {
        router.replace("/workspaces");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
          <img src="/logo-icon.svg" alt={APP_NAME} className="h-12 w-12" />
          <h1 className="text-lg font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{APP_DESCRIPTION}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        {(oauthProviders.github || oauthProviders.google) && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              {oauthProviders.github && (
                <Button variant="outline" render={<a href={oauthStartUrl("github")} />}>
                  <GitHubIcon /> Continue with GitHub
                </Button>
              )}
              {oauthProviders.google && (
                <Button variant="outline" render={<a href={oauthStartUrl("google")} />}>
                  <GoogleIcon /> Continue with Google
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
