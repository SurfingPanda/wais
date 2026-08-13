export {};

// Chrome's on-device Prompt API (Gemini Nano). Present only in supporting
// Chrome versions with the feature enabled/origin-trialed — the shape has
// churned before (window.ai.canCreateTextSession() -> ai.languageModel ->
// this global), so keep this in sync with
// https://developer.chrome.com/docs/ai/prompt-api at implementation time.
// Always feature-detect with `typeof LanguageModel !== "undefined"` before
// use; referencing the bare identifier without that check throws in
// browsers that don't declare it.
declare global {
  interface LanguageModelSession {
    prompt(input: string): Promise<string>;
    clone?: (options?: { signal?: AbortSignal }) => Promise<LanguageModelSession>;
    destroy(): void;
  }

  interface LanguageModelCreateOptions {
    initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
    signal?: AbortSignal;
    [key: string]: unknown;
  }

  interface LanguageModelStatic {
    availability(
      options?: Record<string, unknown>,
    ): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  }

  var LanguageModel: LanguageModelStatic | undefined;
}
