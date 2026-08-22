import { BOT_TOKEN } from "./config.ts";

export async function sendMessage(chatId: number, text: string, replyMarkup?: any, threadId?: number) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (threadId) payload.message_thread_id = threadId;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function getChatMember(chatId: number, userId: number) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${userId}`;
  const res = await fetch(url);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
  });
}