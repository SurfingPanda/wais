<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Wais agent guide

Wais is an offline-first personal-finance PWA. Prioritize data integrity,
responsive mobile UX, and fast local interactions over adding complexity.

## Architecture

- `src/app/` contains App Router routes. Pages under `src/app/(app)/` require
  authentication and share the application chrome in its layout.
- `src/components/` contains reusable client UI. Reuse the existing Base UI
  primitives in `src/components/ui/` and Lucide icons before adding packages.
- `src/lib/db.ts` defines the Dexie/IndexedDB schema. `src/lib/actions/` is
  the only place ordinary user-initiated financial writes should originate.
- `src/lib/sync.ts` moves queued local mutations to Supabase and pulls remote
  updates. `src/lib/types.ts` is the canonical client data model.
- `supabase/schema.sql` is the complete fresh-install schema. Each change for
  existing databases also needs an ordered, idempotent SQL migration in
  `supabase/migrations/`.
- Server-only integrations belong in route handlers under `src/app/api/` and
  must keep secrets server-only; never expose a service-role or Gemini key via
  a `NEXT_PUBLIC_` variable.

## Implemented finance features

- **Accounts and account history:** Accounts support cash, checking, savings,
  debit-card, credit-card, and other account types. Transactions may reference
  a source account and (for transfers) a destination account. Account history
  explains income, expenses, transfers, refunds, reconciliation adjustments,
  loan payments, and balance changes; preserve these tags when editing or
  rendering transactions.
- **Loan payments:** Loans can optionally have a default payment account.
  Recording a payment may override that account, but account selection remains
  optional. Payment actions validate finite positive amounts, valid dates and
  account ownership, and reject payments above the remaining balance unless an
  explicit override is provided.
- **Households:** `useHousehold()` and the household-scope helpers define the
  active household. Every live query and financial action must scope shared
  rows to that household (while retaining the deliberate legacy fallback for
  rows with no household id). Never display another household's local rows.
- **Financial action validation:** Domain validation belongs inside actions,
  not only in form controls. Reject `NaN`, infinity, zero/negative amounts,
  malformed dates, invalid account references, and accounts outside the active
  household before writing to Dexie or enqueueing a mutation.
- **Sync transparency and recovery:** `src/lib/sync.ts` owns the mutation
  queue, bounded retry/backoff (1s, 2s, 4s), pending count, last successful
  sync timestamp, and retryable versus permanent error handling. The sync
  indicator must expose queued work and last-sync time, and failed syncs must
  offer an explicit retry action. Conflicts are retained in Dexie; the conflict
  UI must let users explicitly re-queue the preserved local edit or dismiss it.

## Non-negotiable data rules

1. **Write local first.** Financial writes must update Dexie, enqueue a
   mutation, then request a background sync. Do not make UI responsiveness
   depend on the network.
2. **Keep complete upsert payloads.** Sync uses upserts. Insert payloads—and
   any update that might need to create a row remotely—must include required
   ownership fields such as `user_id`.
3. **Preserve soft deletes.** Use `deleted_at`; never hard-delete synced
   financial records from the server protocol.
4. **Respect sync conflicts.** Do not silently overwrite an existing conflict
   strategy or remove queued mutations to hide an error.
5. **Keep household scope intact.** Financial rows can be shared by household.
   Do not reintroduce user-only queries or assumptions without an intentional
   migration and offline-scope plan.

## UI conventions

- Build mobile-first. The bottom navigation and safe-area padding are part of
  the app shell; verify changes on narrow screens.
- Use Tailwind utilities and the design tokens in `src/app/globals.css`.
  Prefer component-local utilities over new global CSS.
- Use `Button` with `nativeButton={false}` when its `render` prop renders a
  link or any non-`button` element.
- Destructive actions require a confirmation dialog that names the affected
  record and explains the impact.
- Keep common finance tasks fast: meaningful defaults, direct feedback, and
  no needless navigation for a simple entry.
- Preserve accessibility: semantic controls, labels for inputs, keyboard
  operation, and `aria-label`s for icon-only buttons.

## Workflow

1. Inspect the relevant page, action, types, and existing tests before editing.
2. Make the smallest cohesive change. Do not refactor unrelated code in a
   feature or bug-fix task.
3. Add or update focused Vitest coverage for pure logic and regressions.
4. Run the appropriate checks:

   ```powershell
   npm run lint
   npx tsc --noEmit
   npm test
   ```

5. Run `npm run build` when a production build check is needed. It uses
   webpack because Serwist does not support Turbopack. A build failure caused
   solely by unavailable Google Fonts/network access should be reported
   clearly, not worked around by changing fonts without approval.

## Git and deployment

- Check `git status --short` before editing and preserve unrelated user work.
- Do not commit, push, apply Supabase migrations, or deploy unless explicitly
  requested.
- When asked to deploy, push the verified commit first, use
  `vercel --prod --yes`, then confirm the deployment reports `Ready` with
  `vercel inspect <deployment-url>`.

## Useful commands

```powershell
npm run dev          # local development; no production service worker
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript validation
npm test             # Vitest suite
npm run build        # production/Serwist build
```
