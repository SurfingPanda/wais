// Client side of receipt scanning: downscale the photo in the browser (fast
// upload, lower Gemini cost, no 413s), POST it to /api/scan-receipt with the
// caller's Supabase access token, and hand back the structured result.

export interface ScannedLine {
  name: string;
  price: number;
}

export interface ScannedReceipt {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string | null;
  lines: ScannedLine[];
}

// Thrown when /api/scan-receipt returns an error. `code` mirrors the route's
// ScanErrorCode ("rate_limited", "not_configured", "image_rejected", …) so
// the caller can react to specific failures; `message` is already user-facing.
export class ScanRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ScanRequestError";
    this.code = code;
  }
}

const MAX_EDGE = 1600; // px on the long edge — plenty for receipt OCR
const JPEG_QUALITY = 0.85;

async function downscale(file: File): Promise<{ base64: string; mimeType: string }> {
  // Anything a <canvas> can't handle (e.g. HEIC on some browsers, or no DOM)
  // falls back to sending the original bytes untouched.
  const fallback = async () => ({
    base64: await fileToBase64(file),
    mimeType: file.type || "image/jpeg",
  });

  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return fallback();
  }

  try {
    // from-image so EXIF-rotated phone photos aren't fed to Gemini sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback();
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) return fallback();
    return { base64, mimeType: "image/jpeg" };
  } catch {
    return fallback();
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the image file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export async function scanReceipt(file: File, accessToken: string): Promise<ScannedReceipt> {
  const { base64, mimeType } = await downscale(file);

  const res = await fetch("/api/scan-receipt", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ image: base64, mimeType }),
  });

  const data = (await res.json().catch(() => null)) as
    | (ScannedReceipt & { error?: undefined })
    | { error: string; code?: string }
    | null;

  if (!res.ok || !data || "error" in data) {
    const info = data as { error?: string; code?: string } | null;
    throw new ScanRequestError(
      info?.error ?? "Couldn’t scan the receipt — please try again.",
      info?.code ?? "unknown",
    );
  }

  return data;
}
