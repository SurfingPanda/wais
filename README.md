# Wais

An offline-first budgeting app. All reads/writes go to a local IndexedDB
(via Dexie) first, so the app works with no network connection; a
background sync layer pushes and pulls against Supabase whenever you're
online.

## Stack

- **Next.js (App Router)** — deployed to Vercel, mostly static/client-rendered
- **Dexie.js** — IndexedDB wrapper, local source of truth
- **Supabase** — Postgres + Auth
- **Sync**: a mutation queue (`src/lib/sync.ts`) pushes queued local writes,
  then pulls rows changed since the last sync per table. Conflicts resolve
  last-write-wins on the server's `updated_at` (set by a DB trigger, so it's
  one clock, not the client's).
- **PWA**: [Serwist](https://serwist.pages.dev) (`src/app/sw.ts`) precaches
  the app shell/assets so the app can be opened with zero connectivity after
  the first visit. It only builds in production (`npm run build`, which
  forces `--webpack` — Serwist doesn't support Turbopack yet); `npm run dev`
  runs unmodified Turbopack with no service worker.

## Setup

1. **Create a Supabase project** at https://supabase.com (free tier).
2. In the Supabase SQL editor, run `supabase/schema.sql` — creates the
   `categories`, `transactions`, `budgets` tables with RLS policies scoped
   to `auth.uid()`.
3. In Supabase Auth settings, if you don't want email confirmation friction
   during development, disable "Confirm email" (Authentication → Providers → Email).
4. Copy `.env.local.example` to `.env.local` and fill in your project's
   URL and anon key (Supabase dashboard → Project Settings → API).
5. Install deps and run locally:
   ```
   npm install
   npm run dev
   ```

## Deploy to Vercel

```
npm i -g vercel   # if not already installed
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel deploy --prod
```

Or connect the repo in the Vercel dashboard and add the two env vars under
Project Settings → Environment Variables — both `production` and `preview`.

## How the offline/sync flow works

- Every write (`src/lib/actions/*.ts`) does two things: writes straight to
  Dexie (so the UI updates instantly via `dexie-react-hooks`' `useLiveQuery`)
  and appends an entry to a `mutations` queue table.
- `runSync()` (`src/lib/sync.ts`) drains that queue against Supabase, then
  pulls any rows changed since the last sync per table. It runs on load, on
  the browser's `online` event, every 60s while online, and after every
  local write (a no-op if offline).
- Deletes are soft (`deleted_at`), so tombstones propagate to other
  devices/tabs instead of orphaning rows that were already synced elsewhere.
- Records get client-generated UUIDs (`crypto.randomUUID()`) so they can be
  created while fully offline and still merge cleanly once synced.

## Known scaffold limitations

- Conflict resolution is last-write-wins — fine for a single-user budgeting
  app, not built for heavy concurrent multi-device editing of the same record.
- Pull queries cap at 5000 rows per table per sync cycle (no pagination yet).
- No password reset flow wired up — add via `supabase.auth.resetPasswordForEmail`.
