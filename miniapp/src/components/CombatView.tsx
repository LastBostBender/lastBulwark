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

interface LogEntry {
  id: number;
  turno: number;
  descripcion: string;
  creado_en: string;
  padre_id: number | null;
  combatiente_id: number | null;
  es_critico: boolean;
}

interface Grupo {
  raiz: LogEntry;
  ramas: LogEntry[];
}

function renderDescripcionLog(descripcion: string, esCritico: boolean) {
  if (!esCritico) return descripcion;
  const match = descripcion.match(/\d+/);
  if (!match || match.index === undefined) return descripcion;
  const antes = descripcion.slice(0, match.index);
  const numero = match[0];
  const despues = descripcion.slice(match.index + numero.length);
  return (
    <>
      {antes}
      <i className="bi bi-arrow-through-heart" style={{ color: '#e63950' }}></i>{' '}
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

// Réplica en el frontend de combat_costo_mana (SQL): mismo costo base +
// franjas por nivel. Es solo para mostrar el número antes de tirar el
// poder — el backend sigue siendo la fuente de verdad, esto no reemplaza
// el rechazo de combat_ejecutar_accion si no alcanza el maná.
function costoManaPoder(
  costoBase: number | null,
  nivel: number,
): number | null {
  if (costoBase === null || costoBase === undefined) return null;
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
  | 'area_enemigos'
  | 'area_aliados'
  | 'area_todos'
  | null;

function categoriaObjetivo(poder: Poder): Categoria {
  const onUse = (poder.parametros?.efectos ?? []).filter(
    (e) => e.trigger === 'on_use',
  );

  const targets = new Set(onUse.map((e) => e.target));

  if (targets.has('todos_en_combate')) return 'area_todos';
  if (targets.has('todos_enemigos')) return 'area_enemigos';
  if (targets.has('todos_aliados')) return 'area_aliados';
  if (targets.has('enemigo')) return 'enemigo';
  if (targets.has('aliado_objetivo')) return 'aliado';

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
  <div className="progress-custom" style={{ height: '4px' }}>
    <div
      className="bar"
      style={{
        width: `${
          max > 0
            ? Math.max(0, Math.min(100, (actual / max) * 100))
            : 0
        }%`,
        backgroundColor: color,
      }}
    />
  </div>
);

export const CombatView = ({ perfil, onResultadoVisibleChange }: CombatViewProps) => {
  const theme = getTheme(perfil.zona);
  // Congelado: una vez que hay un id real, se queda con ese aunque el backend
  // limpie perfil.sesion_combate_id al terminar el combate (ver comentario
  // en CombatViewProps). Sin esto, la pantalla de resultado se queda sin
  // saber de qué sesion leer datos apenas termina la pelea.
  const sesionIdRef = useRef<number | null>(null);
  if (perfil.sesion_combate_id != null) {
    sesionIdRef.current = perfil.sesion_combate_id;
  }
  const sesionId = sesionIdRef.current;

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-display',
      theme.fontDisplay,
    );
    document.documentElement.style.setProperty(
      '--font-body',
      theme.fontBody,
    );
  }, [theme.fontDisplay, theme.fontBody]);

  // --- Estado: en_cola ---
  const [colaEncounterId, setColaEncounterId] = useState<number | null>(null);
  const [colaNivelJefe, setColaNivelJefe] = useState<number | null>(null);
  const [colaCount, setColaCount] = useState(0);

  // --- Estado: en_combate ---
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [combatientes, setCombatientes] = useState<Combatiente[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [poderes, setPoderes] = useState<Poder[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [poderSeleccionado, setPoderSeleccionado] =
    useState<Poder | null>(null);
  const [accionArma, setAccionArma] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);

  // --- Revelación escalonada del log ---
  const [gruposVisibles, setGruposVisibles] = useState<Grupo[]>([]);
  const colaGruposRef = useRef<Grupo[]>([]);
  const procesandoGruposRef = useRef(false);
  const gruposVistosRef = useRef<Set<number>>(new Set());
  const cargaInicialLogRef = useRef(true);
  // Si hay narración pendiente de mostrarse (efectos, daño, etc. de la ronda
  // anterior todavía drenando en cámara lenta), la botonera se bloquea aunque
  // el backend ya haya avanzado el turno.
  const [logAlDia, setLogAlDia] = useState(true);

  // Cargar cola
  const [errorCola, setErrorCola] = useState<string | null>(null);
  const [intentoCola, setIntentoCola] = useState(0);

  // --- Pantalla de resultado (reemplaza el corte feo directo a perfil) ---
  const [resultadoCerrado, setResultadoCerrado] = useState(false);
  const [resultadoArena, setResultadoArena] = useState<{
    elo_delta: number | null;
    xp: number;
    aura_ganada: number;
    posicion: number | null;
    cambio: number | null;
  } | null>(null);
  const resultadoCargadoRef = useRef(false);

  useEffect(() => {
    if (!sesion || sesion.estado === 'en_curso') return;
    onResultadoVisibleChange?.(true);
    if (resultadoCargadoRef.current) return;
    resultadoCargadoRef.current = true;

    if (sesion.tipo !== 'arena' || !sesionId) return;

    (async () => {
      const { data: inv } = await supabase
        .from('arena_invitaciones')
        .select('id, elo_delta, xp_ganador, xp_perdedor, aura_ganada, ganador_telegram_id')
        .eq('sesion_combate_id', sesionId)
        .maybeSingle();

      if (!inv) return;

      const soyGanador = inv.ganador_telegram_id === perfil.telegram_id;
      const eloPropio = inv.elo_delta == null ? null : (soyGanador ? inv.elo_delta : -inv.elo_delta);

      const { data: ranking } = await supabase.rpc('arena_ranking_cambio', {
        p_invitacion_id: inv.id,
        p_telegram_id: perfil.telegram_id,
      });

      setResultadoArena({
        elo_delta: eloPropio,
        xp: soyGanador ? inv.xp_ganador : inv.xp_perdedor,
        aura_ganada: soyGanador ? inv.aura_ganada : 0,
        posicion: ranking?.ok ? ranking.posicion_actual : null,
        cambio: ranking?.ok ? ranking.cambio : null,
      });
    })();
  }, [sesion?.estado, sesion?.tipo, sesionId, perfil.telegram_id, onResultadoVisibleChange]);

  const cerrarResultado = () => {
    setResultadoCerrado(true);
    onResultadoVisibleChange?.(false);
  };

  useEffect(() => {
    if (perfil.estado !== 'en_cola') return;

    let activo = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const cargar = async () => {
      setErrorCola(null);

      try {
        const { data: colaRow, error } = await supabase
          .from('mini_boss_queue')
          .select(
            'encounter_id, mini_boss_encounters!inner(nivel_jefe, estado)',
          )
          .eq('telegram_id', perfil.telegram_id)
          .eq('mini_boss_encounters.estado', 'esperando_cola')
          .order('unido_en', { ascending: false })
          .limit(1)
          .abortSignal(controller.signal)
          .maybeSingle();

        if (!activo) return;
        if (error) throw error;
        if (!colaRow) return;

        const encId = colaRow.encounter_id as number;

        const encuentro =
          colaRow.mini_boss_encounters as unknown as {
            nivel_jefe: number;
          } | null;

        setColaEncounterId(encId);
        setColaNivelJefe(encuentro?.nivel_jefe ?? null);

        const { count } = await supabase
          .from('mini_boss_queue')
          .select('*', { count: 'exact', head: true })
          .eq('encounter_id', encId)
          .abortSignal(controller.signal);

        if (activo) setColaCount(count ?? 0);
      } catch (err: any) {
        if (!activo) return;

        const timedOut = err?.name === 'AbortError';

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
  }, [perfil.estado, perfil.telegram_id, intentoCola]);

  useEffect(() => {
    if (!colaEncounterId) return;

    const canal = supabase
      .channel(`cola-${colaEncounterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mini_boss_queue',
          filter: `encounter_id=eq.${colaEncounterId}`,
        },
        () => setColaCount((c) => c + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [colaEncounterId]);

  // --- Cargar combate ---
  const [intentoCombate, setIntentoCombate] = useState(0);
  // Distingue "primera carga de esta sesión" (ahí sí corresponde el spinner de
  // pantalla completa, no hay nada que mostrar todavía) de "recarga por
  // reconexión" (los datos ya están en pantalla, no hay que taparlos con un
  // spinner — eso es lo que se sentía como recarga/flasheo en cada acción).
  const sesionCargadaIdRef = useRef<number | null>(null);

  // Si el WebSocket se cae (comun al minimizar el WebView de Telegram) supabase-js
  // reconecta el socket solo, pero los cambios ocurridos mientras estuvo desconectado
  // NO se reenvian (postgres_changes no tiene replay) — la UI queda congelada aunque
  // el canal ya este "conectado" de nuevo. Al volver a foco, forzamos un refetch real.
  useEffect(() => {
    if (!sesionId) return;

    const revisar = () => {
      if (document.visibilityState === 'visible') {
        setIntentoCombate((c) => c + 1);
      }
    };

    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('focus', revisar);

    return () => {
      document.removeEventListener('visibilitychange', revisar);
      window.removeEventListener('focus', revisar);
    };
  }, [sesionId]);


  useEffect(() => {
    if (!sesionId) return;

    let activo = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const esPrimeraCargaDeEstaSesion = sesionCargadaIdRef.current !== sesionId;

    const cargar = async () => {
      if (esPrimeraCargaDeEstaSesion) {
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
            .from('combat_sesiones')
            .select(
              'id, tipo, estado, turno_actual, ronda, oleada_actual, oleadas, votacion_huida',
            )
            .eq('id', sesionId)
            .abortSignal(controller.signal)
            .single(),

          supabase
            .from('combat_combatientes')
            .select('*')
            .eq('sesion_id', sesionId)
            .order('orden')
            .abortSignal(controller.signal),

          supabase
            .from('combat_log')
            .select('*')
            .eq('sesion_id', sesionId)
            .order('creado_en', { ascending: true })
            .limit(50)
            .abortSignal(controller.signal),

          supabase
            .from('character_powers')
            .select(
              'powers(id, nombre, icono, costo_pm_base, parametros, tipo)',
            )
            .eq('telegram_id', perfil.telegram_id)
            .abortSignal(controller.signal),
        ]);

        if (!activo) return;

        if (sesionRes.error || !sesionRes.data) {
          throw new Error(
            'No se encontró la sesión de combate. Puede que ya haya terminado.',
          );
        }

        setSesion(sesionRes.data as Sesion);

        if (combatientesRes.data) {
          setCombatientes(combatientesRes.data as Combatiente[]);
        }

        if (logRes.data) {
          setLog(logRes.data as LogEntry[]);
        }

        if (poderesRes.data) {
          const activos = poderesRes.data
            .map((row: any) => row.powers)
            .filter((p: any) => p && p.tipo === 'activo');

          setPoderes(activos as Poder[]);
        }

        sesionCargadaIdRef.current = sesionId;
      } catch (err: any) {
        if (!activo) return;

        const timedOut = err?.name === 'AbortError';

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
  }, [sesionId, perfil.telegram_id, intentoCombate]);

  // --- Suscripción realtime ---
  useEffect(() => {
    if (!sesionId) return;

    const canal = supabase
      .channel(`combate-${sesionId}`)

      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'combat_sesiones',
          filter: `id=eq.${sesionId}`,
        },
        (payload) => {
          // El estado de combatientes ya se mantiene al día con el handler
          // incremental de más abajo (evento '*' sobre combat_combatientes) —
          // este handler solo necesita actualizar la sesión, no volver a pedir
          // toda la lista de combatientes en cada turno.
          setSesion((prev) =>
            prev
              ? { ...prev, ...payload.new }
              : (payload.new as Sesion),
          );
        },
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'combat_combatientes',
          filter: `sesion_id=eq.${sesionId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') return;

          const nuevo = payload.new as Combatiente;

          setCombatientes((prev) => {
            const existe = prev.some(
              (c) => c.id === nuevo.id,
            );

            return existe
              ? prev.map((c) =>
                  c.id === nuevo.id
                    ? { ...c, ...nuevo }
                    : c,
                )
              : [...prev, nuevo].sort(
                  (a, b) =>
                    (a.orden ?? 0) - (b.orden ?? 0),
                );
          });
        },
      )

      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'combat_log',
          filter: `sesion_id=eq.${sesionId}`,
        },
        (payload) => {
          const nuevaEntrada = payload.new as LogEntry;

          setLog((prev) => {
            if (prev.some((entrada) => entrada.id === nuevaEntrada.id)) {
              return prev;
            }

            return [...prev, nuevaEntrada];
          });
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [sesionId]);

  useEffect(() => {
    setPoderSeleccionado(null);
    setAccionArma(false);
  }, [sesion?.turno_actual, sesion?.ronda]);

  // Agrupa el log por acción.
  const grupos = useMemo<Grupo[]>(() => {
    const raices = log.filter(
      (entrada) => entrada.padre_id == null,
    );

    return raices.map((raiz) => ({
      raiz,
      ramas: log.filter(
        (entrada) => entrada.padre_id === raiz.id,
      ),
    }));
  }, [log]);

  // Procesa una acción cada vez.
  const procesarColaGrupos = () => {
    const siguiente = colaGruposRef.current.shift();

    if (!siguiente) {
      procesandoGruposRef.current = false;
      setLogAlDia(true);
      return;
    }

    procesandoGruposRef.current = true;

    setGruposVisibles((prev) => [
      ...prev,
      siguiente,
    ]);

    const actor = combatientes.find(
      (c) =>
        c.id === siguiente.raiz.combatiente_id,
    );

    const demora =
      actor?.tipo === 'jugador'
        ? DEMORA_JUGADOR_MIN +
          Math.random() *
            (DEMORA_JUGADOR_MAX - DEMORA_JUGADOR_MIN)
        : actor?.tipo === 'enemigo'
          ? DEMORA_ENEMIGO
          : DEMORA_DEFECTO;

    setTimeout(procesarColaGrupos, demora);
  };

  useEffect(() => {
    if (grupos.length === 0) return;

    if (cargaInicialLogRef.current) {
      cargaInicialLogRef.current = false;

      grupos.forEach((g) =>
        gruposVistosRef.current.add(g.raiz.id),
      );

      setGruposVisibles(grupos);
      return;
    }

    /*
     * IMPORTANTE:
     *
     * El backend inserta primero la raíz de una acción y después sus ramas.
     * Ejemplo:
     *
     * 1274 -> "Hrakkar atacó con su arma a Ernesh."
     * 1275 -> "Se produjo 2 de daño sobre Ernesh."
     *
     * Ambas entradas pueden llegar por realtime en eventos INSERT separados.
     *
     * Antes, cuando llegaba la raíz, el grupo se guardaba en
     * gruposVisibles con ramas=[] y después gruposVistosRef impedía
     * volver a introducirlo. Por eso desaparecían precisamente los
     * números de daño del combate en vivo.
     *
     * Ahora primero sincronizamos las ramas de los grupos que ya están
     * visibles con el log actual.
     */
    setGruposVisibles((prev) =>
      prev.map((visible) => {
        const actualizado = grupos.find(
          (g) => g.raiz.id === visible.raiz.id,
        );

        return actualizado ?? visible;
      }),
    );

    const nuevos = grupos.filter(
      (g) =>
        !gruposVistosRef.current.has(g.raiz.id),
    );

    if (nuevos.length === 0) return;

    nuevos.forEach((g) =>
      gruposVistosRef.current.add(g.raiz.id),
    );

    colaGruposRef.current.push(...nuevos);
    setLogAlDia(false);

    if (!procesandoGruposRef.current) {
      procesarColaGrupos();
    }
  }, [grupos]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [gruposVisibles]);

  if (!sesionId && perfil.estado !== 'en_cola') {
    return null;
  }

  const miCombatiente = combatientes.find(
    (c) =>
      c.telegram_id === perfil.telegram_id,
  );

  const esMiTurno =
    !!sesion &&
    !!miCombatiente &&
    miCombatiente.orden === sesion.turno_actual &&
    sesion.estado === 'en_curso';

  // No alcanza con que el backend diga que es tu turno: la botonera espera a que
  // termine de narrarse la ronda anterior (efectos, daño, etc. en la cola con demora),
  // para que no se superpongan acciones nuevas con texto de rondas pasadas.
  const puedoActuar = esMiTurno && logAlDia;

  const poderesDisponibles = poderes.filter(
    (p) =>
      !(
        (miCombatiente?.cooldowns?.[p.id] ?? 0) > 0
      ),
  );

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
    if (!sesionId || enviando) return;

    setEnviando(true);

    const { data, error } = await supabase.rpc(
      'combat_ejecutar_accion',
      {
        p_sesion_id: sesionId,
        p_telegram_id: perfil.telegram_id,
        p_accion: accion,
        p_power_id: poderId ?? null,
        p_objetivo_id: objetivoId ?? null,
        p_voto: voto ?? null,
      },
    );

    setEnviando(false);

    if (error || !data?.ok) {
      console.error(
        'Error ejecutando acción:',
        error || data,
      );
      return;
    }

    setPoderSeleccionado(null);
    setAccionArma(false);
  };

  const tocarPoder = (poder: Poder) => {
    const cat = categoriaObjetivo(poder);

    if (cat === null) {
      ejecutar('poder', poder.id);
      return;
    }

    if (
      cat === 'area_enemigos' ||
      cat === 'area_aliados' ||
      cat === 'area_todos'
    ) {
      // AoE: el poder ya va a "todos" por diseño, no hay nada que elegir.
      ejecutar('poder', poder.id);
      return;
    }

    // Objetivo unico: si solo queda un blanco posible, no tiene sentido
    // pedir que lo elijan — se dispara directo contra ese.
    const objetivos = objetivosPara(cat);
    if (objetivos.length === 1) {
      ejecutar('poder', poder.id, objetivos[0].id);
      return;
    }

    setPoderSeleccionado(poder);
  };

  // --- Render: cola ---
  if (
    perfil.estado === 'en_cola' &&
    !sesionId
  ) {
    return (
      <div
        className="d-flex flex-column vh-100"
        style={{
          backgroundColor: theme.bg,
          color: theme.text,
        }}
      >
        <header
          className="py-3 px-3 text-center"
          style={{
            backgroundColor: theme.headerBg,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span
            className="fw-bold"
            style={{
              fontFamily: 'var(--font-display)',
            }}
          >
            {perfil.nombre_personaje}
          </span>
        </header>

        <main
          className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3"
          style={{
            fontFamily: 'var(--font-body)',
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
                  fontFamily: 'var(--font-body)',
                }}
                onClick={() =>
                  setIntentoCola((n) => n + 1)
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
                  fontSize: '3rem',
                  color: theme.accent,
                }}
              />

              <h4
                className="mt-3"
                style={{
                  fontFamily: 'var(--font-display)',
                }}
              >
                {colaNivelJefe
                  ? `Mini jefe de nivel ${colaNivelJefe}`
                  : 'Buscando encuentro...'}
              </h4>

              <p
                className="fs-4"
                style={{
                  color: theme.accent,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {colaCount}/5
              </p>
            </>
          )}
        </main>

        <footer
          className="d-flex align-items-center justify-content-center gap-2"
          style={{
            backgroundColor: theme.footerBg,
            borderTop: `1px solid ${theme.border}`,
            minHeight: '70px',
            fontFamily: 'var(--font-body)',
          }}
        >
          <i
            className="bi bi-arrow-repeat spin-icon fs-4"
            style={{
              color: theme.accent,
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
          backgroundColor: theme.bg,
          color: theme.text,
          fontFamily: 'var(--font-body)',
        }}
      >
        <p className="mb-3">
          {errorCarga}
        </p>

        <button
          className="btn btn-outline-light"
          onClick={() =>
            setIntentoCombate((n) => n + 1)
          }
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (cargando || !sesion) {
    return (
      <div
        className="d-flex align-items-center justify-content-center vh-100"
        style={{
          backgroundColor: theme.bg,
          color: theme.text,
        }}
      >
        <div
          className="spinner-border"
          role="status"
        />
      </div>
    );
  }

  const vivos = combatientes
    .filter((c) => c.vivo)
    .sort(
      (a, b) =>
        (a.orden ?? 0) - (b.orden ?? 0),
    );

  const combateTerminado =
    sesion.estado !== 'en_curso';

  if (combateTerminado && !resultadoCerrado) {
    const yo = combatientes.find((c) => c.telegram_id === perfil.telegram_id);
    const gano = sesion.estado === 'victoria';
    const titulo = gano ? '🏆 ¡Victoria!' : sesion.estado === 'derrota' ? '💀 Derrota' : 'Encuentro cancelado';

    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center text-center px-4"
        style={{
          minHeight: '100vh',
          backgroundColor: theme.bg,
          color: theme.text,
          fontFamily: 'var(--font-body)',
        }}
      >
        <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          {titulo}
        </h2>

        {yo && (
          <div className="mb-4" style={{ opacity: 0.9 }}>
            <div>
              <i className="bi bi-lightning-charge me-2" />
              Daño realizado: <strong>{yo.dano_realizado}</strong>
            </div>
            <div>
              <i className="bi bi-shield-shaded me-2" />
              Daño recibido: <strong>{yo.dano_recibido}</strong>
            </div>
          </div>
        )}

        {resultadoArena && (
          <div className="mb-4 d-flex flex-column gap-2" style={{ minWidth: '220px' }}>
            {resultadoArena.posicion != null && (
              <div>
                <i className="bi bi-award me-2" />
                Rango #{resultadoArena.posicion}
                {resultadoArena.cambio != null && resultadoArena.cambio !== 0 && (
                  <span
                    className="ms-2"
                    style={{ color: resultadoArena.cambio > 0 ? '#4caf50' : '#e05353' }}
                  >
                    <i className={`bi bi-arrow-${resultadoArena.cambio > 0 ? 'up' : 'down'}`} />
                    {Math.abs(resultadoArena.cambio)}
                  </span>
                )}
              </div>
            )}
            {resultadoArena.elo_delta != null && (
              <div>
                Elo: {resultadoArena.elo_delta >= 0 ? '+' : ''}
                {resultadoArena.elo_delta}
              </div>
            )}
            <div>
              <i className="bi bi-ticket-detailed me-2" />
              Aura: +{resultadoArena.aura_ganada}
            </div>
            <div>
              <i className="bi bi-star me-2" />
              XP: +{resultadoArena.xp}
            </div>
          </div>
        )}

        <button
          className="btn rounded-circle d-flex align-items-center justify-content-center mt-2"
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: theme.accent,
            border: 'none',
          }}
          onClick={cerrarResultado}
        >
          <i className="bi bi-check-lg" style={{ fontSize: '1.8rem' }} />
        </button>
      </div>
    );
  }

  const accionActiva:
    | {
        tipo: 'poder' | 'golpe';
        poder?: Poder;
      }
    | null = accionArma
    ? { tipo: 'golpe' }
    : poderSeleccionado
      ? {
          tipo: 'poder',
          poder: poderSeleccionado,
        }
      : null;

  const categoria: Categoria =
    accionActiva?.tipo === 'golpe'
      ? 'enemigo'
      : accionActiva?.poder
        ? categoriaObjetivo(
            accionActiva.poder,
          )
        : null;

  const objetivosPara = (cat: Categoria) =>
    cat === 'enemigo' || cat === 'area_enemigos'
      ? combatientes.filter(
          (c) =>
            c.bando !==
              miCombatiente?.bando &&
            c.vivo,
        )
      : cat === 'aliado' || cat === 'area_aliados'
        ? combatientes.filter(
            (c) =>
              c.bando ===
                miCombatiente?.bando &&
              c.vivo,
          )
        : cat === 'area_todos'
          ? combatientes.filter(
              (c) => c.vivo,
            )
          : [];

  const objetivosPosibles = objetivosPara(categoria);

  const seleccionarObjetivo = (
    objetivoId: number,
  ) => {
    if (!accionActiva) return;

    if (accionActiva.tipo === 'golpe') {
      ejecutar(
        'golpe',
        undefined,
        objetivoId,
      );
    } else {
      ejecutar(
        'poder',
        accionActiva.poder!.id,
        objetivoId,
      );
    }
  };

  return (
    <div
      className="d-flex flex-column vh-100"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {/* Encabezado */}
      <header
        className="py-2 px-2"
        style={{
          backgroundColor: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div
          className="d-flex align-items-center"
          style={{ gap: '0.6rem' }}
        >
          <span
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: '34px',
              height: '34px',
              border: `2px solid ${theme.border}`,
              fontWeight: 'bold',
              fontFamily: 'var(--font-display)',
            }}
          >
            {sesion.ronda}
          </span>

          <div
            className="d-flex flex-grow-1"
            style={{
              gap: '0.35rem',
              overflowX: 'auto',
              paddingBottom: '2px',
            }}
          >
            {vivos.map((c) => {
              const esTurno =
                c.orden ===
                sesion.turno_actual;

              const yaJugo =
                (c.orden ?? 0) <
                sesion.turno_actual;

              const fill = esTurno
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
                  title={c.nombre}
                  className="rounded-circle flex-shrink-0 position-relative"
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: fill,
                    border: `2px solid ${borde}`,
                  }}
                >
                  {esTurno && (
                    <i
                      className="bi bi-flag-fill position-absolute"
                      style={{
                        fontSize: '0.6rem',
                        top: '-6px',
                        right: '-4px',
                        color: theme.accent,
                      }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* PS / PM */}
        <div
          className="d-flex flex-shrink-0"
          style={{
            width: '28px',
            gap: '4px',
            padding: '10px 6px',
          }}
        >
          {miCombatiente && (
            <>
              <div
                className="d-flex align-items-end"
                style={{
                  width: '8px',
                  height: '100%',
                  backgroundColor:
                    'rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    backgroundColor: '#c0392b',
                    height: `${
                      miCombatiente.ps_max > 0
                        ? (miCombatiente.ps_actual /
                            miCombatiente.ps_max) *
                          100
                        : 0
                    }%`,
                    transition:
                      'height 0.3s ease',
                  }}
                />
              </div>

              <div
                className="d-flex align-items-end"
                style={{
                  width: '8px',
                  height: '100%',
                  backgroundColor:
                    'rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    backgroundColor: '#2980b9',
                    height: `${
                      miCombatiente.pm_max > 0
                        ? (miCombatiente.pm_actual /
                            miCombatiente.pm_max) *
                          100
                        : 0
                    }%`,
                    transition:
                      'height 0.3s ease',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Centro: log */}
        {/* Centro: log */}
        <div
          ref={logRef}
          className="flex-grow-1 overflow-auto px-2 py-2"
          style={{
            fontSize: '0.9rem',
            fontFamily: 'var(--font-body)',
          }}
        >
          {log.length === 0 && (
            <p className="text-secondary text-center mt-4">
              El combate está por comenzar...
            </p>
          )}

          {gruposVisibles.map(
            ({ raiz, ramas }) => (
              <div
                key={raiz.id}
                className="mb-2"
              >
                <p className="mb-0">
                  <span className="text-secondary">
                    R{raiz.turno}
                  </span>{' '}
                  — {renderDescripcionLog(raiz.descripcion, raiz.es_critico)}
                </p>

                {ramas.map((rama) => (
                  <p
                    key={rama.id}
                    className="mb-0 ps-3"
                    style={{
                      opacity: 0.85,
                    }}
                  >
                    <span className="text-secondary">
                      |-
                    </span>{' '}
                    {renderDescripcionLog(rama.descripcion, rama.es_critico)}
                  </p>
                ))}
              </div>
            ),
          )}

          {combateTerminado && (
            <h4
              className="text-center mt-3"
              style={{
                fontFamily:
                  'var(--font-display)',
              }}
            >
              {sesion.estado ===
              'victoria'
                ? '🏆 ¡Victoria!'
                : sesion.estado ===
                    'derrota'
                  ? '💀 Derrota'
                  : 'Encuentro cancelado'}
            </h4>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: theme.footerBg,
          borderTop: `1px solid ${theme.border}`,
          minHeight: '150px',
          padding: '8px',
          fontFamily: 'var(--font-body)',
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
                disabled={enviando}
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
                  width: '3rem',
                  height: '3rem',
                  border: `1px solid ${theme.text}`,
                  color: theme.text,
                  backgroundColor:
                    'transparent',
                }}
                title="No huir"
              >
                <i className="bi bi-x-lg fs-5" />
              </button>

              <button
                disabled={enviando}
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
                  width: '3rem',
                  height: '3rem',
                  border: `1px solid ${theme.accent}`,
                  color: theme.accent,
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
              style={{ color: theme.accent }}
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
                    )?.nombre ?? '...'
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
                  setPoderSeleccionado(null);
                  setAccionArma(false);
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: '6px',
                }}
              >
                {objetivosPosibles
                  .slice(0, 4)
                  .map((obj) => (
                    <button
                      key={obj.id}
                      disabled={enviando}
                      onClick={() =>
                        seleccionarObjetivo(
                          obj.id,
                        )
                      }
                      className="btn btn-outline-light text-start p-2"
                      style={{
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>{obj.nombre}</div>

                      <MiniBarra
                        actual={obj.ps_actual}
                        max={obj.ps_max}
                        color="#c0392b"
                      />

                      {obj.tipo === 'jugador' && (
                        <MiniBarra
                          actual={obj.pm_actual}
                          max={obj.pm_max}
                          color="#2980b9"
                        />
                      )}
                    </button>
                  ))}

                {objetivosPosibles.length >
                  4 && (
                  <button
                    disabled={enviando}
                    onClick={() =>
                      seleccionarObjetivo(
                        objetivosPosibles[4]
                          .id,
                      )
                    }
                    className="btn btn-outline-light text-start p-2"
                    style={{
                      gridColumn:
                        '1 / -1',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      {
                        objetivosPosibles[4]
                          .nombre
                      }
                    </div>

                    <MiniBarra
                      actual={
                        objetivosPosibles[4]
                          .ps_actual
                      }
                      max={
                        objetivosPosibles[4]
                          .ps_max
                      }
                      color="#c0392b"
                    />

                    {objetivosPosibles[4].tipo ===
                      'jugador' && (
                      <MiniBarra
                        actual={
                          objetivosPosibles[4]
                            .pm_actual
                        }
                        max={
                          objetivosPosibles[4]
                            .pm_max
                        }
                        color="#2980b9"
                      />
                    )}
                  </button>
                )}
              </div>
          </div>
        ) : (
          // --- Selección de poder / arma / inventario / huir ---
          <div
            className="d-flex h-100"
            style={{ gap: '8px' }}
          >
            <div
              className="flex-grow-1"
              style={{
                display: 'grid',
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
                  {poderes.length === 0
                    ? 'Sin poderes activos'
                    : 'Todos en enfriamiento'}
                </div>
              )}

              {poderesDisponibles.map(
                (poder) => {
                  const costoMana =
                    costoManaPoder(
                      poder.costo_pm_base,
                      miCombatiente?.nivel ?? 1,
                    );

                  return (
                    <button
                      key={poder.id}
                      disabled={enviando}
                      onClick={() =>
                        tocarPoder(poder)
                      }
                      className="btn btn-outline-light d-flex flex-column align-items-center justify-content-center"
                      style={{
                        position: 'relative',
                      }}
                    >
                      {costoMana !== null && (
                        <span
                          style={{
                            position:
                              'absolute',
                            top: '3px',
                            right: '4px',
                            display: 'flex',
                            alignItems:
                              'center',
                            gap: '2px',
                            fontSize: '0.65rem',
                            lineHeight: 1,
                            color: '#2980b9',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius:
                                '50%',
                              backgroundColor:
                                '#2980b9',
                              boxShadow:
                                '0 0 4px #2980b9',
                            }}
                          />
                          {costoMana}
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
                          fontSize: '0.7rem',
                        }}
                      >
                        {poder.nombre}
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
                width: '70px',
              }}
            >
              <button
                disabled={enviando}
                onClick={() => {
                  const objetivos = objetivosPara('enemigo');
                  if (objetivos.length === 1) {
                    ejecutar('golpe', undefined, objetivos[0].id);
                  } else {
                    setAccionArma(true);
                  }
                }}
                className="btn btn-outline-light flex-grow-1"
              >
                <i className="bi bi-hammer" />
              </button>

              <button
                disabled={enviando}
                onClick={() =>
                  alert(
                    'Inventario aún no disponible.',
                  )
                }
                className="btn btn-outline-light flex-grow-1"
              >
                <i className="bi bi-bag" />
              </button>

              <button
                disabled={enviando}
                onClick={() =>
                  ejecutar('huir')
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