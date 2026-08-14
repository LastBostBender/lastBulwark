import { SUPABASE_URL, SB_HEADERS, SB_HEADERS_JSON } from "./config.ts";

export async function isRegistered(telegramId: number): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?telegram_id=eq.${telegramId}&select=telegram_id`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) {
    console.error("Error consultando profiles:", await res.text());
    return false;
  }
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

export async function isGroupAuthorized(chatId: number): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/authorized_groups?chat_id=eq.${chatId}&select=chat_id`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) return false;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

export async function sumarXP(telegramId: number, charCount: number) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/sumar_xp`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_telegram_id: telegramId, p_char_count: charCount }),
  });
  if (!res.ok) {
    console.error("Error al sumar XP:", await res.text());
    return null;
  }
  return res.json();
}