// Resuelve los `parametros` (jsonb) de la tabla `powers` en deltas concretos
// aplicables a un combate. No asume ningún motor de combate: solo traduce
// "efecto declarado" -> "cambio numérico", para que quien construya el loop
// de turnos (mazmorra) solo tenga que aplicar los deltas que esto devuelve.

export type TipoEfecto = 'daño' | 'curacion' | 'buff' | 'debuff' | 'inhabilitar';
export type Unidad =
  | 'porcentaje_ataque_fisico'
  | 'porcentaje_ataque_magico'
  | 'porcentaje_vida_actual'
  | 'porcentaje_vida_maxima'
  | 'porcentaje_dano_recibido'
  | 'porcentaje_stat'
  | 'puntos_porcentuales'
  | 'turnos';

// Condiciones adicionales que el loop de combate debe verificar antes de
// aplicar el efecto, más allá del trigger. Se usan cuando "que se dispare"
// no basta — importa también QUÉ produjo el turno.
// 'dano_directo_en_turno': solo cuenta si lo esquivado/recibido fue daño neto
// de ESE turno (un golpe o hechizo con daño, con o sin debuff acompañante).
// No cuenta un debuff estadístico puro (sin daño) ni un daño por tics
// (veneno/maldición) — ese daño no es "de ese turno", es de turnos futuros.
export type Condicion = 'dano_directo_en_turno';

export interface EfectoPoder {
  // 'permanente': el efecto está siempre activo (dentro y fuera de combate), no se "dispara".
  // 'on_golpe_fisico' / 'on_hechizo' / 'on_accion_ofensiva' (cualquiera de los dos anteriores):
  // usados por pasivos de zona probabilísticos.
  // 'on_debuff_recibido': se recibió un debuff estadístico (no de PS/PM).
  // 'on_escape_exitoso': la mecánica de escape (parar/esquivar/bloquear) tuvo éxito este turno.
  trigger:
    | 'on_use'
    | 'on_turn_start'
    | 'on_hit_received'
    | 'permanente'
    | 'on_golpe_fisico'
    | 'on_hechizo'
    | 'on_accion_ofensiva'
    | 'on_debuff_recibido'
    | 'on_escape_exitoso';
  // 'aliado_objetivo': el aliado específico al que se dirigió la acción (ej. Escarchas).
  // 'aliado_aleatorio': un aliado cualquiera, sin relación con la acción (ej. Salpicadura ácida).
  // 'todos_aliados' / 'todos_enemigos' / 'todos_en_combate': efectos de área.
  target: 'enemigo' | 'self' | 'aliado_objetivo' | 'aliado_aleatorio' | 'todos_aliados' | 'todos_enemigos' | 'todos_en_combate';
  tipo: TipoEfecto;
  stat?: string; // requerido cuando tipo es buff/debuff sobre un stat puntual; 'aleatorio' = elegir uno al azar en tiempo de combate
  valor: number;
  unidad: Unidad;
  duracion_turnos: number | null; // null = dura lo que dure el combate (o permanente, si trigger lo es)
  reparto?: 'total_repartido' | 'por_turno'; // solo relevante si duracion_turnos > 0
  condicion?: Condicion; // filtro adicional que el loop de combate debe evaluar antes de aplicar
  excluir_stats?: string[]; // stats fuera del sorteo cuando stat es 'aleatorio' (ej. excluir 'suerte')
  // % de probabilidad de que el efecto se dispare al ocurrir su trigger.
  // Ausente = 100% (se aplica siempre que el trigger ocurra). Solo vive acá
  // porque `powers` (a diferencia de `zone_passives`) no tiene columna propia.
  probabilidad?: number;
}

export interface Combatiente {
  ps_actual: number;
  ataque_fisico: number;
  ataque_magico: number;
  [stat: string]: number;
}

// Un delta es "lo que hay que aplicarle a quién", sin decidir CUÁNDO
// (eso lo decide el loop de combate según trigger/duracion_turnos).
export interface DeltaAplicado {
  target: EfectoPoder['target'];
  stat: string; // 'ps_actual' para daño/curación, o el stat afectado en buff/debuff
  delta: number; // ya calculado en unidades absolutas, listo para sumar/restar
  duracion_turnos: number | null;
  turnosInhabilitado?: number;
}

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
] as const;

function elegirStatAleatorio(excluir: string[] = []): string {
  const disponibles = STATS_ALEATORIOS.filter((s) => !excluir.includes(s));
  return disponibles[Math.floor(Math.random() * disponibles.length)];
}

// Contexto del turno que algunos efectos necesitan para resolverse (ej. Contraataque
// necesita saber cuánto daño neto se esquivó). Todo opcional: los efectos que no lo
// usan simplemente lo ignoran.
export interface ContextoTurno {
  danoRecibidoEnTurno?: number; // daño NETO que produjo el turno (0 o ausente si no hubo)
}

/**
 * Calcula el delta absoluto de UN efecto, dado quién lo usa y contra quién.
 * No aplica nada por sí mismo — es una función pura.
 *
 * `aliado` es opcional: solo requerido cuando el efecto tiene target
 * 'aliado_objetivo' o 'aliado_aleatorio' (ej. Cauterizar aplicado a otro
 * jugador). Si no se provee, esos targets caen de vuelta a `usuario` para
 * no romper compatibilidad mientras el loop de mazmorra no exista.
 */
export function resolverEfecto(
  efecto: EfectoPoder,
  usuario: Combatiente,
  objetivo: Combatiente,
  contexto: ContextoTurno = {},
  aliado?: Combatiente
): DeltaAplicado {
  const base =
    efecto.target === 'enemigo'
      ? objetivo
      : efecto.target === 'aliado_objetivo' || efecto.target === 'aliado_aleatorio'
        ? (aliado ?? usuario)
        : usuario;
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
      const psMax = (base as any).ps_max ?? base.ps_actual;
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
      const porcentajeAplicable =
        efecto.reparto === 'total_repartido' ? totalPorcentaje / turnos : totalPorcentaje;
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
export function resolverPoder(
  parametros: { efectos: EfectoPoder[] },
  usuario: Combatiente,
  objetivo: Combatiente,
  trigger: EfectoPoder['trigger'] = 'on_use',
  contexto: ContextoTurno = {},
  aliado?: Combatiente
): DeltaAplicado[] {
  return (parametros.efectos ?? [])
    .filter((e) => e.trigger === trigger)
    .filter((e) => {
      if (e.condicion === 'dano_directo_en_turno') {
        return (contexto.danoRecibidoEnTurno ?? 0) > 0;
      }
      return true;
    })
    .map((efecto) => resolverEfecto(efecto, usuario, objetivo, contexto, aliado));
}
