import { supabase } from "./supabase";
import { useAuth } from "./auth-provider";

export const CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "PHP", label: "Philippine Peso", symbol: "₱" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
] as const;

export const DEFAULT_CURRENCY = "USD";

// Currency is stored on the Supabase auth user (user_metadata), not in a
// synced table — it's a per-account display preference, not app data, and
// updateUser() already triggers the auth listener that every useAuth()
// consumer subscribes to, so no extra provider/context is needed.
export function useCurrency() {
  const { user } = useAuth();
  const currency = (user?.user_metadata?.currency as string | undefined) ?? DEFAULT_CURRENCY;

  async function setCurrency(code: string) {
    await supabase.auth.updateUser({ data: { currency: code } });
  }

  return { currency, setCurrency };
}
