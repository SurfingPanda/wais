import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Only wrap with Serwist for production builds (which run with --webpack).
// Constructing the wrapper at all under `next dev --turbopack` prints a
// warning and isn't needed anyway, since the service worker is only useful
// in a real deployed build.
export default async function config() {
  if (process.env.NODE_ENV !== "production") return nextConfig;
  const withSerwistInit = (await import("@serwist/next")).default;
  const withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
  });
  return withSerwist(nextConfig);
}
