"use client";

import { useEffect, useRef, useState, type DependencyList } from "react";
import type { Insight } from "./insights";

// Module-level so navigating between pages (or re-rendering with unchanged
// numbers) doesn't re-invoke the on-device model for an insight it already
// generated this session.
const cache = new Map<string, Insight>();
const MAX_CACHE_ENTRIES = 50;

function remember(insight: Insight) {
  cache.delete(insight.id);
  cache.set(insight.id, insight);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Renders `fallback()` immediately (no loading flash for the common
 * no-on-device-AI case), then tries `generate()` in the background and
 * swaps to that result if it resolves to something before `deps` change.
 * `fallback`/`generate` must return null when nothing needs attention.
 */
export function useOwlieInsight(
  fallback: () => Insight | null,
  generate: () => Promise<Insight | null>,
  deps: DependencyList,
): { insight: Insight | null; loading: boolean } {
  const fb = fallback();
  const cached = fb ? cache.get(fb.id) : undefined;
  const cachedAi = cached && cached.source === "ai" ? cached : null;

  const [generated, setGenerated] = useState<Insight | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const myGeneration = ++generationRef.current;
    const current = fallback();
    if (!current || cache.get(current.id)?.source === "ai") return;

    generate().then((result) => {
      if (generationRef.current !== myGeneration || !result) return; // superseded or no upgrade available
      remember(result);
      setGenerated(result);
    });
    // fallback/generate are recomputed from deps by the caller each render;
    // deps alone is what should re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const upgraded = fb && generated && generated.id === fb.id ? generated : null;
  const insight = fb ? (cachedAi ?? upgraded ?? fb) : null;
  const loading = !!fb && !cachedAi && !upgraded;

  return { insight, loading };
}
