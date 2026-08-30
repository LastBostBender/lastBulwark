import { SUPABASE_URL, SB_HEADERS, SB_HEADERS_JSON } from "./config.ts";

export async function isRegistered(telegramId: number): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?telegram_id=eq.${telegramId}&select=telegram_id`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) {
    console.error("Error consultando profiles:", await res.text());
    return false;
  }
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

export async function isGroupAuthorized(chatId: number): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/authorized_groups?chat_id=eq.${chatId}&select=chat_id`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) return false;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

export async function sumarXP(telegramId: number, charCount: number) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/sumar_xp`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_telegram_id: telegramId, p_char_count: charCount }),
  });
  if (!res.ok) {
    console.error("Error al sumar XP:", await res.text());
    return null;
  }
  return res.json();
}

export async function registrarActividadGrupo(telegramId: number, chatId: number) {
  const url = `${SUPABASE_URL}/rest/v1/player_groups?on_conflict=telegram_id,chat_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...SB_HEADERS_JSON,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      telegram_id: telegramId,
      chat_id: chatId,
      last_activity: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    console.error("Error registrando actividad de grupo:", await res.text());
  }
}

export async function generarEncuentros(): Promise<Array<{ encounter_id: number; chat_id: number; nivel_jefe: number; topic_mini_boss_id: number | null; nombre_jefe: string | null; total_oleadas: number }>> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/mb_generar_encuentros`;
  const res = await fetch(url, { method: "POST", headers: SB_HEADERS_JSON, body: JSON.stringify({}) });
  if (!res.ok) {
    console.error("Error generando encuentros:", await res.text());
    return [];
  }
  return res.json();
}

export async function cerrarColasVencidas(): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/mb_cerrar_colas_vencidas`;
  const res = await fetch(url, { method: "POST", headers: SB_HEADERS_JSON, body: JSON.stringify({}) });
  if (!res.ok) {
    console.error("Error cerrando colas:", await res.text());
    return [];
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((row: any) => row?.mb_cerrar_colas_vencidas ?? row);
}

export async function unirseCola(encounterId: number, telegramId: number): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/mb_unirse_cola`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_encounter_id: encounterId, p_telegram_id: telegramId }),
  });
  if (!res.ok) {
    console.error("Error uniendo a cola:", await res.text());
    return { ok: false, motivo: "error_interno" };
  }
  return res.json();
}

export async function resolverCombatesFinalizados(): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/mb_resolver_combates_finalizados`;
  const res = await fetch(url, { method: "POST", headers: SB_HEADERS_JSON, body: JSON.stringify({}) });
  if (!res.ok) {
    console.error("Error resolviendo combates finalizados:", await res.text());
    return [];
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((row: any) => row?.mb_resolver_combates_finalizados ?? row);
}

export async function vincularTemaMiniJefes(chatId: number, threadId: number) {
  const url = `${SUPABASE_URL}/rest/v1/authorized_groups?chat_id=eq.${chatId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...SB_HEADERS_JSON, Prefer: "return=minimal" },
    body: JSON.stringify({ topic_mini_boss_id: threadId }),
  });
  if (!res.ok) {
    console.error("Error vinculando tema de mini jefes:", await res.text());
    return false;
  }
  return true;
}

export async function vincularTemaArena(chatId: number, threadId: number) {
  const url = `${SUPABASE_URL}/rest/v1/authorized_groups?chat_id=eq.${chatId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...SB_HEADERS_JSON, Prefer: "return=minimal" },
    body: JSON.stringify({ topic_arena_id: threadId }),
  });
  if (!res.ok) {
    console.error("Error vinculando tema de arenas:", await res.text());
    return false;
  }
  return true;
}

export async function obtenerTemaArena(chatId: number): Promise<number | null> {
  const url = `${SUPABASE_URL}/rest/v1/authorized_groups?chat_id=eq.${chatId}&select=topic_arena_id`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0]?.topic_arena_id ?? null : null;
}

export async function actualizarMensajeEncuentro(encounterId: number, mensajeId: number) {
  const url = `${SUPABASE_URL}/rest/v1/mini_boss_encounters?id=eq.${encounterId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...SB_HEADERS_JSON, Prefer: "return=minimal" },
    body: JSON.stringify({ mensaje_id: mensajeId }),
  });
  if (!res.ok) {
    console.error("Error guardando mensaje_id:", await res.text());
  }
}

export async function arenaCrearInvitacion(telegramId: number): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_crear_invitacion`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_telegram_id: telegramId }),
  });
  if (!res.ok) {
    console.error("Error creando invitación de arena:", await res.text());
    return { ok: false, motivo: "error_interno" };
  }
  return res.json();
}

// IMPORTANTE: esta validación ya NO recibe telegramId. La tarjeta pública del duelo se
// muestra sin gate de identidad — cualquiera puede pegar el código en el grupo
// (incluido el propio invitador, que es el caso normal). Toda la validación de
// identidad (propio código, registro, ya en combate) se hace en arenaAceptar,
// que corre cuando alguien hace clic en "Acepto".
export async function arenaValidarCodigo(codigo: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_validar_codigo`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_codigo: codigo }),
  });
  if (!res.ok) {
    console.error("Error validando código de arena:", await res.text());
    return { ok: false, motivo: "error_interno" };
  }
  return res.json();
}

export async function arenaAceptar(invitacionId: number, telegramId: number): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_aceptar`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({ p_invitacion_id: invitacionId, p_telegram_id: telegramId }),
  });
  if (!res.ok) {
    console.error("Error aceptando duelo de arena:", await res.text());
    return { ok: false, motivo: "error_interno" };
  }
  return res.json();
}

export async function arenaResolverVencidas(): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_resolver_vencidas`;
  const res = await fetch(url, { method: "POST", headers: SB_HEADERS_JSON, body: JSON.stringify({}) });
  if (!res.ok) {
    console.error("Error resolviendo invitaciones de arena vencidas:", await res.text());
    return [];
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((row: any) => row?.arena_resolver_vencidas ?? row);
}

export async function arenaResolverFinalizados(): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_resolver_finalizados`;
  const res = await fetch(url, { method: "POST", headers: SB_HEADERS_JSON, body: JSON.stringify({}) });
  if (!res.ok) {
    console.error("Error resolviendo duelos de arena finalizados:", await res.text());
    return [];
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((row: any) => row?.arena_resolver_finalizados ?? row);
}

export async function arenaGuardarMensajesDm(invitacionId: number, dmInvitadorMensajeId?: number | null, dmAceptanteMensajeId?: number | null) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/arena_guardar_dm_mensajes`;
  const res = await fetch(url, {
    method: "POST",
    headers: SB_HEADERS_JSON,
    body: JSON.stringify({
      p_invitacion_id: invitacionId,
      p_dm_invitador_mensaje_id: dmInvitadorMensajeId ?? null,
      p_dm_aceptante_mensaje_id: dmAceptanteMensajeId ?? null,
    }),
  });
  if (!res.ok) {
    console.error("Error guardando mensajes DM de arena:", await res.text());
  }
}

export async function arenaGuardarMensaje(invitacionId: number, chatId: number, mensajeId: number) {
  const url = `${SUPABASE_URL}/rest/v1/arena_invitaciones?id=eq.${invitacionId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...SB_HEADERS_JSON, Prefer: "return=minimal" },
    body: JSON.stringify({ chat_id: chatId, mensaje_id: mensajeId }),
  });
  if (!res.ok) {
    console.error("Error guardando chat_id/mensaje_id de invitación de arena:", await res.text());
  }
}
