"use client";

import { useEffect, useState, type FormEvent, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowRight,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Mail,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  WifiOff,
} from "lucide-react";

const BAR_HEIGHTS = [35, 55, 40, 72, 50, 86, 64];

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.28a12 12 0 0 0 0 10.75l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.63l3.99 3.1C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

const GOOGLE_INTENT_KEY = "wais-google-auth-intent";

const inputFocusRing =
  "focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 dark:focus-visible:border-emerald-400";

const gradientButton =
  "group w-full border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-emerald-500/40 active:scale-[0.98]";

export default function LoginPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<"auth" | "forgot">("auth");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    const intent = sessionStorage.getItem(GOOGLE_INTENT_KEY);
    if (intent) sessionStorage.removeItem(GOOGLE_INTENT_KEY);

    if (intent === "signin") {
      // A Google sign-in that creates the account in the same instant it signs
      // in means no account existed beforehand — reject it and send them to sign up.
      const createdAt = new Date(user.created_at).getTime();
      const lastSignInAt = user.last_sign_in_at
        ? new Date(user.last_sign_in_at).getTime()
        : createdAt;
      const isBrandNewAccount = Math.abs(lastSignInAt - createdAt) < 5000;

      if (isBrandNewAccount) {
        supabase.auth.signOut().then(() => {
          toast.error("No account found for that Google account. Please sign up first.");
        });
        return;
      }
    }

    router.replace("/dashboard");
  }, [authLoading, user, router]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/dashboard");
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created. Check your email if confirmation is required, then sign in.");
  }

  async function handleGoogleAuth() {
    setGoogleSubmitting(true);
    sessionStorage.setItem(GOOGLE_INTENT_KEY, authTab);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      sessionStorage.removeItem(GOOGLE_INTENT_KEY);
      setGoogleSubmitting(false);
      toast.error(error.message);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setResetSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-teal-400/30 blur-3xl animate-blob [animation-delay:2.5s]" />
        <div className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-amber-300/25 blur-3xl animate-blob [animation-delay:5s]" />
        <div className="absolute top-1/4 left-1/2 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl animate-blob [animation-delay:1.5s]" />
      </div>

      <div
        className={cn(
          "relative grid w-full max-w-4xl overflow-hidden rounded-3xl bg-card ring-1 ring-emerald-500/10 shadow-2xl shadow-emerald-950/10 transition-all duration-700 md:grid-cols-2",
          mounted ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
      >
        {/* Animated hero panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-8 text-white md:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.25),_transparent_55%)]" />
          <Wallet className="absolute top-10 left-8 size-8 text-white/60 animate-float" />
          <Coins className="absolute top-24 right-12 size-6 text-white/50 animate-float-delayed" />
          <PiggyBank className="absolute bottom-36 left-14 size-9 text-white/50 animate-float-delayed" />
          <Sparkles className="absolute right-10 bottom-48 size-5 text-white/60 animate-float" />

          <div className="relative z-10 space-y-1">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-white/15 text-base font-extrabold ring-1 ring-white/25 backdrop-blur">
                W
              </span>
              Wais
            </div>
            <p className="text-sm text-white/80">Every peso, on a mission.</p>
          </div>

          <div className="relative z-10 flex h-32 items-end gap-2">
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-white/50 to-white/90 transition-[height] duration-700 ease-out"
                style={{
                  height: mounted ? `${h}%` : "4%",
                  transitionDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>

          <svg viewBox="0 0 200 40" className="relative z-10 h-10 w-full text-white">
            <path
              d="M0 32 L30 24 L60 28 L90 14 L120 18 L150 6 L200 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: mounted ? 0 : 1,
                transition: "stroke-dashoffset 1.6s ease-out 0.5s",
              }}
            />
          </svg>

          <ul className="relative z-10 space-y-2 text-sm text-white/85">
            <li className="flex items-center gap-2">
              <TrendingUp className="size-4 shrink-0" />
              See where every peso goes
            </li>
            <li className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" />
              Works fully offline
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0" />
              Synced securely, only for you
            </li>
          </ul>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center gap-6 p-8">
          <div className="space-y-1 md:hidden">
            <div className="flex items-center gap-2 text-xl font-semibold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-extrabold text-white shadow-md shadow-emerald-500/30">
                W
              </span>
              Wais
            </div>
            <p className="text-sm text-muted-foreground">
              Track spending, even when you&apos;re offline.
            </p>
          </div>
          <div className="hidden space-y-1 md:block">
            <h1 className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-2xl font-semibold text-transparent dark:from-emerald-400 dark:to-teal-400">
              {view === "forgot" ? "Reset your password" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {view === "forgot"
                ? "We'll email you a link to set a new one."
                : "Sign in to keep your budget on track."}
            </p>
          </div>

          {view === "forgot" ? (
            <div className="space-y-4 pt-2">
              {resetSent ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    If an account exists for{" "}
                    <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a
                    password reset link. Check your inbox.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setView("auth");
                      setResetSent(false);
                    }}
                    className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleForgotPassword}>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                      <Input
                        id="forgot-email"
                        type="email"
                        required
                        className={cn("pl-8", inputFocusRing)}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className={gradientButton} disabled={resetSubmitting}>
                    {resetSubmitting ? (
                      "Sending..."
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setView("auth")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </div>
          ) : (
          <Tabs
            value={authTab}
            onValueChange={(v) => setAuthTab(v as "signin" | "signup")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="signin"
                className="data-active:text-emerald-600 dark:data-active:text-emerald-400"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-active:text-emerald-600 dark:data-active:text-emerald-400"
              >
                Sign up
              </TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                    <Input
                      id="signin-email"
                      type="email"
                      required
                      className={cn("pl-8", inputFocusRing)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      required
                      className={cn("pr-8 pl-8", inputFocusRing)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-emerald-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className={gradientButton} disabled={submitting}>
                  {submitting ? (
                    "Signing in..."
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={handleSignUp}>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      className={cn("pl-8", inputFocusRing)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      className={cn("pr-8 pl-8", inputFocusRing)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-emerald-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className={gradientButton} disabled={submitting}>
                  {submitting ? (
                    "Creating account..."
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          )}

          {view === "auth" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or continue with</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={googleSubmitting}
                onClick={handleGoogleAuth}
              >
                <GoogleIcon />
                {googleSubmitting ? "Redirecting..." : "Continue with Google"}
              </Button>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-emerald-500/5 p-3 text-xs text-muted-foreground ring-1 ring-emerald-500/10">
            <WifiOff className="mt-0.5 size-3.5 shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
            <p>
              You&apos;ll need a connection for this step. After signing in once, the app keeps
              working offline.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
