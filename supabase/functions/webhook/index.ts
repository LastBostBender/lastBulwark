import { handleStart, handleGroupMessage, handleVincularTemaMiniJefes, handleVincularTemaArenas, handleForumTopicEvent } from "./handlers.ts";
import { handleCronTick, handleCallbackQuery } from "./miniboss.ts";
import { handleDueloForward, handleDueloComando, handleArenaCallback, tickArena } from "./arena.ts";

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

    if (update.tipo === "mb_cron_tick") {
      await handleCronTick();
      await tickArena();
      return new Response("OK", { status: 200 });
    }

    if (update.callback_query) {
      const data = update.callback_query.data as string | undefined;
      if (data?.startsWith("arena_")) {
        await handleArenaCallback(update.callback_query);
      } else {
        await handleCallbackQuery(update.callback_query);
      }
      return new Response("OK", { status: 200 });
    }

    const msg = update.message;

    if (msg && (msg.forum_topic_created || msg.forum_topic_edited)) {
      await handleForumTopicEvent(msg);
      return new Response("OK", { status: 200 });
    }

    if (!msg || !msg.text) return new Response("OK", { status: 200 });

    const chatId = msg.chat.id;
    const text = msg.text as string;

    if (text === "/start") {
      await handleStart(chatId);
    } else if (text === "/duelo") {
      await handleDueloComando(msg);
    } else if (/\/duelo_[a-f0-9]{6}\b/i.test(text) && msg.chat.type === "private") {
      await handleDueloForward(msg);
    } else if (text.startsWith("/tema_minijefes") && msg.chat.type === "supergroup") {
      await handleVincularTemaMiniJefes(msg);
    } else if (text.startsWith("/tema_arenas") && msg.chat.type === "supergroup") {
      await handleVincularTemaArenas(msg);
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
