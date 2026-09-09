import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { getTheme } from '../utils/themes';

interface CombatViewProps {
  perfil: {
    telegram_id: number;
    estado: string;
    sesion_combate_id: number | null;
    zona: string;
    nombre_personaje: string;
  };
  onProfileChange?: (perfil: any) => void;
  // El backend limpia perfil.estado/sesion_combate_id apenas termina el combate
  // (combat_sincronizar_perfil), pero el jugador todavia tiene que ver la
  // pantalla de resultado. Este callback le avisa a Profile.tsx que siga
  // montando CombatView aunque perfil.estado ya haya vuelto a 'en_descanso',
  // hasta que el propio jugador cierre el resultado.
  onResultadoVisibleChange?: (visible: boolean) => void;
}

interface Sesion {
  id: number;
  tipo: 'mazmorra' | 'mini_boss' | 'arena';
  estado: 'en_curso' | 'victoria' | 'derrota' | 'cancelado';
  turno_actual: number;
  ronda: number;
  oleada_actual: number;
  oleadas: Array<{ numero: number; enemigos?: number; jefe?: boolean }>;
  votacion_huida: boolean;
}

interface Combatiente {
  id: number;
  orden: number | null;
  tipo: 'jugador' | 'enemigo';
  bando: number;
  telegram_id: number | null;
  nombre: string;
  nivel: number;
  vivo: boolean;
  ps_actual: number;
  ps_max: number;
  pm_actual: number;
  pm_max: number;
  escape: number;
  cooldowns: Record<string, number>;
  dano_realizado: number;
  dano_recibido: number;
}

interface LogMetadata {
  cat?: 'dano' | 'curacion' | 'buff' | 'debuff' | 'amenaza' | 'expira';
  valor?: number;
  stat?: string;
  pct?: boolean;
  escala_por?: string | null;
  dot_hot?: boolean;
}

interface LogEntry {
  id: number;
  turno: number;
  descripcion: string;
  creado_en: string;
  padre_id: number | null;
  combatiente_id: number | null;
  es_critico: boolean;
  metadata: LogMetadata | null;
}

interface Grupo {
  raiz: LogEntry;
  ramas: LogEntry[];
}

// Ícono por stat (para buffs/debuffs de característica) y por categoría
// (daño físico/mágico, sanación, amenaza/sexapil, expiración de efecto).
// Mismo set que ProfileView.tsx usa en la ficha de personaje, para que un
// jugador reconozca el ícono de "Escape" o "Crítico" en los dos lugares.
const ICONO_STAT: Record<string, string> = {
  ataque_fisico: 'emoji-angry',
  ataque_magico: 'magic',
  defensa_fisica: 'shield',
  defensa_magica: 'shield-exclamation',
  precision_stat: 'bullseye',
  escape: 'leaf',
  velocidad: 'speedometer',
  critico: 'arrow-through-heart',
  suerte: 'dice-4',
};

const ICONO_CURACION = 'bandaid';
const ICONO_EXPIRA = 'hourglass-split';

const COLOR_POSITIVO = '#4caf50';
const COLOR_NEGATIVO = '#e05353';

function iconoDano(escalaPor?: string | null) {
  return escalaPor === 'ataque_fisico' ? 'hammer' : 'magic';
}

// Ícono+color+valor de UNA entrada de log con metadata (daño, sanación,
// buff, debuff, amenaza o expiración). Se usa tanto para la rama principal
// fusionada a la raíz como para el resto de las ramas de un grupo.
function ChipEfecto({ m, esCritico = false }: { m: LogMetadata; esCritico?: boolean }) {
  if (!m.cat) return null;

  // Ícono de crítico ADELANTE del valor (no reemplaza el ícono de tipo de
  // daño/curación, que sigue yendo después del número como siempre).
  const iconoCritico = esCritico ? (
    <i className="bi bi-arrow-through-heart" style={{ color: '#e63950' }} />
  ) : null;

  if (m.cat === 'dano') {
  return (
    <span style={{ color: COLOR_NEGATIVO, whiteSpace: 'nowrap' }}>
      {iconoCritico}{iconoCritico && ' '}
      <strong>-{m.valor}</strong>{' '}
      {m.dot_hot && <i className="bi bi-heart-pulse-fill" style={{ color: '#888' }} />}
      {m.dot_hot && ' '}
      <i className={`bi bi-${iconoDano(m.escala_por)}`} />
    </span>
  );
}

  if (m.cat === 'curacion') {
    return (
      <span style={{ color: COLOR_POSITIVO, whiteSpace: 'nowrap' }}>
        {iconoCritico}{iconoCritico && ' '}
        <strong>+{m.valor}</strong>{' '}
        <i className={`bi bi-${ICONO_CURACION}`} />
      </span>
    );
  }

  if (m.cat === 'buff' || m.cat === 'debuff') {
    const esBuff = m.cat === 'buff';
    const icono = (m.stat && ICONO_STAT[m.stat]) || 'arrow-up-circle';
    const signo = esBuff ? '+' : '-';

    return (
      <span
        style={{
          color: esBuff ? COLOR_POSITIVO : COLOR_NEGATIVO,
          whiteSpace: 'nowrap',
        }}
      >
        <strong>
          {signo}
          {m.valor}
          {m.pct ? '%' : ''}
        </strong>{' '}
        <i className={`bi bi-${icono}`} />
      </span>
    );
  }

  if (m.cat === 'amenaza') {
    // Oculto por ahora: el mecanismo de sexapil/amenaza se va a reusar para
    // otra cosa más adelante, no tiene sentido mostrarlo en el log hoy.
    return null;
  }

  if (m.cat === 'expira') {
    // No mostramos texto del tipo "expiró".
    // El backend ya resuelve el signo:
    // quitar un buff  -> negativo
    // quitar un debuff -> positivo
    const icono = (m.stat && ICONO_STAT[m.stat]) || ICONO_EXPIRA;
    const valor = m.valor ?? 0;
    const esPositivo = valor >= 0;

    return (
      <span
        style={{
          color: esPositivo ? COLOR_POSITIVO : COLOR_NEGATIVO,
          whiteSpace: 'nowrap',
        }}
      >
        <strong>
          {esPositivo ? '+' : ''}
          {valor}
          {m.pct ? '%' : ''}
        </strong>{' '}
        <i className={`bi bi-${icono}`} />
      </span>
    );
  }

  return null;
}

function renderDescripcionLog(
  descripcion: string,
  esCritico: boolean,
) {
  if (!esCritico) return descripcion;

  const match = descripcion.match(/\d+/);

  if (!match || match.index === undefined) {
    return descripcion;
  }

  const antes = descripcion.slice(0, match.index);
  const numero = match[0];
  const despues = descripcion.slice(
    match.index + numero.length,
  );

  return (
    <>
      {antes}
      <i
        className="bi bi-arrow-through-heart"
        style={{ color: '#e63950' }}
      />{' '}
      <strong>{numero}</strong>
      {despues}
    </>
  );
}

const DEMORA_JUGADOR_MIN = 750;
const DEMORA_JUGADOR_MAX = 1000;
const DEMORA_ENEMIGO = 3000;
const DEMORA_DEFECTO = 1000;

interface Poder {
  id: number;
  nombre: string;
  icono: string;
  costo_pm_base: number | null;
  parametros: {
    efectos: Array<{
      trigger: string;
      target: string;
    }>;
  };
}

// Solo los campos que necesita la botonera de inventario dentro del combate.
// Consumibles de combate: tipo === 'usable' && contexto_uso === 'combate'
// en la respuesta de inv_obtener.
interface ItemUsable {
  character_item_id: number;
  nombre: string;
  icono: string;
  tipo: string;
  contexto_uso: 'descanso' | 'combate';
  cantidad: number;
}

// Réplica en el frontend de combat_costo_mana (SQL): mismo costo base +
// franjas por nivel. Es solo para mostrar el número antes de tirar el
// poder — el backend sigue siendo la fuente de verdad.
function costoManaPoder(
  costoBase: number | null,
  nivel: number,
): number | null {
  if (costoBase === null || costoBase === undefined) {
    return null;
  }

  const franja =
    nivel <= 9
      ? 0
      : nivel <= 19
        ? 1
        : nivel <= 29
          ? 3
          : nivel <= 39
            ? 5
            : nivel <= 49
              ? 9
              : 14;

  return costoBase + franja;
}

