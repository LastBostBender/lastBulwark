// Resuelve los `parametros` (jsonb) de la tabla `powers` en deltas concretos
// aplicables a un combate. No asume ningún motor de combate: solo traduce
// "efecto declarado" -> "cambio numérico", para que quien construya el loop
// de turnos (mazmorra) solo tenga que aplicar los deltas que esto devuelve.
// Stats "sorteables" cuando un efecto dice stat: 'aleatorio' (ej. Resolver puzle).
// Deliberadamente NO incluye ps_actual/pm_actual/ps_max/pm_max (vida/maná no son
// "una estadística" en este contexto) ni suerte (excluida explícitamente por diseño).
export const STATS_ALEATORIOS = [
    'ataque_fisico',
    'ataque_magico',
    'defensa_fisica',
    'defensa_magica',
    'precision_stat',
    'escape',
    'velocidad',
    'critico',
];
function elegirStatAleatorio(excluir = []) {
    const disponibles = STATS_ALEATORIOS.filter((s) => !excluir.includes(s));
    return disponibles[Math.floor(Math.random() * disponibles.length)];
}
/**
 * Calcula el delta absoluto de UN efecto, dado quién lo usa y contra quién.
 * No aplica nada por sí mismo — es una función pura.
 */
export function resolverEfecto(efecto, usuario, objetivo, contexto = {}) {
    const base = efecto.target === 'enemigo' ? objetivo : usuario;
    const statResuelto = efecto.stat === 'aleatorio' ? elegirStatAleatorio(efecto.excluir_stats) : efecto.stat;
    switch (efecto.unidad) {
        case 'porcentaje_dano_recibido': {
            // Contraataque: solo tiene sentido si el turno produjo daño neto directo.
            // El loop de combate es responsable de no llamar a esto si `condicion`
            // ('dano_directo_en_turno') no se cumplió — acá solo se traduce el %.
            const danoBase = contexto.danoRecibidoEnTurno ?? 0;
            return {
                target: efecto.target,
                stat: 'ps_actual',
                delta: -Math.round((danoBase * efecto.valor) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        }
        case 'porcentaje_ataque_fisico':
            return {
                target: efecto.target,
                stat: 'ps_actual',
                delta: -Math.round((usuario.ataque_fisico * efecto.valor) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        case 'porcentaje_ataque_magico':
            return {
                target: efecto.target,
                stat: 'ps_actual',
                delta: -Math.round((usuario.ataque_magico * efecto.valor) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        case 'porcentaje_vida_maxima': {
            // A diferencia de 'porcentaje_vida_actual', el % se calcula siempre sobre
            // el tope (ps_max), no sobre cuánta vida le quede al objetivo en ese momento.
            const signo = efecto.tipo === 'curacion' ? 1 : -1;
            const psMax = base.ps_max ?? base.ps_actual;
            return {
                target: efecto.target,
                stat: 'ps_actual',
                delta: signo * Math.round((psMax * efecto.valor) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        }
        case 'porcentaje_vida_actual': {
            const totalPorcentaje = efecto.valor;
            const turnos = efecto.duracion_turnos ?? 1;
            const porcentajeAplicable = efecto.reparto === 'total_repartido' ? totalPorcentaje / turnos : totalPorcentaje;
            const signo = efecto.tipo === 'curacion' ? 1 : -1;
            return {
                target: efecto.target,
                stat: 'ps_actual',
                delta: signo * Math.round((base.ps_actual * porcentajeAplicable) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        }
        case 'porcentaje_stat': {
            const statActual = statResuelto ? base[statResuelto] ?? 0 : 0;
            return {
                target: efecto.target,
                stat: statResuelto ?? '',
                delta: Math.round((statActual * efecto.valor) / 100),
                duracion_turnos: efecto.duracion_turnos,
            };
        }
        case 'puntos_porcentuales':
            return {
                target: efecto.target,
                stat: statResuelto ?? '',
                delta: efecto.valor,
                duracion_turnos: efecto.duracion_turnos,
            };
        case 'turnos':
            return {
                target: efecto.target,
                stat: 'inhabilitado',
                delta: 0,
                duracion_turnos: efecto.duracion_turnos,
                turnosInhabilitado: efecto.valor,
            };
    }
}
/**
 * Resuelve TODOS los efectos de un poder para un uso puntual (trigger 'on_use'
 * por defecto, o el trigger que corresponda: on_debuff_recibido, on_escape_exitoso, etc.).
 * Los efectos con `condicion` cuyo requisito no se cumple en `contexto` se
 * omiten (ej. Contraataque no se resuelve si no hubo daño directo ese turno).
 */
export function resolverPoder(parametros, usuario, objetivo, trigger = 'on_use', contexto = {}) {
    return (parametros.efectos ?? [])
        .filter((e) => e.trigger === trigger)
        .filter((e) => {
        if (e.condicion === 'dano_directo_en_turno') {
            return (contexto.danoRecibidoEnTurno ?? 0) > 0;
        }
        return true;
    })
        .map((efecto) => resolverEfecto(efecto, usuario, objetivo, contexto));
}
