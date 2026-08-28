"use client";

// Last-resort boundary for errors thrown by the root layout itself (providers,
// fonts, theme). It replaces <html>/<body>, so it can't use app chrome or the
// theme variables — keep it self-contained and inline-styled.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Wais couldn&rsquo;t start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#a1a1a1", margin: "0 0 1rem" }}>
            The app hit an error while loading. Reloading usually fixes it. Your data stays on this
            device.
          </p>
          <button
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "1px solid #2a2a2a",
              background: "#fafafa",
              color: "#0a0a0a",
              fontSize: "0.875rem",
              fontWeight: 500,
              borderRadius: "0.5rem",
              padding: "0.4rem 0.9rem",
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#6b6b6b", marginTop: "0.75rem" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
