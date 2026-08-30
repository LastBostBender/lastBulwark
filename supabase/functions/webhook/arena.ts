import { MINI_APP_URL } from "./config.ts";
import { sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery } from "./telegram.ts";
import {
  isRegistered,
  arenaCrearInvitacion,
  arenaValidarCodigo,
  arenaAceptar,
  arenaResolverVencidas,
  arenaResolverFinalizados,
  arenaGuardarMensaje,
  arenaGuardarMensajesDm,
  obtenerTemaArena,
} from "./db.ts";

const RE_CODIGO_DUELO = /\/duelo_([a-f0-9]{6})\b/i;

const INTROS_RETO = [
  "🐓 Pelea de gallos declarada. Sin plumas, pero con la misma dignidad en juego.",
  "🔥 Alguien quiere farmear aura a tu costa. La pregunta es si se lo vas a permitir.",
  "💀 Reto viral pendiente. Todavía no tiene hashtag, pero lo va a tener.",
  "⚔️ Se abrió la arena. Nadie preguntó, a nadie le importa, sucede igual.",
];

function fichaJugador(nombre: string, clase: string | null | undefined, nivel: number): string {
  return `${nombre} • ${clase ?? "Sin clase"} • Nvl ${nivel}`;
}

function botonAbrirMiniApp(sesionCombateId: number) {
  return {
    inline_keyboard: [[
      { text: "⚔️ Abrir Mini App", web_app: { url: `${MINI_APP_URL}?duelo=${sesionCombateId}` } },
    ]],
  };
}

// ---------- Flujo PRIVADO (DM con el bot): código reenviable ----------

function mensajeInvitacionCreada(
  codigo: string,
  nombreInvitador: string,
  claseInvitador: string | null | undefined,
  nivelInvitador: number
): string {
  const intro = INTROS_RETO[Math.floor(Math.random() * INTROS_RETO.length)];
  return (
    `${intro}\n\n` +
    `${fichaJugador(nombreInvitador, claseInvitador, nivelInvitador)}\n\n` +
    `Reenvía este mensaje a quien quieras retar:\n\n` +
    `/duelo_${codigo}\n\n` +
    `Vence en 3 minutos. Si nadie lo acepta, un enemigo aleatorio de tu nivel aparecerá a pelear en tu lugar.`
  );
}

// Tarjeta privada 1-a-1: solo la ve quien recibió el código reenviado, así que el
// botón "Paso" no representa riesgo (nadie más puede cancelar el duelo de otro).
function mensajeValidacionPrivada(
  nombreInvitador: string,
  claseInvitador: string | null | undefined,
  nivelInvitador: number
) {
  return {
    text:
      `${fichaJugador(nombreInvitador, claseInvitador, nivelInvitador)} te desafía a un duelo de arena.\n\n` +
      `¿Entras a la arena o te retiras?`,
    replyMarkup: {
      inline_keyboard: [[
        { text: "⚔️ Acepto", callback_data: `arena_ok` },
        { text: "🏳️ Paso", callback_data: `arena_no` },
      ]],
    },
  };
}

const MOTIVOS_INVALIDO: Record<string, string> = {
  codigo_invalido: "Ese código no existe. Revisa que lo hayas copiado bien.",
  ya_no_disponible: "Ese duelo ya no está disponible: se aceptó, se canceló o venció.",
  invitador_ya_no_disponible: "Quien retó ya no está disponible (entró a otro combate).",
};

// Solo se dispara si chat.type === "private" (gate en index.ts): el código reenviable
// es un flujo 1-a-1, nunca debe reaccionar en un grupo.
export async function handleDueloForward(msg: any) {
  const match = RE_CODIGO_DUELO.exec(msg.text as string);
  if (!match) return;

  const codigo = match[1];
  const chatId = msg.chat.id;

  const resultado = await arenaValidarCodigo(codigo);
  if (!resultado.ok) {
    await sendMessage(chatId, MOTIVOS_INVALIDO[resultado.motivo] ?? "No se pudo validar ese código.");
    return;
  }

  const { text, replyMarkup } = mensajeValidacionPrivada(
    resultado.nombre_invitador,
    resultado.clase_invitador,
    resultado.nivel_invitador
  );

  const enviado = await sendMessage(chatId, text, {
    inline_keyboard: replyMarkup.inline_keyboard.map((fila) =>
      fila.map((b) => ({ ...b, callback_data: `${b.callback_data}:${resultado.invitacion_id}` }))
    ),
  });

  if (enviado?.result?.message_id) {
    await arenaGuardarMensaje(resultado.invitacion_id, chatId, enviado.result.message_id);
  }
}

