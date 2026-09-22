export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ChatRequestError";
    this.code = code;
  }
}

export async function sendChatMessage(
  context: string,
  messages: ChatRequestMessage[],
  accessToken: string,
): Promise<string> {
  const response = await fetch("/api/owlie", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ context, messages }),
  });

  const data = (await response.json().catch(() => null)) as
    | { reply: string; error?: undefined }
    | { error: string; code?: string }
    | null;
  if (!response.ok || !data || "error" in data) {
    const info = data as { error?: string; code?: string } | null;
    throw new ChatRequestError(
      info?.error ?? "Owlie couldn’t respond just now — please try again.",
      info?.code ?? "unknown",
    );
  }
  return data.reply;
}
