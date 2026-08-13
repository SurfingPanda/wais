"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OwlieTone = "critical" | "warning" | "info" | "neutral";

export interface OwlieTipProps {
  /** Tip content — plain text or JSX with inline links. */
  children: ReactNode;
  tone?: OwlieTone;
  size?: "sm" | "md";
  /** Renders the little speech-bubble triangle — use on the first item in a stacked list. */
  tail?: boolean;
  /** Hide Owlie's portrait, leaving a spacer so a stacked list still lines up under the first tip's image. */
  mascot?: boolean;
  /** Subtle dim while an on-device/AI upgrade of the text is still resolving over the fallback. */
  loading?: boolean;
  className?: string;
}

const TONE_BUBBLE: Record<OwlieTone, string> = {
  critical: "bg-red-500/15 text-red-700 ring-red-500/15 dark:text-red-400",
  warning: "bg-amber-500/15 text-amber-700 ring-amber-500/15 dark:text-amber-400",
  info: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/15 dark:text-emerald-400",
  neutral: "bg-muted text-muted-foreground ring-transparent",
};

const TONE_TAIL: Record<OwlieTone, string> = {
  critical: "bg-red-500/15",
  warning: "bg-amber-500/15",
  info: "bg-emerald-500/15",
  neutral: "bg-muted",
};

const MASCOT_HEIGHT = { sm: "h-10", md: "h-14" } as const;
// Matches the portrait's ~1.2:1 aspect ratio at each height, so a
// mascot-less tip in a stacked list still lines up under the one above it.
const MASCOT_SPACER_WIDTH = { sm: "w-12", md: "w-[67px]" } as const;

export function OwlieTip({
  children,
  tone = "neutral",
  size = "sm",
  tail = false,
  mascot = true,
  loading = false,
  className,
}: OwlieTipProps) {
  return (
    <div className={cn("flex gap-3", tail ? "items-start" : "items-center", className)}>
      {mascot ? (
        <Image
          src="/mascot-owl.png"
          alt="Owlie"
          width={856}
          height={712}
          className={cn(MASCOT_HEIGHT[size], "w-auto shrink-0 drop-shadow-sm")}
        />
      ) : (
        <span className={cn(MASCOT_HEIGHT[size], MASCOT_SPACER_WIDTH[size], "shrink-0")} aria-hidden />
      )}
      <p
        className={cn(
          "relative flex-1 rounded-2xl px-3 py-2.5 text-sm font-medium ring-1 transition-opacity",
          TONE_BUBBLE[tone],
          loading && "opacity-70",
        )}
      >
        {tail && (
          <span
            className={cn(
              "absolute top-1/2 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]",
              TONE_TAIL[tone],
            )}
            aria-hidden
          />
        )}
        {children}
      </p>
    </div>
  );
}