type Categoria =
  | 'enemigo'
  | 'aliado'
  | 'variable'
  | 'area_enemigos'
  | 'area_aliados'
  | 'area_todos'
  | null;

function categoriaObjetivo(
  poder: Poder,
): Categoria {
  const onUse = (
    poder.parametros?.efectos ?? []
  ).filter(
    (e) => e.trigger === 'on_use',
  );

  const targets = new Set(
    onUse.map((e) => e.target),
  );

  if (targets.has('todos_en_combate')) {
    return 'area_todos';
  }

  if (targets.has('todos_enemigos')) {
    return 'area_enemigos';
  }

  if (targets.has('todos_aliados')) {
    return 'area_aliados';
  }

  if (targets.has('variable')) {
    return 'variable';
  }

  if (targets.has('enemigo')) {
    return 'enemigo';
  }

  if (targets.has('aliado_objetivo')) {
    return 'aliado';
  }

  return null;
}

const MiniBarra = ({
  actual,
  max,
  color,
}: {
  actual: number;
  max: number;
  color: string;
}) => (
  <div
    className="progress-custom"
    style={{ height: '4px' }}
  >
    <div
      className="bar"
      style={{
        width: `${
          max > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  (actual / max) * 100,
                ),
              )
            : 0
        }%`,
        backgroundColor: color,
      }}
    />
  </div>
);

// Grid de la banda.
// Cada combatiente ocupa 1/n del ancho de su propia banda.
function gridBanda(
  n: number,
): { gridTemplateColumns: string } {
  return {
    gridTemplateColumns: `repeat(${Math.max(
      1,
      n,
    )}, 1fr)`,
  };
}

const TarjetaCombatiente = ({
  c,
  colorBorde,
}: {
  c: Combatiente;
  colorBorde: string;
}) => (
  <div
    style={{
      border: `1px solid ${colorBorde}`,
      borderRadius: '6px',
      padding: '2px 5px',
      fontSize: '0.62rem',
      lineHeight: 1.1,
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
      minWidth: 0,
    }}
  >
    <span
      style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {c.nombre}
    </span>

    <MiniBarra
      actual={c.ps_actual}
      max={c.ps_max}
      color="#c0392b"
    />

    <MiniBarra
      actual={c.pm_actual}
      max={c.pm_max}
      color="#2980b9"
    />
  </div>
);

const BandaCombate = ({
  combatientes,
  colorBorde,
}: {
  combatientes: Combatiente[];
  colorBorde: string;
}) => {
  if (combatientes.length === 0) {
    return null;
  }

  return (
    <div className="px-2 py-1">
      <div
        style={{
          display: 'grid',
          gap: '4px',
          width: '100%',
          ...gridBanda(combatientes.length),
        }}
      >
        {combatientes.map((c) => (
          <TarjetaCombatiente
            key={c.id}
            c={c}
            colorBorde={colorBorde}
          />
        ))}
      </div>
    </div>
  );
};

