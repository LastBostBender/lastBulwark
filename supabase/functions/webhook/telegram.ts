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
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || data?.ok === false) {
    console.error("sendMessage rechazado:", JSON.stringify(data), "payload:", JSON.stringify(payload));
    if (threadId) {
      const { message_thread_id, ...sinHilo } = payload;
      const retry = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sinHilo),
      });
      try {
        return await retry.json();
      } catch {
        return null;
      }
    }
  }
  return data;
}

export async function editMessageText(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
  const payload: any = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  payload.reply_markup = replyMarkup ?? { inline_keyboard: [] };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || data?.ok === false) {
    console.error("editMessageText rechazado:", JSON.stringify(data), "payload:", JSON.stringify(payload));
  }
  return data;
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
