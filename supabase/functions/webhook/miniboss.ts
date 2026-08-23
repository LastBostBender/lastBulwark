import { sendMessage, answerCallbackQuery } from "./telegram.ts";
import { generarEncuentros, cerrarColasVencidas, unirseCola, actualizarMensajeEncuentro, resolverCombatesFinalizados } from "./db.ts";

function mensajeSpawn(nivelJefe: number, encounterId: number) {
  return {
    text: `⚔️ Un mini jefe de nivel ${nivelJefe} ha aparecido. Únete antes de que se vaya (máx. 5, se cierra en 5 minutos o al llenarse).`,
    replyMarkup: {
      inline_keyboard: [[{ text: "⚔️ Unirme", callback_data: `mb_join:${encounterId}` }]],
    },
  };
}

function mensajeResultado(resultado: any): string {
  const estado = resultado?.estado;
  const nivelJefe = resultado?.nivel_jefe;

  if (estado === "cancelado") {
    const participantes = resultado?.participantes ?? 0;
    if (participantes === 0) {
      return `El mini jefe de nivel ${nivelJefe} esperó 5 minutos y ni un alma se apareció. Se fue ofendido.`;
    }
    return `¿${participantes} de 5 nada más? El mini jefe de nivel ${nivelJefe} los miró, calculó sus posibilidades y se fue caminando. Consigan refuerzos.`;
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
    const { text, replyMarkup } = mensajeSpawn(encuentro.nivel_jefe, encuentro.encounter_id);
    const enviado = await sendMessage(encuentro.chat_id, text, replyMarkup, encuentro.topic_mini_boss_id);
    if (enviado?.result?.message_id) {
      await actualizarMensajeEncuentro(encuentro.encounter_id, enviado.result.message_id);
    }
  }

  const resueltos = await cerrarColasVencidas();
  for (const resultado of resueltos) {
    if (resultado?.chat_id) {
      await sendMessage(resultado.chat_id, mensajeResultado(resultado), undefined, resultado.topic_mini_boss_id);
    }
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
      no_registrado: "Primero regístrate en la Mini App.",
      nivel_fuera_de_rango: "Tu nivel no encaja con este mini jefe.",
      ya_unido: "Ya estás en la cola.",
      cola_llena: "La cola ya está llena (5/5).",
      sin_energia: "Te quedaste sin energía. Se regenera 1 por hora — volvé en un rato.",
      error_interno: "Algo falló. Intenta de nuevo.",
    };
    await answerCallbackQuery(callbackId, mensajes[resultado.motivo] ?? "No se pudo unir.", true);
    return;
  }

  if (resultado.cerrado) {
    await answerCallbackQuery(callbackId, "¡Cola completa! El combate va a comenzar.");
    await sendMessage(
      callbackQuery.message?.chat?.id,
      mensajeResultado(resultado.resultado),
      undefined,
      resultado.resultado?.topic_mini_boss_id
    );
  } else {
    await answerCallbackQuery(callbackId, `Te uniste (${resultado.participantes}/5).`);
  }
}
