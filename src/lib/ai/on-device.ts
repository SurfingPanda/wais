// Adapter over Chrome's on-device Prompt API (Gemini Nano). Runs entirely
// client-side — no server, no API key. Every export is defensive: on any
// missing API, error, or non-"available" state, callers get null/"unavailable"
// so they fall back to templated text instead of breaking.
//
// Note: on a production origin, unflagged Chrome only exposes this API to
// sites registered for its Origin Trial — until that's set up, this will
// read "unavailable" for essentially all real users. That's expected; the
// fallback path (see ./insights.ts) is the common case, not an edge case.

export type OnDeviceAvailability = "unavailable" | "downloadable" | "downloading" | "available";

const OWLIE_PERSONA =
  "You are Owlie, a friendly owl mascot inside a personal budgeting app. " +
  "You give short, encouraging, concrete money advice based on the facts you're given. " +
  "Never use markdown or emoji. Keep every reply to one sentence, under 200 characters.";

let sessionPromise: Promise<LanguageModelSession | null> | null = null;

function hasLanguageModel(): boolean {
  return typeof window !== "undefined" && typeof LanguageModel !== "undefined";
}

async function getTemplateSession(): Promise<LanguageModelSession | null> {
  if (!hasLanguageModel()) return null;
  if (!sessionPromise) {
    sessionPromise = LanguageModel!
      .create({ initialPrompts: [{ role: "system", content: OWLIE_PERSONA }] })
      .catch(() => null);
  }
  return sessionPromise;
}

export async function getOnDeviceAvailability(): Promise<OnDeviceAvailability> {
  if (!hasLanguageModel()) return "unavailable";
  try {
    const availability = await LanguageModel!.availability();
    return availability === "unavailable" ? "unavailable" : availability;
  } catch {
    return "unavailable";
  }
}

export async function generateOnDeviceText(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  // Ambient/background insights must never trigger a multi-hundred-MB model
  // download — only proceed when the model is already available.
  const availability = await getOnDeviceAvailability();
  if (availability !== "available") return null;

  const template = await getTemplateSession();
  if (!template) return null;

  let session = template;
  let forked = false;
  try {
    if (template.clone) {
      session = await template.clone();
      forked = true;
    }
    const timeoutMs = opts.timeoutMs ?? 4000;
    const result = await Promise.race([
      session.prompt(prompt),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return typeof result === "string" && result.trim() ? result.trim() : null;
  } catch {
    return null;
  } finally {
    if (forked) session.destroy();
  }
}

export function destroySharedSession(): void {
  const pending = sessionPromise;
  sessionPromise = null;
  pending?.then((session) => session?.destroy()).catch(() => {});
}
