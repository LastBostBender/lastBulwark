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
  | 'porcentaje_stat'
  | 'puntos_porcentuales'
  | 'turnos';

export interface EfectoPoder {
  // 'permanente': el efecto está siempre activo (dentro y fuera de combate), no se "dispara".
  // 'on_golpe_fisico' / 'on_hechizo' / 'on_accion_ofensiva' (cualquiera de los dos anteriores):
  // usados por pasivos de zona probabilísticos.
  trigger: 'on_use' | 'on_turn_start' | 'on_hit_received' | 'permanente' | 'on_golpe_fisico' | 'on_hechizo' | 'on_accion_ofensiva';
  // 'aliado_objetivo': el aliado específico al que se dirigió la acción (ej. Escarchas).
  // 'aliado_aleatorio': un aliado cualquiera, sin relación con la acción (ej. Salpicadura ácida).
  // 'todos_aliados' / 'todos_enemigos' / 'todos_en_combate': efectos de área.
  target: 'enemigo' | 'self' | 'aliado_objetivo' | 'aliado_aleatorio' | 'todos_aliados' | 'todos_enemigos' | 'todos_en_combate';
  tipo: TipoEfecto;
  stat?: string; // requerido cuando tipo es buff/debuff sobre un stat puntual
  valor: number;
  unidad: Unidad;
  duracion_turnos: number | null; // null = dura lo que dure el combate (o permanente, si trigger lo es)
  reparto?: 'total_repartido' | 'por_turno'; // solo relevante si duracion_turnos > 0
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

/**
 * Calcula el delta absoluto de UN efecto, dado quién lo usa y contra quién.
 * No aplica nada por sí mismo — es una función pura.
 */
export function resolverEfecto(
  efecto: EfectoPoder,
  usuario: Combatiente,
  objetivo: Combatiente
): DeltaAplicado {
  const base = efecto.target === 'enemigo' ? objetivo : usuario;

  switch (efecto.unidad) {
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
      const statActual = efecto.stat ? base[efecto.stat] ?? 0 : 0;
      return {
        target: efecto.target,
        stat: efecto.stat ?? '',
        delta: Math.round((statActual * efecto.valor) / 100),
        duracion_turnos: efecto.duracion_turnos,
      };
    }

    case 'puntos_porcentuales':
      return {
        target: efecto.target,
        stat: efecto.stat ?? '',
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
 * Resuelve TODOS los efectos de un poder para un uso puntual (trigger 'on_use').
 * Los efectos con trigger distinto (on_turn_start, on_hit_received) se filtran
 * acá y quedan para que el loop de combate los evalúe en su propio momento.
 */
export function resolverPoder(
  parametros: { efectos: EfectoPoder[] },
  usuario: Combatiente,
  objetivo: Combatiente,
  trigger: EfectoPoder['trigger'] = 'on_use'
): DeltaAplicado[] {
  return (parametros.efectos ?? [])
    .filter((e) => e.trigger === trigger)
    .map((efecto) => resolverEfecto(efecto, usuario, objetivo));
}
