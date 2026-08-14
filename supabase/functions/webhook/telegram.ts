import { BOT_TOKEN } from "./config.ts";

export async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}