// ---------- Flujo PÚBLICO (grupo, tema vinculado por /tema_arenas) ----------

// Tarjeta pública: un solo botón. Nadie más que el que hace clic en "Acepto" puede
// afectar el duelo — no hay "Paso" para evitar que cualquiera del grupo lo cancele.
function mensajeInvitacionPublica(
  nombreInvitador: string,
  claseInvitador: string | null | undefined,
  nivelInvitador: number
): string {
  const intro = INTROS_RETO[Math.floor(Math.random() * INTROS_RETO.length)];
  return (
    `${intro}\n\n` +
    `${fichaJugador(nombreInvitador, claseInvitador, nivelInvitador)} abrió un duelo en la arena.\n\n` +
    `¿Quién entra a pelear?`
  );
}

async function crearDueloPublico(chatId: number, telegramId: number, topicArenaId: number) {
  if (!(await isRegistered(telegramId))) {
    await sendMessage(chatId, "Primero regístrate en la Mini App antes de retar a alguien.", undefined, topicArenaId);
    return;
  }

  const resultado = await arenaCrearInvitacion(telegramId);
  if (!resultado.ok) {
    const motivos: Record<string, string> = {
      ya_en_combate: "Estás en combate. Termina eso antes de abrir un duelo.",
      invitacion_pendiente: "Ya tienes un duelo pendiente. Esperá a que se resuelva antes de abrir otro.",
      error_generando_codigo: "Algo falló generando el duelo. Inténtalo de nuevo.",
    };
    await sendMessage(chatId, motivos[resultado.motivo] ?? "No se pudo crear el duelo.", undefined, topicArenaId);
    return;
  }

  const texto = mensajeInvitacionPublica(resultado.nombre_invitador, resultado.clase_invitador, resultado.nivel_invitador);
  const enviado = await sendMessage(
    chatId,
    texto,
    { inline_keyboard: [[{ text: "⚔️ Echarle ganas", callback_data: `arena_ok:${resultado.invitacion_id}` }]] },
    topicArenaId
  );

  if (enviado?.result?.message_id) {
    await arenaGuardarMensaje(resultado.invitacion_id, chatId, enviado.result.message_id);
  }
}

// /duelo (sin código): comportamiento distinto según dónde se escriba.
// - En el tema vinculado por /tema_arenas (grupo): tarjeta pública, un solo botón.
// - En chat privado con el bot: código reenviable de siempre.
// - En cualquier otro lugar (grupo sin tema vinculado, u otro tema): silencio total.
export async function handleDueloComando(msg: any) {
  const telegramId = msg.from?.id;
  if (!telegramId) return;

  const chatId = msg.chat.id;
  const esGrupo = msg.chat.type === "group" || msg.chat.type === "supergroup";

  if (esGrupo) {
    const topicArenaId = await obtenerTemaArena(chatId);
    if (!topicArenaId || msg.message_thread_id !== topicArenaId) return;
    await crearDueloPublico(chatId, telegramId, topicArenaId);
    return;
  }

  if (!(await isRegistered(telegramId))) {
    await sendMessage(telegramId, "Primero regístrate en la Mini App antes de retar a alguien.");
    return;
  }

  const resultado = await arenaCrearInvitacion(telegramId);
  if (!resultado.ok) {
    const motivos: Record<string, string> = {
      ya_en_combate: "Estás en combate. Termina eso antes de abrir un duelo.",
      invitacion_pendiente: "Ya tienes un código de duelo esperando a que alguien lo acepte.",
      error_generando_codigo: "Algo falló generando el código. Inténtalo de nuevo.",
    };
    await sendMessage(telegramId, motivos[resultado.motivo] ?? "No se pudo crear el duelo.");
    return;
  }

  await sendMessage(
    telegramId,
    mensajeInvitacionCreada(resultado.codigo, resultado.nombre_invitador, resultado.clase_invitador, resultado.nivel_invitador)
  );
}

