import { MINI_APP_URL } from "./config.ts";
import { sendMessage } from "./telegram.ts";
import { isRegistered, isGroupAuthorized, sumarXP } from "./db.ts";
import { filtrarMensaje } from "./podometro.ts";

export async function handleStart(chatId: number) {
  const registrado = await isRegistered(chatId);
  if (registrado) {
    await sendMessage(chatId, "Bienvenido de nuevo al Ultimo Bastion.", {
      inline_keyboard: [[{ text: "Abrir Mini App", web_app: { url: MINI_APP_URL } }]],
    });
  } else {
    await sendMessage(
      chatId,
      "Bienvenido al Ultimo Bastion. Aun no estas registrado. Abre la Mini App para registrarte.",
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

  const result = await sumarXP(telegramId, charCount);
  console.log("XP anadida:", result);

  if (result && result.leveled_up) {
    await sendMessage(
      telegramId,
      `¡Has subido de nivel! Ahora eres nivel ${result.new_level}.`
    );
  }
}