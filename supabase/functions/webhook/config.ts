export const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) console.error("Falta BOT_TOKEN");

export const MINI_APP_URL =
  Deno.env.get("MINI_APP_URL") || "https://lastbostbender.github.io/lastBulwark/";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const SB_HEADERS = {
  apikey: SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};
export const SB_HEADERS_JSON = { ...SB_HEADERS, "Content-Type": "application/json" };
