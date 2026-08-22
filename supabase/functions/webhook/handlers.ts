import { MINI_APP_URL } from "./config.ts";
import { sendMessage, getChatMember } from "./telegram.ts";
import { isRegistered, isGroupAuthorized, sumarXP, registrarActividadGrupo, vincularTemaMiniJefes } from "./db.ts";
import { filtrarMensaje } from "./podometro.ts";

const NOMBRES_TEMA_MINIBOSS = ["mini jefes", "mini boss"];

async function esAdministrador(chatId: number, userId: number): Promise<boolean> {
  if (!userId) return false;
  const info = await getChatMember(chatId, userId);
  const status = info?.result?.status;
  return status === "administrator" || status === "creator";
}

// Comando manual: se manda DENTRO del tema que se quiere usar para los avisos de
// mini jefes. Existe porque el Bot API no tiene forma de listar los temas de un
// foro ni de encontrarlos por nombre — solo puede leer message_thread_id del
// update en el que llega. Cubre temas creados antes de que el bot escuchara.
export async function handleVincularTemaMiniJefes(msg: any) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id;
  const userId = msg.from?.id;

  if (!threadId) {
    await sendMessage(chatId, "Mandá este comando dentro del tema que querés usar para los avisos de mini jefes, no en General.");
    return;
  }

  if (!(await esAdministrador(chatId, userId))) {
    await sendMessage(chatId, "Solo un admin del grupo puede vincular el tema de mini jefes.", undefined, threadId);
    return;
  }

  await vincularTemaMiniJefes(chatId, threadId);
  await sendMessage(chatId, "Listo — los avisos de mini jefes van a llegar a este tema de ahora en más.", undefined, threadId);
}

// Detección pasiva: si en el futuro se crea o renombra un tema a "Mini jefes"/
// "Mini boss" mientras el bot ya está en el grupo, se vincula solo, sin comando.
export async function handleForumTopicEvent(msg: any) {
  const nombre: string | undefined = msg.forum_topic_created?.name ?? msg.forum_topic_edited?.name;
  const threadId = msg.message_thread_id;
  if (!nombre || !threadId) return;
  if (!NOMBRES_TEMA_MINIBOSS.includes(nombre.trim().toLowerCase())) return;
  await vincularTemaMiniJefes(msg.chat.id, threadId);
}

export async function handleStart(chatId: number) {
  const registrado = await isRegistered(chatId);
  if (registrado) {
    await sendMessage(chatId, "Bienvenido de nuevo al Último Bastión.", {
      inline_keyboard: [[{ text: "Abrir Mini App", web_app: { url: MINI_APP_URL } }]],
    });
  } else {
    await sendMessage(
      chatId,
      "Bienvenido al Último Bastión. Aún no estás registrado. Abre la Mini App para registrarte.",
      { inline_keyboard: [[{ text: "Registrarme", web_app: { url: MINI_APP_URL } }]] }
    );
  }
}

export async function handleGroupMessage(chatId: number, telegramId: number, text: string) {
  const charCount = filtrarMensaje(text);
  if (charCount === 0) return;

  const [autorizado, registrado] = await Promise.all([
    isGroupAuthorized(chatId),
    isRegistered(telegramId),
  ]);

  if (!autorizado) {
    console.log("Grupo no autorizado:", chatId);
    return;
  }
  if (!registrado) return;

  const [result] = await Promise.all([
    sumarXP(telegramId, charCount),
    registrarActividadGrupo(telegramId, chatId),
  ]);
  console.log("XP anadida:", result);

  if (result && result.leveled_up) {
    await sendMessage(
      telegramId,
      `¡Has subido de nivel! Ahora eres nivel ${result.new_level}.`
    );
  }
}