export const CombatView = ({
  perfil,
  onResultadoVisibleChange,
}: CombatViewProps) => {
  const theme = getTheme(perfil.zona);

  // Congelado: una vez que hay un id real, se queda con ese aunque el backend
  // limpie perfil.sesion_combate_id al terminar el combate.
  const sesionIdRef =
    useRef<number | null>(null);

  if (perfil.sesion_combate_id != null) {
    sesionIdRef.current =
      perfil.sesion_combate_id;
  }

  const sesionId =
    sesionIdRef.current;

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-display',
      theme.fontDisplay,
    );

    document.documentElement.style.setProperty(
      '--font-body',
      theme.fontBody,
    );
  }, [
    theme.fontDisplay,
    theme.fontBody,
  ]);

  // --- Estado: en_cola ---
  const [
    colaEncounterId,
    setColaEncounterId,
  ] = useState<number | null>(null);

  const [
    colaNivelJefe,
    setColaNivelJefe,
  ] = useState<number | null>(null);

  const [
    colaCount,
    setColaCount,
  ] = useState(0);

  // --- Estado: en_combate ---
  const [
    sesion,
    setSesion,
  ] = useState<Sesion | null>(null);

  const [
    combatientes,
    setCombatientes,
  ] = useState<Combatiente[]>([]);

  const [
    log,
    setLog,
  ] = useState<LogEntry[]>([]);

  const [
    poderes,
    setPoderes,
  ] = useState<Poder[]>([]);

  const [
    cargando,
    setCargando,
  ] = useState(true);

  const [
    errorCarga,
    setErrorCarga,
  ] = useState<string | null>(null);

  const [
    enviando,
    setEnviando,
  ] = useState(false);

  const [
    bandoVariable,
    setBandoVariable,
  ] = useState<
    'aliado' | 'enemigo' | null
  >(null);

  const [
    poderSeleccionado,
    setPoderSeleccionado,
  ] = useState<Poder | null>(
    null,
  );

  const [
    accionArma,
    setAccionArma,
  ] = useState(false);

  const [
    mostrarInventario,
    setMostrarInventario,
  ] = useState(false);

  const [
    itemsUsables,
    setItemsUsables,
  ] = useState<ItemUsable[]>([]);

  const [
    cargandoItems,
    setCargandoItems,
  ] = useState(false);

  const logRef =
    useRef<HTMLDivElement>(null);

  // --- Revelación escalonada del log ---
  const [
    gruposVisibles,
    setGruposVisibles,
  ] = useState<Grupo[]>([]);

  const colaGruposRef =
    useRef<Grupo[]>([]);

  const procesandoGruposRef =
    useRef(false);

  const gruposVistosRef =
    useRef<Set<number>>(new Set());

  const cargaInicialLogRef =
    useRef(true);

  const [
    logAlDia,
    setLogAlDia,
  ] = useState(true);

  // --- Cola ---
  const [
    errorCola,
    setErrorCola,
  ] = useState<string | null>(null);

  const [
    intentoCola,
    setIntentoCola,
  ] = useState(0);

  const [
    errorAccion,
    setErrorAccion,
  ] = useState<string | null>(
    null,
  );

  // --- Resultado ---
  const [
    resultadoCerrado,
    setResultadoCerrado,
  ] = useState(false);

  const [
    resultadoArena,
    setResultadoArena,
  ] = useState<{
    elo_delta: number | null;
    xp: number;
    aura_ganada: number;
    posicion: number | null;
    cambio: number | null;
  } | null>(null);

  useEffect(() => {
    if (
      !sesion ||
      sesion.estado === 'en_curso'
    ) {
      return;
    }

    onResultadoVisibleChange?.(
      true,
    );

    if (
      sesion.tipo !== 'arena' ||
      !sesionId
    ) {
      return;
    }

    let activo = true;

    const cargarResultado =
      async () => {
        const {
          data: inv,
        } = await supabase
          .from('arena_invitaciones')
          .select(
            'id, elo_delta, xp_ganador, xp_perdedor, aura_ganada, ganador_telegram_id',
          )
          .eq(
            'sesion_combate_id',
            sesionId,
          )
          .maybeSingle();

        if (
          !activo ||
          !inv ||
          inv.elo_delta == null
        ) {
          return;
        }

        const soyGanador =
          inv.ganador_telegram_id ===
          perfil.telegram_id;

        const eloPropio =
          soyGanador
            ? inv.elo_delta
            : -inv.elo_delta;

        const {
          data: ranking,
        } = await supabase.rpc(
          'arena_ranking_cambio',
          {
            p_invitacion_id: inv.id,
            p_telegram_id:
              perfil.telegram_id,
          },
        );

        if (!activo) return;

        setResultadoArena({
          elo_delta:
            eloPropio,
          xp: soyGanador
            ? inv.xp_ganador
            : inv.xp_perdedor,
          aura_ganada:
            soyGanador
              ? inv.aura_ganada
              : 0,
          posicion:
            ranking?.ok
              ? ranking.posicion_actual
              : null,
          cambio:
            ranking?.ok
              ? ranking.cambio
              : null,
        });
      };

    cargarResultado();

    const canal = supabase
      .channel(
        `arena_resultado_${sesionId}`,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table:
            'arena_invitaciones',
          filter: `sesion_combate_id=eq.${sesionId}`,
        },
        () => cargarResultado(),
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(
        canal,
      );
    };
  }, [
    sesion?.estado,
    sesion?.tipo,
    sesionId,
    perfil.telegram_id,
    onResultadoVisibleChange,
  ]);

  const cerrarResultado = () => {
    setResultadoCerrado(true);
    onResultadoVisibleChange?.(
      false,
    );
  };

  useEffect(() => {
    if (
      perfil.estado !== 'en_cola'
    ) {
      return;
    }

    let activo = true;

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () => controller.abort(),
        10000,
      );

    const cargar = async () => {
      setErrorCola(null);

      try {
        const {
          data: colaRow,
          error,
        } = await supabase
          .from(
            'mini_boss_queue',
          )
          .select(
            'encounter_id, mini_boss_encounters!inner(nivel_jefe, estado)',
          )
          .eq(
            'telegram_id',
            perfil.telegram_id,
          )
          .eq(
            'mini_boss_encounters.estado',
            'esperando_cola',
          )
          .order(
            'unido_en',
            {
              ascending: false,
            },
          )
          .limit(1)
          .abortSignal(
            controller.signal,
          )
          .maybeSingle();

        if (!activo) return;

        if (error) {
          throw error;
        }

        if (!colaRow) {
          return;
        }

        const encId =
          colaRow.encounter_id as number;

        const encuentro =
          colaRow.mini_boss_encounters as unknown as {
            nivel_jefe: number;
          } | null;

        setColaEncounterId(
          encId,
        );

        setColaNivelJefe(
          encuentro?.nivel_jefe ??
            null,
        );

        const { count } =
          await supabase
            .from(
              'mini_boss_queue',
            )
            .select('*', {
              count: 'exact',
              head: true,
            })
            .eq(
              'encounter_id',
              encId,
            )
            .abortSignal(
              controller.signal,
            );

        if (activo) {
          setColaCount(
            count ?? 0,
          );
        }
      } catch (err: any) {
        if (!activo) return;

        const timedOut =
          err?.name ===
          'AbortError';

        setErrorCola(
          timedOut
            ? 'La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.'
            : err.message,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    };

    cargar();

    return () => {
      activo = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [
    perfil.estado,
    perfil.telegram_id,
    intentoCola,
  ]);

  useEffect(() => {
    if (!colaEncounterId) {
      return;
    }

    const canal = supabase
      .channel(
        `cola-${colaEncounterId}`,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table:
            'mini_boss_queue',
          filter: `encounter_id=eq.${colaEncounterId}`,
        },
        () =>
          setColaCount(
            (c) => c + 1,
          ),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        canal,
      );
    };
  }, [colaEncounterId]);

  // --- Cargar combate ---
  const [
    intentoCombate,
    setIntentoCombate,
  ] = useState(0);

  const sesionCargadaIdRef =
    useRef<number | null>(null);

  // Recuperación de WebSocket al volver al primer plano.
  useEffect(() => {
    if (!sesionId) {
      return;
    }

    const revisar = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        setIntentoCombate(
          (c) => c + 1,
        );
      }
    };

    document.addEventListener(
      'visibilitychange',
      revisar,
    );

    window.addEventListener(
      'focus',
      revisar,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        revisar,
      );

      window.removeEventListener(
        'focus',
        revisar,
      );
    };
  }, [sesionId]);

  useEffect(() => {
    if (!sesionId) {
      return;
    }

    let activo = true;

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () => controller.abort(),
        10000,
      );

    const esPrimeraCargaDeEstaSesion =
      sesionCargadaIdRef.current !==
      sesionId;

    const cargar = async () => {
      if (
        esPrimeraCargaDeEstaSesion
      ) {
        setCargando(true);
      }

      setErrorCarga(null);

      try {
        const [
          sesionRes,
          combatientesRes,
          logRes,
          poderesRes,
        ] = await Promise.all([
          supabase
            .from(
              'combat_sesiones',
            )
            .select(
              'id, tipo, estado, turno_actual, ronda, oleada_actual, oleadas, votacion_huida',
            )
            .eq('id', sesionId)
            .abortSignal(
              controller.signal,
            )
            .single(),

          supabase
            .from(
              'combat_combatientes',
            )
            .select('*')
            .eq(
              'sesion_id',
              sesionId,
            )
            .order('orden')
            .abortSignal(
              controller.signal,
            ),

          supabase
            .from('combat_log')
            .select(
              'id, sesion_id, turno, combatiente_id, descripcion, creado_en, padre_id, es_critico, metadata',
            )
            .eq(
              'sesion_id',
              sesionId,
            )
            .order(
              'creado_en',
              {
                ascending: false,
              },
            )
            .limit(50)
            .abortSignal(
              controller.signal,
            )
            .then((res) =>
              res.data
                ? {
                    ...res,
                    data: [
                      ...res.data,
                    ].reverse(),
                  }
                : res,
            ),

          supabase
            .from(
              'character_powers',
            )
            .select(
              'powers(id, nombre, icono, costo_pm_base, parametros, tipo)',
            )
            .eq(
              'telegram_id',
              perfil.telegram_id,
            )
            .abortSignal(
              controller.signal,
            ),
        ]);

        if (!activo) return;

        if (
          sesionRes.error ||
          !sesionRes.data
        ) {
          throw new Error(
            'No se encontró la sesión de combate. Puede que ya haya terminado.',
          );
        }

        setSesion(
          sesionRes.data as Sesion,
        );

        if (
          combatientesRes.data
        ) {
          setCombatientes(
            combatientesRes.data as Combatiente[],
          );
        }

        if (logRes.data) {
          setLog(
            logRes.data as LogEntry[],
          );
        }

        if (
          poderesRes.data
        ) {
          const activos =
            poderesRes.data
              .map(
                (row: any) =>
                  row.powers,
              )
              .filter(
                (p: any) =>
                  p &&
                  p.tipo ===
                    'activo',
              );

          setPoderes(
            activos as Poder[],
          );
        }

        sesionCargadaIdRef.current =
          sesionId;
      } catch (err: any) {
        if (!activo) return;

        const timedOut =
          err?.name ===
          'AbortError';

        setErrorCarga(
          timedOut
            ? 'La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.'
            : err.message,
        );
      } finally {
        clearTimeout(timeoutId);

        if (activo) {
          setCargando(false);
        }
      }
    };

    cargar();

    return () => {
      activo = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [
    sesionId,
    perfil.telegram_id,
    intentoCombate,
  ]);

  // --- Suscripción realtime ---
  useEffect(() => {
    if (!sesionId) {
      return;
    }

    const canal = supabase
      .channel(
        `combate-${sesionId}`,
      )

      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table:
            'combat_sesiones',
          filter: `id=eq.${sesionId}`,
        },
        (payload) => {
          setSesion((prev) =>
            prev
              ? {
                  ...prev,
                  ...payload.new,
                }
              : (payload.new as Sesion),
          );
        },
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table:
            'combat_combatientes',
          filter: `sesion_id=eq.${sesionId}`,
        },
        (payload) => {
          if (
            payload.eventType ===
            'DELETE'
          ) {
            return;
          }

          const nuevo =
            payload.new as Combatiente;

          setCombatientes(
            (prev) => {
              const existe =
                prev.some(
                  (c) =>
                    c.id ===
                    nuevo.id,
                );

              return existe
                ? prev.map(
                    (c) =>
                      c.id ===
                      nuevo.id
                        ? {
                            ...c,
                            ...nuevo,
                          }
                        : c,
                  )
                : [
                    ...prev,
                    nuevo,
                  ].sort(
                    (a, b) =>
                      (a.orden ?? 0) -
                      (b.orden ?? 0),
                  );
            },
          );
        },
      )

      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table:
            'combat_log',
          filter: `sesion_id=eq.${sesionId}`,
        },
        (payload) => {
          const nuevaEntrada =
            payload.new as LogEntry;

          setLog((prev) => {
            if (
              prev.some(
                (entrada) =>
                  entrada.id ===
                  nuevaEntrada.id,
              )
            ) {
              return prev;
            }

            return [
              ...prev,
              nuevaEntrada,
            ].sort((a, b) => {
              if (
                a.turno !==
                b.turno
              ) {
                return (
                  a.turno -
                  b.turno
                );
              }

              const tiempoA =
                new Date(
                  a.creado_en,
                ).getTime();

              const tiempoB =
                new Date(
                  b.creado_en,
                ).getTime();

              if (
                tiempoA !==
                tiempoB
              ) {
                return (
                  tiempoA -
                  tiempoB
                );
              }

              return a.id - b.id;
            });
          });
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(
        canal,
      );
    };
  }, [sesionId]);

  useEffect(() => {
    setPoderSeleccionado(
      null,
    );
    setAccionArma(false);
    setMostrarInventario(false);
    setBandoVariable(null);
  }, [
    sesion?.turno_actual,
    sesion?.ronda,
  ]);

  // ============================================================
  // AGRUPACIÓN DEL LOG
  // ============================================================
  //
  // Hay tres tipos de entradas:
  //
  // 1. Raíz normal:
  //    padre_id == null && metadata == null
  //
  //    Es una acción del combatiente.
  //
  // 2. Rama normal:
  //    padre_id != null
  //
  //    Pertenece explícitamente a una acción.
  //
  // 3. Entrada metadata sin padre:
  //    padre_id == null && metadata != null
  //
  //    Puede ser un tick automático de DOT/HOT o la representación
  //    persistente/expiración de un buff/debuff.
  //
  // Estas últimas NO deben convertirse en acciones independientes.
  // Se asocian al grupo de una acción del mismo turno cuando es posible.
  //
  // Ejemplo:
  //
  // R22 acción
  // R22 metadata +10%
  //
  // R23 acción
  // R23 metadata +10%
  //
  // R24 acción
  // R24 metadata -10%
  //
  // Esto produce:
  //
  // R22 — Hrak'kar usó Filtro esquivo...
  // └─ +10%
  //
  // R23 — Hrak'kar ...
  // └─ +10%
  //
  // R24 — Hrak'kar ...
  // └─ -10%
  //
  const grupos = useMemo<Grupo[]>(
    () => {
      const logVisible =
        log.filter(
          (entrada) =>
            entrada.metadata
              ?.cat !==
            'amenaza',
        );

      const entradas = [
        ...logVisible,
      ].sort((a, b) => {
        if (
          a.turno !==
          b.turno
        ) {
          return (
            a.turno -
            b.turno
          );
        }

        const fechaA =
          new Date(
            a.creado_en,
          ).getTime();

        const fechaB =
          new Date(
            b.creado_en,
          ).getTime();

        if (
          fechaA !==
          fechaB
        ) {
          return (
            fechaA -
            fechaB
          );
        }

        return a.id - b.id;
      });

      // Acciones reales.
      const raices =
        entradas.filter(
          (entrada) =>
            entrada.padre_id ==
              null &&
            entrada.metadata ==
              null,
        );

      const raicesPorId =
        new Map<
          number,
          LogEntry
        >();

      raices.forEach(
        (raiz) => {
          raicesPorId.set(
            raiz.id,
            raiz,
          );
        },
      );

      // Mapa de acciones por turno + combatiente.
      //
      // Se utiliza primero el combatiente de la metadata.
      // Si no existe una acción exactamente con ese actor,
      // posteriormente se intenta asociarla a una acción del
      // mismo turno.
      const accionesPorTurnoCombatiente =
        new Map<
          string,
          LogEntry
        >();

      for (const raiz of raices) {
        const key = `${raiz.turno}:${raiz.combatiente_id ?? 'null'}`;

        if (
          !accionesPorTurnoCombatiente.has(
            key,
          )
        ) {
          accionesPorTurnoCombatiente.set(
            key,
            raiz,
          );
        }
      }

      // Todas las acciones de cada turno.
      const accionesPorTurno =
        new Map<
          number,
          LogEntry[]
        >();

      for (const raiz of raices) {
        const existentes =
          accionesPorTurno.get(
            raiz.turno,
          );

        if (existentes) {
          existentes.push(
            raiz,
          );
        } else {
          accionesPorTurno.set(
            raiz.turno,
            [raiz],
          );
        }
      }

      const ramasPorRaiz =
        new Map<
          number,
          LogEntry[]
        >();

      const agregarRama = (
        raizId: number,
        entrada: LogEntry,
      ) => {
        const existentes =
          ramasPorRaiz.get(
            raizId,
          );

        if (existentes) {
          existentes.push(
            entrada,
          );
        } else {
          ramasPorRaiz.set(
            raizId,
            [entrada],
          );
        }
      };

      for (const entrada of entradas) {
        // Una acción real no necesita tratamiento.
        if (
          entrada.padre_id ==
            null &&
          entrada.metadata ==
            null
        ) {
          continue;
        }

        // Rama explícita.
        if (
          entrada.padre_id !=
            null
        ) {
          if (
            raicesPorId.has(
              entrada.padre_id,
            )
          ) {
            agregarRama(
              entrada.padre_id,
              entrada,
            );

            continue;
          }
        }

        // Metadata sin padre.
        if (
          entrada.padre_id ==
            null &&
          entrada.metadata !=
            null
        ) {
          // Primera preferencia:
          // acción del mismo turno y mismo combatiente.
          const key = `${entrada.turno}:${entrada.combatiente_id ?? 'null'}`;

          const accionExacta =
            accionesPorTurnoCombatiente.get(
              key,
            );

          if (accionExacta) {
            agregarRama(
              accionExacta.id,
              entrada,
            );

            continue;
          }

          // Segunda preferencia:
          // si no existe acción del mismo combatiente,
          // asociarlo a la acción del mismo turno.
          //
          // Esto cubre especialmente efectos automáticos cuyo
          // combatiente_id representa al receptor del efecto y no
          // al actor que ejecutó la acción.
          const acciones =
            accionesPorTurno.get(
              entrada.turno,
            );

          if (
            acciones &&
            acciones.length === 1
          ) {
            agregarRama(
              acciones[0].id,
              entrada,
            );

            continue;
          }

          // Si hay varias acciones y no podemos determinar
          // inequívocamente a cuál pertenece, no inventamos una
          // asociación. Se conserva como evento automático para
          // que no se pierda.
        }
      }

      // Eventos metadata que no pudieron asociarse.
      //
      // Solamente se convierten en raíz visual si realmente no
      // existe ninguna acción compatible. No son objetivos ni
      // tarjetas: son simplemente eventos informativos.
      const gruposSinAsociar: LogEntry[] =
        entradas.filter(
          (entrada) =>
            entrada.padre_id ==
              null &&
            entrada.metadata !=
              null &&
            !Array.from(
              ramasPorRaiz.values(),
            ).some(
              (ramas) =>
                ramas.some(
                  (rama) =>
                    rama.id ===
                    entrada.id,
                ),
            ),
        );

      const resultado: Grupo[] =
        raices.map(
          (raiz) => ({
            raiz,
            ramas:
              ramasPorRaiz.get(
                raiz.id,
              ) ?? [],
          }),
        );

      // Los eventos automáticos no asociados se mantienen como
      // grupos mínimos. Esto evita perder DOT/HOT u otros eventos
      // que el backend deliberadamente registre sin padre.
      for (const entrada of gruposSinAsociar) {
        resultado.push({
          raiz: entrada,
          ramas: [],
        });
      }

      return resultado.sort(
        (a, b) => {
          if (
            a.raiz.turno !==
            b.raiz.turno
          ) {
            return (
              a.raiz.turno -
              b.raiz.turno
            );
          }

          const fechaA =
            new Date(
              a.raiz.creado_en,
            ).getTime();

          const fechaB =
            new Date(
              b.raiz.creado_en,
            ).getTime();

          if (
            fechaA !==
            fechaB
          ) {
            return (
              fechaA -
              fechaB
            );
          }

          return (
            a.raiz.id -
            b.raiz.id
          );
        },
      );
    },
    [log],
  );

  // Procesa una acción cada vez.
  const procesarColaGrupos =
    () => {
      const siguiente =
        colaGruposRef.current.shift();

      if (!siguiente) {
        procesandoGruposRef.current =
          false;

        setLogAlDia(true);

        return;
      }

      procesandoGruposRef.current =
        true;

      setGruposVisibles(
        (prev) => [
          ...prev,
          siguiente,
        ],
      );

      const actor =
        combatientes.find(
          (c) =>
            c.id ===
            siguiente.raiz
              .combatiente_id,
        );

      const demora =
        actor?.tipo ===
        'jugador'
          ? DEMORA_JUGADOR_MIN +
            Math.random() *
              (DEMORA_JUGADOR_MAX -
                DEMORA_JUGADOR_MIN)
          : actor?.tipo ===
              'enemigo'
            ? DEMORA_ENEMIGO
            : DEMORA_DEFECTO;

      setTimeout(
        procesarColaGrupos,
        demora,
      );
    };

  useEffect(() => {
    if (
      grupos.length === 0
    ) {
      return;
    }

    // Primera carga:
    // mostrar todo el historial ya existente.
    if (
      cargaInicialLogRef.current
    ) {
      cargaInicialLogRef.current =
        false;

      grupos.forEach((g) =>
        gruposVistosRef.current.add(
          g.raiz.id,
        ),
      );

      setGruposVisibles(
        grupos,
      );

      return;
    }

    // IDs de raíz vigentes en esta pasada.
    //
    // Una entrada metadata sin padre (ej. la expiración de un buff) puede
    // llegar por realtime ANTES que la acción a la que en realidad
    // pertenece — mientras tanto se muestra como raíz suelta ("evento
    // automático no asociado"). Cuando después aparece esa acción y la
    // entrada logra engancharse como rama suya, su id deja de estar en
    // `grupos` como raíz. Si no la sacamos de `gruposVisibles` y de la
    // cola, queda duplicada para siempre: suelta arriba y otra vez como
    // rama más abajo.
    const raicesActuales = new Set(
      grupos.map((g) => g.raiz.id),
    );

    // Primero sincronizamos las ramas de grupos ya visibles y
    // descartamos los que dejaron de ser raíz.
    //
    // Esto es importante porque realtime puede entregar:
    //
    // 1. raíz
    // 2. rama
    //
    // en dos eventos INSERT independientes.
    //
    // Por eso nunca debemos congelar un grupo con ramas=[].
    setGruposVisibles(
      (prev) =>
        prev
          .map(
            (visible) => {
              const actualizado =
                grupos.find(
                  (g) =>
                    g.raiz.id ===
                    visible.raiz.id,
                );

              return (
                actualizado ??
                visible
              );
            },
          )
          .filter((visible) =>
            raicesActuales.has(
              visible.raiz.id,
            ),
          ),
    );

    // Lo mismo para lo que está encolado pero todavía no se mostró.
    colaGruposRef.current =
      colaGruposRef.current.filter(
        (g) =>
          raicesActuales.has(
            g.raiz.id,
          ),
      );

    // Nuevos grupos.
    const nuevos =
      grupos.filter(
        (g) =>
          !gruposVistosRef.current.has(
            g.raiz.id,
          ),
      );

    if (
      nuevos.length === 0
    ) {
      return;
    }

    nuevos.forEach((g) =>
      gruposVistosRef.current.add(
        g.raiz.id,
      ),
    );

    colaGruposRef.current.push(
      ...nuevos,
    );

    setLogAlDia(false);

    if (
      !procesandoGruposRef.current
    ) {
      procesarColaGrupos();
    }
  }, [grupos]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top:
        logRef.current
          .scrollHeight,
      behavior: 'smooth',
    });
  }, [gruposVisibles]);

  // Auto-oculta el aviso de rechazo.
  useEffect(() => {
    if (!errorAccion) {
      return;
    }

    const t = setTimeout(
      () =>
        setErrorAccion(
          null,
        ),
      4000,
    );

    return () =>
      clearTimeout(t);
  }, [errorAccion]);

  if (
    !sesionId &&
    perfil.estado !== 'en_cola'
  ) {
    return null;
  }

  const miCombatiente =
    combatientes.find(
      (c) =>
        c.telegram_id ===
        perfil.telegram_id,
    );

  const esMiTurno =
    !!sesion &&
    !!miCombatiente &&
    miCombatiente.orden ===
      sesion.turno_actual &&
    sesion.estado ===
      'en_curso';

  const puedoActuar =
    esMiTurno && logAlDia;

  const poderesDisponibles =
    poderes.filter(
      (p) =>
        !(
          (
            miCombatiente
              ?.cooldowns?.[p.id] ??
            0
          ) > 0
        ),
    );

  const MOTIVOS_RECHAZO: Record<
    string,
    string
  > = {
    no_es_tu_turno:
      'Ese clic llegó un instante antes de tiempo — todavía no era tu turno. Probá de nuevo.',
    sesion_no_activa:
      'El combate ya no está activo.',
    no_participa:
      'Ya no estás en este combate.',
    debes_votar:
      'Hay una votación de huida en curso — votá primero.',
    no_hay_votacion:
      'No hay ninguna votación de huida abierta.',
    falta_voto:
      'Falta indicar el voto.',
    falta_objetivo:
      'Ese poder necesita un objetivo.',
    objetivo_invalido:
      'Ese objetivo ya no es válido (murió o cambió de estado).',
    poder_invalido:
      'Ese poder no está disponible.',
    en_enfriamiento:
      'Ese poder todavía está en enfriamiento.',
    mana_insuficiente:
      'No te alcanza el maná para ese poder.',
    accion_desconocida:
      'Acción no reconocida.',
  };

  const ejecutar = async (
    accion:
      | 'poder'
      | 'golpe'
      | 'huir'
      | 'votar_huida',
    poderId?: number,
    objetivoId?: number,
    voto?: boolean,
  ) => {
    if (
      !sesionId ||
      enviando
    ) {
      return;
    }

    setEnviando(true);

    const {
      data,
      error,
    } = await supabase.rpc(
      'combat_ejecutar_accion',
      {
        p_sesion_id:
          sesionId,
        p_telegram_id:
          perfil.telegram_id,
        p_accion: accion,
        p_power_id:
          poderId ?? null,
        p_objetivo_id:
          objetivoId ?? null,
        p_voto:
          voto ?? null,
      },
    );

    setEnviando(false);

    if (
      error ||
      !data?.ok
    ) {
      console.error(
        'Error ejecutando acción:',
        error || data,
      );

      const motivo:
        | string
        | undefined =
        data?.motivo;

      setErrorAccion(
        (motivo &&
          MOTIVOS_RECHAZO[
            motivo
          ]) ||
          'No se pudo registrar la acción. Probá de nuevo.',
      );

      return;
    }

    setErrorAccion(null);
    setPoderSeleccionado(
      null,
    );
    setAccionArma(false);
    setBandoVariable(null);
  };

  const cargarItemsUsables =
    async () => {
      setCargandoItems(
        true,
      );

      const {
        data,
        error,
      } = await supabase.rpc(
        'inv_obtener',
        {
          p_telegram_id:
            perfil.telegram_id,
        },
      );

      setCargandoItems(
        false,
      );

      if (error) {
        console.error(
          'Error cargando inventario:',
          error,
        );

        return;
      }

      const usables =
        (
          (data ?? []) as ItemUsable[]
        ).filter(
          (it) =>
            it.tipo ===
              'usable' &&
            it.contexto_uso ===
              'combate',
        );

      setItemsUsables(
        usables,
      );
    };

  const abrirInventario =
    () => {
      setMostrarInventario(
        true,
      );

      cargarItemsUsables();
    };

  const cerrarInventario =
    () => {
      setMostrarInventario(
        false,
      );
    };

  const usarItem = async (
    characterItemId: number,
  ) => {
    if (
      !sesionId ||
      enviando
    ) {
      return;
    }

    setEnviando(true);

    const {
      data,
      error,
    } = await supabase.rpc(
      'combat_usar_item',
      {
        p_sesion_id:
          sesionId,
        p_telegram_id:
          perfil.telegram_id,
        p_character_item_id:
          characterItemId,
      },
    );

    setEnviando(false);

    if (
      error ||
      !data?.ok
    ) {
      console.error(
        'Error usando item:',
        error || data,
      );

      return;
    }

    setMostrarInventario(
      false,
    );
  };

  // Esta función se mantiene antes de la construcción de la botonera.
  const objetivosPara =
    (cat: Categoria) =>
      cat === 'enemigo' ||
      cat === 'area_enemigos'
        ? combatientes.filter(
            (c) =>
              c.bando !==
                miCombatiente?.bando &&
              c.vivo,
          )
        : cat === 'aliado' ||
            cat ===
              'area_aliados'
          ? combatientes.filter(
              (c) =>
                c.bando ===
                  miCombatiente?.bando &&
                c.vivo,
            )
          : cat ===
              'area_todos'
            ? combatientes.filter(
                (c) => c.vivo,
              )
            : [];

  const tocarPoder =
    (poder: Poder) => {
      const cat =
        categoriaObjetivo(
          poder,
        );

      if (cat === null) {
        ejecutar(
          'poder',
          poder.id,
        );

        return;
      }

      if (
        cat ===
          'area_enemigos' ||
        cat ===
          'area_aliados' ||
        cat ===
          'area_todos'
      ) {
        ejecutar(
          'poder',
          poder.id,
        );

        return;
      }

      if (
        cat ===
        'variable'
      ) {
        setBandoVariable(
          null,
        );

        setPoderSeleccionado(
          poder,
        );

        return;
      }

      const objetivos =
        objetivosPara(cat);

      if (
        objetivos.length === 1
      ) {
        ejecutar(
          'poder',
          poder.id,
          objetivos[0].id,
        );

        return;
      }

      setPoderSeleccionado(
        poder,
      );
    };

  // --- Render: cola ---
  if (
    perfil.estado ===
      'en_cola' &&
    !sesionId
  ) {
    return (
      <div
        className="d-flex flex-column vh-100"
        style={{
          backgroundColor:
            theme.bg,
          color:
            theme.text,
        }}
      >
        <header
          className="py-3 px-3 text-center"
          style={{
            backgroundColor:
              theme.headerBg,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span
            className="fw-bold"
            style={{
              fontFamily:
                'var(--font-display)',
            }}
          >
            {
              perfil.nombre_personaje
            }
          </span>
        </header>

        <main
          className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3"
          style={{
            fontFamily:
              'var(--font-body)',
          }}
        >
          {errorCola ? (
            <>
              <p className="mb-3">
                {errorCola}
              </p>

              <button
                className="btn btn-outline-light"
                style={{
                  fontFamily:
                    'var(--font-body)',
                }}
                onClick={() =>
                  setIntentoCola(
                    (n) =>
                      n + 1,
                  )
                }
              >
                Reintentar
              </button>
            </>
          ) : (
            <>
              <i
                className="bi bi-exclamation-diamond-fill"
                style={{
                  fontSize:
                    '3rem',
                  color:
                    theme.accent,
                }}
              />

              <h4
                className="mt-3"
                style={{
                  fontFamily:
                    'var(--font-display)',
                }}
              >
                {colaNivelJefe
                  ? `Mini jefe de nivel ${colaNivelJefe}`
                  : 'Buscando encuentro...'}
              </h4>

              <p
                className="fs-4"
                style={{
                  color:
                    theme.accent,
                  fontFamily:
                    'var(--font-display)',
                }}
              >
                {colaCount}/4
              </p>
            </>
          )}
        </main>

        <footer
          className="d-flex align-items-center justify-content-center gap-2"
          style={{
            backgroundColor:
              theme.footerBg,
            borderTop: `1px solid ${theme.border}`,
            minHeight: '70px',
            fontFamily:
              'var(--font-body)',
          }}
        >
          <i
            className="bi bi-arrow-repeat spin-icon fs-4"
            style={{
              color:
                theme.accent,
            }}
          />

          <span>
            Esperando otros...
          </span>
        </footer>
      </div>
    );
  }

  // --- Render: combate ---
  if (errorCarga) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center vh-100 text-center px-3"
        style={{
          backgroundColor:
            theme.bg,
          color:
            theme.text,
          fontFamily:
            'var(--font-body)',
        }}
      >
        <p className="mb-3">
          {errorCarga}
        </p>

        <button
          className="btn btn-outline-light"
          onClick={() =>
            setIntentoCombate(
              (n) => n + 1,
            )
          }
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (
    cargando ||
    !sesion
  ) {
    return (
      <div
        className="d-flex align-items-center justify-content-center vh-100"
        style={{
          backgroundColor:
            theme.bg,
          color:
            theme.text,
        }}
      >
        <div
          className="spinner-border"
          role="status"
        />
      </div>
    );
  }

  const vivos =
    combatientes
      .filter(
        (c) => c.vivo,
      )
      .sort(
        (a, b) =>
          (a.orden ?? 0) -
          (b.orden ?? 0),
      );

  const aliadosVivos =
    vivos.filter(
      (c) =>
        c.bando ===
        (miCombatiente?.bando ??
          1),
    );

  const enemigosVivos =
    vivos.filter(
      (c) =>
        c.bando !==
        (miCombatiente?.bando ??
          1),
    );

  const combateTerminado =
    sesion.estado !==
    'en_curso';

  if (
    combateTerminado &&
    !resultadoCerrado
  ) {
    const yo =
      combatientes.find(
        (c) =>
          c.telegram_id ===
          perfil.telegram_id,
      );

    const miBando =
      yo?.bando ?? 1;

    const terminoEnJuego =
      sesion.estado ===
        'victoria' ||
      sesion.estado ===
        'derrota';

    const gano =
      terminoEnJuego &&
      (miBando === 1
        ? sesion.estado ===
          'victoria'
        : sesion.estado ===
          'derrota');

    const iconoTitulo =
      gano
        ? 'trophy-fill'
        : terminoEnJuego
          ? 'emoji-dizzy-fill'
          : 'dash-circle';

    const textoTitulo =
      gano
        ? '¡Victoria!'
        : terminoEnJuego
          ? 'Derrota'
          : 'Encuentro cancelado';

    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center text-center px-4"
        style={{
          minHeight:
            '100vh',
          backgroundColor:
            theme.bg,
          color:
            theme.text,
          fontFamily:
            'var(--font-body)',
        }}
      >
        <h2
          className="mb-4 d-flex align-items-center gap-2"
          style={{
            fontFamily:
              'var(--font-display)',
          }}
        >
          <i
            className={`bi bi-${iconoTitulo}`}
          />

          {textoTitulo}
        </h2>

        {yo && (
          <div
            className="mb-4"
            style={{
              opacity: 0.9,
            }}
          >
            <div>
              <i className="bi bi-lightning-charge me-2" />
              Daño realizado:{' '}
              <strong>
                {
                  yo.dano_realizado
                }
              </strong>
            </div>

            <div>
              <i className="bi bi-shield-shaded me-2" />
              Daño recibido:{' '}
              <strong>
                {
                  yo.dano_recibido
                }
              </strong>
            </div>
          </div>
        )}

        {resultadoArena && (
          <div
            className="mb-4 d-flex flex-column gap-2"
            style={{
              minWidth:
                '220px',
            }}
          >
            {resultadoArena.posicion !=
              null && (
              <div>
                <i className="bi bi-award me-2" />

                Puesto #
                {
                  resultadoArena.posicion
                }

                {resultadoArena.cambio !=
                  null &&
                  resultadoArena.cambio !==
                    0 && (
                    <span
                      className="ms-2"
                      style={{
                        color:
                          resultadoArena.cambio >
                          0
                            ? '#4caf50'
                            : '#e05353',
                      }}
                    >
                      <i
                        className={`bi bi-arrow-${
                          resultadoArena.cambio >
                          0
                            ? 'up'
                            : 'down'
                        }`}
                      />

                      {Math.abs(
                        resultadoArena.cambio,
                      )}
                    </span>
                  )}
              </div>
            )}

            {resultadoArena.elo_delta !=
              null && (
              <div>
                <i className="bi bi-graph-up-arrow me-2" />

                Rango:{' '}
                {resultadoArena.elo_delta >=
                0
                  ? '+'
                  : ''}
                {
                  resultadoArena.elo_delta
                }
              </div>
            )}

            <div>
              <i className="bi bi-ticket-detailed me-2" />
              Aura: +
              {
                resultadoArena.aura_ganada
              }
            </div>

            <div>
              <i className="bi bi-star me-2" />
              XP: +
              {
                resultadoArena.xp
              }
            </div>
          </div>
        )}

        <button
          className="btn rounded-circle d-flex align-items-center justify-content-center mt-2"
          style={{
            width: '64px',
            height: '64px',
            backgroundColor:
              theme.accent,
            border: 'none',
          }}
          onClick={
            cerrarResultado
          }
        >
          <i
            className="bi bi-check-lg"
            style={{
              fontSize:
                '1.8rem',
            }}
          />
        </button>
      </div>
    );
  }

  const accionActiva:
    | {
        tipo:
          | 'poder'
          | 'golpe';
        poder?: Poder;
      }
    | null = accionArma
    ? { tipo: 'golpe' }
    : poderSeleccionado
      ? {
          tipo: 'poder',
          poder:
            poderSeleccionado,
        }
      : null;

  const categoria: Categoria =
    accionActiva?.tipo ===
    'golpe'
      ? 'enemigo'
      : accionActiva?.poder
        ? categoriaObjetivo(
            accionActiva.poder,
          )
        : null;

  const objetivosPosibles =
    objetivosPara(
      categoria ===
        'variable'
        ? bandoVariable
        : categoria,
    );

  const seleccionarObjetivo =
    (
      objetivoId: number,
    ) => {
      if (
        !accionActiva
      ) {
        return;
      }

      if (
        accionActiva.tipo ===
        'golpe'
      ) {
        ejecutar(
          'golpe',
          undefined,
          objetivoId,
        );
      } else {
        ejecutar(
          'poder',
          accionActiva
            .poder!.id,
          objetivoId,
        );
      }
    };

  return (
    <div
      className="d-flex flex-column vh-100"
      style={{
        backgroundColor:
          theme.bg,
        color:
          theme.text,
      }}
    >
      {/* Encabezado */}
      <header
        className="py-2 px-2"
        style={{
          backgroundColor:
            theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div
          className="d-flex align-items-center"
          style={{
            gap: '0.6rem',
          }}
        >
          <span
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: '34px',
              height: '34px',
              border: `2px solid ${theme.border}`,
              fontWeight:
                'bold',
              fontFamily:
                'var(--font-display)',
            }}
          >
            {sesion.ronda}
          </span>

          <div
            className="d-flex flex-grow-1"
            style={{
              gap: '0.35rem',
              overflowX:
                'auto',
              paddingBottom:
                '2px',
            }}
          >
            {vivos.map(
              (c) => {
                const esTurno =
                  c.orden ===
                  sesion.turno_actual;

                const yaJugo =
                  (c.orden ?? 0) <
                  sesion.turno_actual;

                const fill =
                  esTurno
                    ? '#4caf50'
                    : yaJugo
                      ? '#c0392b'
                      : '#f0c419';

                const borde =
                  c.bando ===
                  miCombatiente?.bando
                    ? '#4caf50'
                    : '#c0392b';

                return (
                  <span
                    key={c.id}
                    title={
                      c.nombre
                    }
                    className="rounded-circle flex-shrink-0 position-relative"
                    style={{
                      width:
                        '24px',
                      height:
                        '24px',
                      backgroundColor:
                        fill,
                      border: `2px solid ${borde}`,
                    }}
                  >
                    {esTurno && (
                      <i
                        className="bi bi-flag-fill position-absolute"
                        style={{
                          fontSize:
                            '0.6rem',
                          top: '-6px',
                          right:
                            '-4px',
                          color:
                            theme.accent,
                        }}
                      />
                    )}
                  </span>
                );
              },
            )}
          </div>
        </div>
      </header>

      {/* Banda enemiga: puramente visual */}
      <BandaCombate
        combatientes={
          enemigosVivos
        }
        colorBorde="#c0392b"
      />

      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* Centro: log */}
        <div
          ref={logRef}
          className="flex-grow-1 overflow-auto px-2 py-2"
          style={{
            fontSize:
              '0.9rem',
            fontFamily:
              'var(--font-body)',
          }}
        >
          {log.length ===
            0 && (
            <p className="text-secondary text-center mt-4">
              El combate está
              por comenzar...
            </p>
          )}

          {gruposVisibles.map(
            ({
              raiz,
              ramas,
            }) => {
              // Evento automático sin acción asociable.
              //
              // No es un objetivo ni una tarjeta.
              // Solamente aparece como una línea mínima.
              if (
                raiz.metadata
              ) {
                const actor =
                  combatientes.find(
                    (c) =>
                      c.id ===
                      raiz.combatiente_id,
                  );

                return (
                  <div
                    key={raiz.id}
                    className="mb-1 d-flex align-items-center"
                    style={{
                      gap: '5px',
                    }}
                  >
                    <span className="text-secondary">
                      R
                      {
                        raiz.turno
                      }
                    </span>

                    <ChipEfecto
                      m={
                        raiz.metadata
                      }
                      esCritico={raiz.es_critico}
                    />

                    {actor && (
                      <span
                        className="text-secondary"
                        style={{
                          fontSize:
                            '0.8em',
                        }}
                      >
                        {
                          actor.nombre
                        }
                      </span>
                    )}
                  </div>
                );
              }

              // Primer daño o curación directo.
              const idxPrincipal =
                ramas.findIndex(
                  (r) =>
                    r.metadata &&
                    (
                      r.metadata
                        .cat ===
                        'dano' ||
                      r.metadata
                        .cat ===
                        'curacion'
                    ) &&
                    !r.metadata
                      .dot_hot,
                );

              const principal =
                idxPrincipal ===
                -1
                  ? null
                  : ramas[
                      idxPrincipal
                    ];

              const resto =
                idxPrincipal ===
                -1
                  ? ramas
                  : ramas.filter(
                      (_, i) =>
                        i !==
                        idxPrincipal,
                    );

              const chipRamas =
                resto.filter(
                  (r) =>
                    r.metadata,
                );

              const textoRamas =
                resto.filter(
                  (r) =>
                    !r.metadata,
                );

              return (
                <div
                  key={raiz.id}
                  className="mb-2"
                >
                  <p className="mb-0">
                    <span className="text-secondary">
                      R
                      {
                        raiz.turno
                      }
                    </span>{' '}
                    —{' '}
                    {renderDescripcionLog(
                      raiz.descripcion,
                      raiz.es_critico,
                    )}

                    {principal?.metadata && (
                      <>
                        :{' '}
                        <ChipEfecto
                          m={
                            principal.metadata
                          }
                          esCritico={principal.es_critico}
                        />
                      </>
                    )}
                  </p>

                  {chipRamas.length >
                    0 && (
                    <p
                      className="mb-0 ps-3 d-flex flex-wrap align-items-center"
                      style={{
                        opacity:
                          0.85,
                        gap: '4px',
                      }}
                    >
                      <span className="text-secondary">
                        └─
                      </span>

                      {chipRamas.map(
                        (
                          rama,
                          i,
                        ) => (
                          <span
                            key={
                              rama.id
                            }
                            className="d-flex align-items-center"
                            style={{
                              gap: '4px',
                            }}
                          >
                            <ChipEfecto
                              m={
                                rama.metadata!
                              }
                              esCritico={rama.es_critico}
                            />

                            {i <
                              chipRamas.length -
                                1 && (
                              <span className="text-secondary">
                                ,
                              </span>
                            )}
                          </span>
                        ),
                      )}
                    </p>
                  )}

                  {textoRamas.map(
                    (rama) => (
                      <p
                        key={
                          rama.id
                        }
                        className="mb-0 ps-3"
                        style={{
                          opacity:
                            0.85,
                        }}
                      >
                        <span className="text-secondary">
                          └─
                        </span>{' '}
                        {renderDescripcionLog(
                          rama.descripcion,
                          rama.es_critico,
                        )}
                      </p>
                    ),
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>

      {/* Banda propia: puramente visual */}
      <BandaCombate
        combatientes={
          aliadosVivos
        }
        colorBorde="#4caf50"
      />

      {/* Aviso de rechazo del backend */}
      {errorAccion && (
        <div
          className="px-3 py-2 text-center"
          style={{
            backgroundColor:
              'rgba(220, 53, 69, 0.85)',
            color: '#fff',
            fontSize:
              '0.85rem',
          }}
        >
          {errorAccion}
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          backgroundColor:
            theme.footerBg,
          borderTop: `1px solid ${theme.border}`,
          minHeight:
            '150px',
          padding: '8px',
          fontFamily:
            'var(--font-body)',
        }}
      >
        {combateTerminado ? (
          <div className="text-center py-3">
            Volviendo al perfil...
          </div>
        ) : sesion.votacion_huida &&
          puedoActuar ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 gap-3 py-2 text-center">
            <span>
              ¿Quieres huir del combate,
              cristalito?
            </span>

            <div className="d-flex gap-3">
              <button
                disabled={
                  enviando
                }
                onClick={() =>
                  ejecutar(
                    'votar_huida',
                    undefined,
                    undefined,
                    false,
                  )
                }
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{
                  width:
                    '3rem',
                  height:
                    '3rem',
                  border: `1px solid ${theme.text}`,
                  color:
                    theme.text,
                  backgroundColor:
                    'transparent',
                }}
                title="No huir"
              >
                <i className="bi bi-x-lg fs-5" />
              </button>

              <button
                disabled={
                  enviando
                }
                onClick={() =>
                  ejecutar(
                    'votar_huida',
                    undefined,
                    undefined,
                    true,
                  )
                }
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{
                  width:
                    '3rem',
                  height:
                    '3rem',
                  border: `1px solid ${theme.accent}`,
                  color:
                    theme.accent,
                  backgroundColor:
                    'transparent',
                }}
                title="Huir"
              >
                <i className="bi bi-check-lg fs-5" />
              </button>
            </div>
          </div>
        ) : !puedoActuar ? (
          <div className="d-flex align-items-center justify-content-center h-100 gap-2 py-4">
            <i
              className="bi bi-arrow-repeat spin-icon"
              style={{
                color:
                  theme.accent,
              }}
            />

            <span className="text-secondary">
              {sesion.votacion_huida
                ? 'Votación de huida en curso...'
                : esMiTurno
                  ? 'Resolviendo la ronda...'
                  : `Turno de ${
                      vivos.find(
                        (c) =>
                          c.orden ===
                          sesion.turno_actual,
                      )?.nombre ??
                      '...'
                    }`}
            </span>
          </div>
        ) : accionActiva ? (
          // --- Selección de objetivo ---
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small text-secondary">
                Elige objetivo
              </span>

              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => {
                  setPoderSeleccionado(
                    null,
                  );
                  setAccionArma(
                    false,
                  );
                  setBandoVariable(
                    null,
                  );
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {categoria ===
              'variable' &&
            bandoVariable ===
              null ? (
              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: '6px',
                }}
              >
                <button
                  className="btn btn-outline-light p-3"
                  onClick={() =>
                    setBandoVariable(
                      'aliado',
                    )
                  }
                >
                  <i className="bi bi-people-fill d-block mb-1" />
                  Bando aliado
                </button>

                <button
                  className="btn btn-outline-light p-3"
                  onClick={() =>
                    setBandoVariable(
                      'enemigo',
                    )
                  }
                >
                  <i className="bi bi-crosshair d-block mb-1" />
                  Bando enemigo
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: '6px',
                }}
              >
                {objetivosPosibles.map(
                  (obj) => (
                    <button
                      key={
                        obj.id
                      }
                      disabled={
                        enviando
                      }
                      onClick={() =>
                        seleccionarObjetivo(
                          obj.id,
                        )
                      }
                      className="btn btn-outline-light text-start p-2"
                      style={{
                        fontSize:
                          '0.85rem',
                      }}
                    >
                      <div>
                        {
                          obj.nombre
                        }
                      </div>

                      <MiniBarra
                        actual={
                          obj.ps_actual
                        }
                        max={
                          obj.ps_max
                        }
                        color="#c0392b"
                      />

                      {obj.tipo ===
                        'jugador' && (
                        <MiniBarra
                          actual={
                            obj.pm_actual
                          }
                          max={
                            obj.pm_max
                          }
                          color="#2980b9"
                        />
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : mostrarInventario ? (
          // --- Consumibles ---
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small text-secondary">
                Consumibles
              </span>

              <button
                className="btn btn-sm btn-outline-light"
                onClick={
                  cerrarInventario
                }
                title="Volver a poderes"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: '6px',
              }}
            >
              {cargandoItems && (
                <div className="d-flex align-items-center justify-content-center text-secondary small">
                  Cargando...
                </div>
              )}

              {!cargandoItems &&
                itemsUsables.length ===
                  0 && (
                  <div
                    className="d-flex align-items-center justify-content-center text-secondary small"
                    style={{
                      gridColumn:
                        '1 / -1',
                    }}
                  >
                    Sin consumibles
                  </div>
                )}

              {itemsUsables.map(
                (item) => (
                  <button
                    key={
                      item.character_item_id
                    }
                    disabled={
                      enviando
                    }
                    onClick={() =>
                      usarItem(
                        item.character_item_id,
                      )
                    }
                    className="btn btn-outline-light d-flex flex-column align-items-center justify-content-center p-2"
                    style={{
                      position:
                        'relative',
                    }}
                  >
                    <span
                      style={{
                        position:
                          'absolute',
                        top:
                          '3px',
                        right:
                          '4px',
                        fontSize:
                          '0.65rem',
                        lineHeight:
                          1,
                        color:
                          theme.text,
                      }}
                    >
                      x
                      {
                        item.cantidad
                      }
                    </span>

                    <i
                      className={`bi bi-${
                        item.icono ??
                        'flask-florence'
                      } fs-5`}
                    />

                    <span
                      style={{
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      {
                        item.nombre
                      }
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          // --- Selección de poder / arma / inventario / huir ---
          <div
            className="d-flex h-100"
            style={{
              gap: '8px',
            }}
          >
            <div
              className="flex-grow-1"
              style={{
                display:
                  'grid',
                gap: '6px',
                gridTemplateColumns:
                  poderesDisponibles.length ===
                  3
                    ? '1fr'
                    : poderesDisponibles.length <=
                        1
                      ? '1fr'
                      : '1fr 1fr',
                gridTemplateRows:
                  poderesDisponibles.length ===
                  3
                    ? '1fr 1fr 1fr'
                    : poderesDisponibles.length <=
                        2
                      ? '1fr'
                      : '1fr 1fr',
              }}
            >
              {poderesDisponibles.length ===
                0 && (
                <div className="d-flex align-items-center justify-content-center text-secondary small">
                  {poderes.length ===
                  0
                    ? 'Sin poderes activos'
                    : 'Todos en enfriamiento'}
                </div>
              )}

              {poderesDisponibles.map(
                (poder) => {
                  const costoMana =
                    costoManaPoder(
                      poder.costo_pm_base,
                      miCombatiente?.nivel ??
                        1,
                    );

                  const sinMana =
                    costoMana !==
                      null &&
                    (
                      miCombatiente?.pm_actual ??
                      0
                    ) <
                      costoMana;

                  return (
                    <button
                      key={
                        poder.id
                      }
                      disabled={
                        enviando ||
                        sinMana
                      }
                      onClick={() =>
                        tocarPoder(
                          poder,
                        )
                      }
                      className="btn btn-outline-light d-flex flex-column align-items-center justify-content-center"
                      style={{
                        position:
                          'relative',
                        opacity:
                          sinMana
                            ? 0.45
                            : 1,
                      }}
                    >
                      {costoMana !==
                        null && (
                        <span
                          style={{
                            position:
                              'absolute',
                            top:
                              '3px',
                            right:
                              '4px',
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap:
                              '2px',
                            fontSize:
                              '0.65rem',
                            lineHeight:
                              1,
                            color:
                              sinMana
                                ? '#e05353'
                                : '#2980b9',
                          }}
                        >
                          <span
                            style={{
                              width:
                                '6px',
                              height:
                                '6px',
                              borderRadius:
                                '50%',
                              backgroundColor:
                                sinMana
                                  ? '#e05353'
                                  : '#2980b9',
                              boxShadow: `0 0 4px ${
                                sinMana
                                  ? '#e05353'
                                  : '#2980b9'
                              }`,
                            }}
                          />

                          {
                            costoMana
                          }
                        </span>
                      )}

                      <i
                        className={`bi bi-${
                          poder.icono ??
                          'stars'
                        } fs-5`}
                      />

                      <span
                        style={{
                          fontSize:
                            '0.7rem',
                        }}
                      >
                        {
                          poder.nombre
                        }
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div
              className="d-flex flex-column"
              style={{
                gap: '6px',
                width:
                  '70px',
              }}
            >
              <button
                disabled={
                  enviando
                }
                onClick={() => {
                  const objetivos =
                    objetivosPara(
                      'enemigo',
                    );

                  if (
                    objetivos.length ===
                    1
                  ) {
                    ejecutar(
                      'golpe',
                      undefined,
                      objetivos[0]
                        .id,
                    );
                  } else {
                    setAccionArma(
                      true,
                    );
                  }
                }}
                className="btn btn-outline-light flex-grow-1"
              >
                <i className="bi bi-hammer" />
              </button>

              <button
                disabled={
                  enviando
                }
                onClick={
                  abrirInventario
                }
                className="btn btn-outline-light flex-grow-1"
              >
                <i className="bi bi-backpack" />
              </button>

              <button
                disabled={
                  enviando
                }
                onClick={() =>
                  ejecutar(
                    'huir',
                  )
                }
                className="btn btn-outline-light flex-grow-1"
              >
                <i className="bi bi-door-open" />
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};
