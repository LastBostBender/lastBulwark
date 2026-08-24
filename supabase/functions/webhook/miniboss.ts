import { sendMessage, editMessageText, answerCallbackQuery } from "./telegram.ts";
import { generarEncuentros, cerrarColasVencidas, unirseCola, actualizarMensajeEncuentro, resolverCombatesFinalizados } from "./db.ts";

const INTROS_INVITACION = [
  "Alguien reportó una incidencia. La incidencia tiene forma humana y muy mal humor.",
  "El sistema detectó una amenaza. El sistema también detecta el WiFi del vecino, así que no le crean tanto.",
  "Se filtró a la sala de espera. Nadie sabe cómo entró, pero ya está pidiendo hablar con el gerente.",
];

function nombreJugador(p: { nombre?: string; telegram_id?: number }): string {
  const nombre = p.nombre ?? "alguien";
  if (p.telegram_id) {
    return `<a href="tg://user?id=${p.telegram_id}">${nombre}</a>`;
  }
  return nombre;
}

function bloqueListaEspera(lista: Array<{ nombre: string; telegram_id?: number }>): string {
  if (!lista || lista.length === 0) {
    return "En lista de espera: nadie se animó todavía.";
  }
  return "En lista de espera:\n" + lista.map((p) => `• ${nombreJugador(p)}`).join("\n");
}

function mensajeSpawn(nombreJefe: string, nivelJefe: number, totalOleadas: number, encounterId: number, lista: Array<{ nombre: string; telegram_id?: number }> = []) {
  const intro = INTROS_INVITACION[Math.floor(Math.random() * INTROS_INVITACION.length)];
  const text =
    `${intro}\n\n` +
    `Jefe: ${nombreJefe}\n` +
    `Nivel: ${nivelJefe}\n` +
    `Resolver en: ${totalOleadas} oleadas\n\n` +
    bloqueListaEspera(lista);

  return {
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "⚔️ Machacar", callback_data: `mb_join:${encounterId}` }]],
    },
  };
}

const CANCELADO_VACIO = [
  "El jefe esperó, revisó su reloj, y se fue. 67 no perdona la impuntualidad ajena, solo la propia.",
  "Nadie se presentó. El jefe lo tomó personal y se retiró a rumiarlo en otro chat.",
];

const CANCELADO_POCOS = [
  "participantes de 5 nada más? El jefe hizo cuentas, no le convenció el resultado, y se fue caminando. Consigan refuerzos.",
  "de 5. El jefe los miró, calculó el riesgo laboral, y decidió que hoy no. Vuelvan con más gente.",
];

function mensajeCancelado(nivelJefe: number, participantes: number): string {
  if (participantes === 0) {
    return CANCELADO_VACIO[Math.floor(Math.random() * CANCELADO_VACIO.length)];
  }
  const texto = CANCELADO_POCOS[Math.floor(Math.random() * CANCELADO_POCOS.length)];
  return `¿${participantes} ${texto}`;
}

function mensajeResultado(resultado: any): string {
  const estado = resultado?.estado;
  const nivelJefe = resultado?.nivel_jefe;

  if (estado === "cancelado") {
    return mensajeCancelado(nivelJefe, resultado?.participantes ?? 0);
  }

  if (estado === "iniciado") {
    return `⚔️ ¡Cola completa! El combate contra el mini jefe de nivel ${nivelJefe} ha comenzado.`;
  }

  return `El encuentro contra el mini jefe de nivel ${nivelJefe} terminó (${estado}).`;
}

function mensajeResultadoCombate(resultado: any): string {
  const nivelJefe = resultado?.nivel_jefe;
  const participantes = (resultado?.participantes ?? []) as Array<{
    nombre: string; xp_added?: number; leveled_up?: boolean; new_level?: number;
  }>;

  if (resultado?.estado === "derrota") {
    return `💀 Derrota contra el mini jefe de nivel ${nivelJefe}. El grupo cayó: ${
      participantes.map((p) => p.nombre).join(", ") || "nadie sobrevivió para contarlo"
    }.`;
  }

  const detalleXp = participantes
    .map((p) => {
      const medalla = p.leveled_up ? ` 🎖 (¡sube a nivel ${p.new_level}!)` : "";
      return `${p.nombre}${medalla}\n|--- +${p.xp_added ?? 0} XP`;
    })
    .join("\n");

  return `🏆 ¡Victoria contra el mini jefe de nivel ${nivelJefe}!\n\n${detalleXp}`;
}

