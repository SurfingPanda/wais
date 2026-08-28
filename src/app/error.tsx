"use client";

// Route-level error boundary for everything under the root layout (the whole
// authed app included). Without this, a thrown render error in any page — a
// bad currency code, a null deref — drops the user on a blank screen with no
// way back. `reset()` re-renders the segment; the reload is the escape hatch
// when the error is in module state the boundary can't clear.

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            That screen hit an unexpected error. Your data is safe — it&rsquo;s stored on this
            device and syncs when it can.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reset()}>
            <RotateCcw className="size-3.5" /> Try again
          </Button>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
