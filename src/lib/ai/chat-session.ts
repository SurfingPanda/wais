// Owns a single long-lived, stateful Prompt API session for the /owlie chat
// page. Distinct from on-device.ts's insights template session, which is
// short-lived and forked per call — a chat needs one session whose history
// accumulates across turns for as long as the page stays open.

import { getOnDeviceAvailability } from "./on-device";

const CHAT_PERSONA =
  "You are Owlie, a friendly owl mascot inside a personal budgeting app called Wais. " +
  "You help the user understand and improve their spending, budgets, and savings goals. " +
  "Be warm, encouraging, and concise — a few sentences at most per reply. " +
  "Only rely on the financial data given to you below; if asked about something it doesn't cover, say you don't have that information. " +
  "Never use markdown formatting.";

export async function createChatSession(contextSummary: string): Promise<LanguageModelSession | null> {
  const availability = await getOnDeviceAvailability();
  if (availability !== "available" || typeof LanguageModel === "undefined") return null;

  try {
    return await LanguageModel.create({
      initialPrompts: [
        {
          role: "system",
          content: `${CHAT_PERSONA}\n\nHere is the user's current financial snapshot:\n\n${contextSummary}`,
        },
      ],
    });
  } catch {
    return null;
  }
}

export async function sendChatMessage(
  session: LanguageModelSession,
  text: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const result = await Promise.race([
      session.prompt(text),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return typeof result === "string" && result.trim() ? result.trim() : null;
  } catch {
    return null;
  }
}