export async function handleCronTick() {
  const nuevos = await generarEncuentros();
  for (const encuentro of nuevos) {
    const { text, replyMarkup } = mensajeSpawn(
      encuentro.nombre_jefe ?? "Enemigo desconocido",
      encuentro.nivel_jefe,
      encuentro.total_oleadas ?? 3,
      encuentro.encounter_id
    );
    const enviado = await sendMessage(
      encuentro.chat_id,
      text,
      replyMarkup,
      encuentro.topic_mini_boss_id
    );
    if (enviado?.result?.message_id) {
      await actualizarMensajeEncuentro(encuentro.encounter_id, enviado.result.message_id);
    }
  }

  const resueltos = await cerrarColasVencidas();
  for (const resultado of resueltos) {
    if (!resultado?.chat_id) continue;

    if (resultado.estado === "cancelado" && resultado.mensaje_id) {
      await editMessageText(resultado.chat_id, resultado.mensaje_id, mensajeResultado(resultado));
    }

    await sendMessage(resultado.chat_id, mensajeResultado(resultado), undefined, resultado.topic_mini_boss_id);
  }

  const combatesFinalizados = await resolverCombatesFinalizados();
  for (const resultado of combatesFinalizados) {
    if (resultado?.chat_id) {
      await sendMessage(resultado.chat_id, mensajeResultadoCombate(resultado), undefined, resultado.topic_mini_boss_id);
    }
  }
}

export async function handleCallbackQuery(callbackQuery: any) {
  const data = callbackQuery.data as string | undefined;
  const callbackId = callbackQuery.id as string;
  const telegramId = callbackQuery.from?.id;

  if (!data || !data.startsWith("mb_join:") || !telegramId) {
    await answerCallbackQuery(callbackId);
    return;
  }

  const encounterId = Number(data.split(":")[1]);
  const resultado = await unirseCola(encounterId, telegramId);

  if (!resultado.ok) {
    const mensajes: Record<string, string> = {
      cerrado: "Este mini jefe ya no acepta más gente.",
      no_registrado: "Primero registrate en la Mini App.",
      nivel_fuera_de_rango: "Tu nivel no encaja con este mini jefe.",
      ya_unido: "Ya estás en la cola.",
      cola_llena: "La cola ya está llena (5/5).",
      sin_energia: "Te quedaste sin energía. Se regenera 1 por hora — volvé en un rato.",
      error_interno: "Algo falló. Intenta de nuevo.",
    };
    await answerCallbackQuery(callbackId, mensajes[resultado.motivo] ?? "No se pudo unir.", true);
    return;
  }

  const chatId = callbackQuery.message?.chat?.id;
  const mensajeOriginalId = callbackQuery.message?.message_id;

  if (resultado.cerrado) {
    if (mensajeOriginalId) {
      await editMessageText(chatId, mensajeOriginalId, mensajeResultado(resultado.resultado));
    }
    await answerCallbackQuery(callbackId, "¡Cola completa! El combate va a comenzar.");
    await sendMessage(
      chatId,
      mensajeResultado(resultado.resultado),
      undefined,
      resultado.resultado?.topic_mini_boss_id
    );
  } else {
    if (mensajeOriginalId && callbackQuery.message?.text) {
      // Reconstruye el mensaje original con la lista de espera actualizada, manteniendo
      // el mismo intro/jefe/nivel (van antes del bloque de lista en el texto original).
      const textoOriginal: string = callbackQuery.message.text;
      const corte = textoOriginal.indexOf("En lista de espera");
      const encabezado = corte >= 0 ? textoOriginal.slice(0, corte).trimEnd() : textoOriginal;
      const nuevoTexto = `${encabezado}\n\n${bloqueListaEspera(resultado.lista_espera ?? [])}`;
      await editMessageText(chatId, mensajeOriginalId, nuevoTexto, {
        inline_keyboard: [[{ text: "⚔️ Machacar", callback_data: `mb_join:${encounterId}` }]],
      });
    }
    await answerCallbackQuery(callbackId, `Te uniste (${resultado.participantes}/5).`);
  }
}
