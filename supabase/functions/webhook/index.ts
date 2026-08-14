import { handleStart, handleGroupMessage } from "./handlers.ts";

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response("Bot funcionando", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const update = await req.json();
    console.log("Update:", update);

    const msg = update.message;
    if (!msg || !msg.text) return new Response("OK", { status: 200 });

    const chatId = msg.chat.id;
    const text = msg.text as string;

    if (text === "/start") {
      await handleStart(chatId);
    } else if (
      !text.startsWith("/") &&
      (msg.chat.type === "group" || msg.chat.type === "supergroup")
    ) {
      await handleGroupMessage(chatId, msg.from.id, text);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
});