// ---------- Aceptar / rechazar (común a ambos flujos) ----------

function mensajeDueloAceptado(r: any): string {
  const invitador = fichaJugador(r.nombre_invitador, r.clase_invitador, r.nivel_invitador);
  const aceptante = fichaJugador(r.nombre_aceptante, r.clase_aceptante, r.nivel_aceptante);
  return `⚔️ ${invitador} vs. ${aceptante}\n\n¡A pelear!`;
}

export async function handleArenaCallback(callbackQuery: any) {
  const data = callbackQuery.data as string | undefined;
  const callbackId = callbackQuery.id as string;
  const telegramId = callbackQuery.from?.id;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  if (!data || !telegramId) {
    await answerCallbackQuery(callbackId);
    return;
  }

  if (data.startsWith("arena_no:")) {
    await answerCallbackQuery(callbackId, "Reto rechazado.");
    if (chatId && messageId) {
      await editMessageText(chatId, messageId, "Reto rechazado. 67 lo anota, pero no lo va a mencionar de nuevo.");
    }
    return;
  }

  if (data.startsWith("arena_ok:")) {
    const invitacionId = Number(data.split(":")[1]);
    // Toda la validación de identidad (propio código, registro, ya en combate) vive
    // acá, en el momento del clic — no al postear la tarjeta (pública o privada).
    const resultado = await arenaAceptar(invitacionId, telegramId);

    if (!resultado.ok) {
      const motivos: Record<string, string> = {
        ya_resuelta: "Este duelo ya no está disponible.",
        ya_no_disponible: "Uno de los dos ya no está libre para pelear.",
        es_tu_propio_codigo: "No puedes aceptar tu propio reto. Busca a alguien más.",
        no_registrado: "Primero regístrate en la Mini App antes de entrar a la arena.",
        ya_en_combate: "Ya estás en combate. Termina eso primero.",
      };
      await answerCallbackQuery(callbackId, motivos[resultado.motivo] ?? "No se pudo aceptar.", true);
      return;
    }

    await answerCallbackQuery(callbackId, "¡Duelo aceptado!");
    // La tarjeta pública queda como constancia (quién retó, quién entró), pero sin
    // botón — el botón real vive en el DM de cada jugador, no en el mensaje público.
    if (chatId && messageId) {
      await editMessageText(chatId, messageId, mensajeDueloAceptado(resultado));
    }

    // DM a AMBOS jugadores con su propio botón "Abrir Mini App". Se guarda el
    // message_id de cada uno para poder quitarles el botón cuando el combate termine.
    let dmInvitadorId: number | undefined;
    let dmAceptanteId: number | undefined;

    if (resultado.invitador_telegram_id) {
      const fichaAceptante = fichaJugador(resultado.nombre_aceptante, resultado.clase_aceptante, resultado.nivel_aceptante);
      const enviado = await sendMessage(
        resultado.invitador_telegram_id,
        `⚔️ ${fichaAceptante} aceptó tu duelo. Ya arrancó — te toca jugar.`,
        botonAbrirMiniApp(resultado.sesion_combate_id)
      );
      dmInvitadorId = enviado?.result?.message_id;
    }

    {
      const fichaInvitador = fichaJugador(resultado.nombre_invitador, resultado.clase_invitador, resultado.nivel_invitador);
      const enviado = await sendMessage(
        telegramId,
        `⚔️ Aceptaste el duelo contra ${fichaInvitador}. ¡A pelear!`,
        botonAbrirMiniApp(resultado.sesion_combate_id)
      );
      dmAceptanteId = enviado?.result?.message_id;
    }

    if (dmInvitadorId || dmAceptanteId) {
      await arenaGuardarMensajesDm(invitacionId, dmInvitadorId, dmAceptanteId);
    }
    return;
  }

  await answerCallbackQuery(callbackId);
}

// ---------- Tick de cron: vencidas + finalizadas ----------

const MENSAJES_MOB_FALLBACK = [
  "Nadie se animó a tiempo. Un rival apareció solo, con toda la mala actitud del mundo.",
  "El tiempo pasó y nadie aceptó. 67 improvisó un oponente y no se hace responsable del resultado.",
];

