import "server-only";

// Thin wrapper over the Gemini REST API (Google AI Studio key). No SDK — a
// single fetch keeps the dependency surface as small as the rest of this
// repo. Used only from Route Handlers; never import from client code.

const DEFAULT_MODEL = "gemini-3.6-flash";

export interface ScannedLine {
  name: string;
  price: number;
}

export interface ScannedReceipt {
  merchant: string | null;
  purchasedAt: string | null; // YYYY-MM-DD, or null when unreadable
  currency: string | null; // ISO 4217 when determinable
  lines: ScannedLine[];
}

// OpenAPI-subset schema Gemini honours via responseSchema, so the model
// returns parseable JSON in exactly this shape instead of prose.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING", nullable: true },
    purchased_at: {
      type: "STRING",
      nullable: true,
      description: "Purchase date printed on the receipt as YYYY-MM-DD, or null if not shown",
    },
    currency: {
      type: "STRING",
      nullable: true,
      description: "ISO 4217 currency code if determinable from the receipt, else null",
    },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Short human-readable product name" },
          price: { type: "NUMBER", description: "Amount paid for this line, after any per-line discount" },
        },
        required: ["name", "price"],
      },
    },
  },
  required: ["lines"],
} as const;

const PROMPT = [
  "You are reading a photo of a grocery/store receipt.",
  "Extract every purchased product line item.",
  "Rules:",
  "- One entry per purchased line item.",
  "- EXCLUDE non-product rows: subtotal, total, tax/VAT, change, rounding, tender/cash/card, loyalty points, and standalone discount lines.",
  "- If a line shows a discount applied to that product, use the net price actually paid for it.",
  "- name: a short, clean product name (fix obvious OCR noise, drop SKU codes and quantity prefixes).",
  "- price: a positive number using a dot decimal separator.",
  "- purchased_at: the date printed on the receipt as YYYY-MM-DD, or null.",
  "- currency: ISO 4217 code if you can tell, else null.",
  "Return only the structured JSON.",
].join("\n");

export async function extractReceipt(
  imageBase64: string,
  mimeType: string,
): Promise<ScannedReceipt> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (payload.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the image (${payload.promptFeedback.blockReason})`);
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed JSON");
  }

  return normalize(parsed);
}

// The schema constrains the model but doesn't guarantee it, so every field
// is re-checked here before it can reach the client / the grocery log.
function normalize(raw: unknown): ScannedReceipt {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  const lines: ScannedLine[] = [];
  for (const entry of rawLines) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const price = typeof e.price === "number" ? e.price : Number(e.price);
    if (!name) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    lines.push({ name, price: Math.round(price * 100) / 100 });
  }

  const purchasedAt =
    typeof obj.purchased_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.purchased_at.trim())
      ? obj.purchased_at.trim()
      : null;

  const merchant =
    typeof obj.merchant === "string" && obj.merchant.trim() ? obj.merchant.trim() : null;

  const currency =
    typeof obj.currency === "string" && /^[A-Za-z]{3}$/.test(obj.currency.trim())
      ? obj.currency.trim().toUpperCase()
      : null;

  return { merchant, purchasedAt, currency, lines };
}
