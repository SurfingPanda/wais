import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Checks loan/recurring-transaction due dates and sends push reminders.
  // Once daily — the minimum granularity on the Hobby plan.
  crons: [{ path: "/api/cron/send-reminders", schedule: "0 13 * * *" }],
};
