"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inputFocusRing =
  "focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30 dark:focus-visible:border-emerald-400";

const gradientButton =
  "group w-full border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-emerald-500/40 active:scale-[0.98]";

export default function ResetPasswordPage() {
  const router = useRouter();
  // Clicking the emailed reset link lands here with a recovery token in the
  // URL — the Supabase client (detectSessionInUrl) picks it up automatically
  // and turns it into a session, which is what lets updateUser() below work.
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      const id = setTimeout(() => router.replace("/dashboard"), 1200);
      return () => clearTimeout(id);
    }
  }, [done, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    setDone(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20">
      <div className="relative w-full max-w-sm space-y-6 rounded-3xl bg-card p-8 ring-1 ring-emerald-500/10 shadow-2xl shadow-emerald-950/10">
        <div className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-extrabold text-white shadow-md shadow-emerald-500/30">
            W
          </div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Verifying your link...</p>
        ) : !user ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Back to sign in
            </Link>
          </div>
        ) : done ? (
          <p className="text-center text-sm text-muted-foreground">
            Password updated. Taking you to your dashboard...
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-emerald-500/70" />
                <Input
                  id="new-password"
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
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                className={inputFocusRing}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className={gradientButton} disabled={submitting}>
              {submitting ? (
                "Updating..."
              ) : (
                <>
                  Update password
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