// Paso 3: el aviso de resultado ahora muestra las recompensas reales que ya paga
// arena_resolver_finalizados (Elo, XP, Aura) — antes solo decía quién ganó.
// Arbol prolijo: la última línea de cada bloque usa └─, las anteriores ├─.
// Se omiten líneas en 0 (ej. Aura si aura_ganada es 0) para no ensuciar el árbol.
function lineaArbol(items: string[]): string {
  return items.map((item, i) => (i === items.length - 1 ? '└─ ' : '├─ ') + item).join('\n');
}

function mensajeResultadoDuelo(r: any): string {
  if (!r.ganador_telegram_id) {
    return `💀 ${r.ganador_nombre} liquidó a ${r.perdedor_nombre}. La arena no perdona.`;
  }

  if (r.es_mob) {
    return `🏆 ${r.ganador_nombre} se impuso ante ${r.perdedor_nombre}. El mob de reemplazo no fue rival.`;
  }

  // elo_delta es siempre >= 0 (formula estandar 32*(1-esperado_ganador), esperado en (0,1)):
  // el ganador siempre suma, el perdedor siempre resta la misma magnitud.
  const itemsGanador = [`🏁 +${r.elo_delta} Elo`];
  if (r.xp_ganador) itemsGanador.push(`✨️ +${r.xp_ganador} XP`);
  if (r.aura_ganada) itemsGanador.push(`🎟 +${r.aura_ganada} Aura`);

  const itemsPerdedor = [`🏁 -${r.elo_delta} Elo`];
  if (r.xp_perdedor) itemsPerdedor.push(`✨️ +${r.xp_perdedor} XP`);

  const lineas = [
    `🏆 ${r.ganador_nombre} venció a ${r.perdedor_nombre} en un duelo de arena.`,
    ``,
    `<b>${r.ganador_nombre}:</b>`,
    lineaArbol(itemsGanador),
    ``,
    `<b>${r.perdedor_nombre}:</b>`,
    lineaArbol(itemsPerdedor),
  ];
  return lineas.join('\n');
}

export async function tickArena() {
  const vencidas = await arenaResolverVencidas();
  for (const r of vencidas) {
    if (r.estado === "mob_spawneado") {
      const intro = MENSAJES_MOB_FALLBACK[Math.floor(Math.random() * MENSAJES_MOB_FALLBACK.length)];
      const texto = `${intro}\n\n${r.nombre_invitador} vs. ${r.nombre_mob} (nivel ${r.nivel_mob}).`;

      if (r.chat_id && r.mensaje_id) {
        await editMessageText(r.chat_id, r.mensaje_id, texto);
      } else if (r.chat_id) {
        await sendMessage(r.chat_id, texto);
      }

      if (r.invitador_telegram_id) {
        const enviado = await sendMessage(
          r.invitador_telegram_id,
          `⏰ Nadie aceptó tu duelo a tiempo. Te toca contra ${r.nombre_mob} (nivel ${r.nivel_mob}) en su lugar.`,
          botonAbrirMiniApp(r.sesion_id)
        );
        if (enviado?.result?.message_id) {
          await arenaGuardarMensajesDm(r.invitacion_id, enviado.result.message_id, null);
        }
      }
    } else if (r.estado === "cancelada_sin_rival") {
      if (r.chat_id && r.mensaje_id) {
        await editMessageText(r.chat_id, r.mensaje_id, "El duelo se canceló: quien retaba ya no está disponible.");
      }
    }
  }

  const finalizados = await arenaResolverFinalizados();
  for (const r of finalizados) {
    if (r.chat_id) {
      await sendMessage(r.chat_id, mensajeResultadoDuelo(r), undefined, r.topic_arena_id ?? undefined);
    }

    // El botón "Abrir Mini App" de cada DM ya cumplió su función — se quita, pero
    // el mensaje (quién retó, quién entró) queda como estaba.
    if (r.invitador_telegram_id && r.dm_invitador_mensaje_id) {
      await editMessageReplyMarkup(r.invitador_telegram_id, r.dm_invitador_mensaje_id);
    }
    if (r.aceptante_telegram_id && r.dm_aceptante_mensaje_id) {
      await editMessageReplyMarkup(r.aceptante_telegram_id, r.dm_aceptante_mensaje_id);
    }
  }
}
