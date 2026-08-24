import { useState, useEffect, useRef } from 'react';
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
}

interface Sesion {
  id: number;
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
}

interface LogEntry {
  id: number;
  turno: number;
  descripcion: string;
  creado_en: string;
  padre_id: number | null;
}

interface Poder {
  id: number;
  nombre: string;
  icono: string;
  parametros: { efectos: Array<{ trigger: string; target: string }> };
}

type Categoria = 'enemigo' | 'aliado' | 'area_enemigos' | 'area_aliados' | 'area_todos' | null;

function categoriaObjetivo(poder: Poder): Categoria {
  const onUse = (poder.parametros?.efectos ?? []).filter((e) => e.trigger === 'on_use');
  const targets = new Set(onUse.map((e) => e.target));
  if (targets.has('todos_en_combate')) return 'area_todos';
  if (targets.has('todos_enemigos')) return 'area_enemigos';
  if (targets.has('todos_aliados')) return 'area_aliados';
  if (targets.has('enemigo')) return 'enemigo';
  if (targets.has('aliado_objetivo')) return 'aliado';
  return null; // self / aliado_aleatorio: no requiere selección
}

const MiniBarra = ({ actual, max, color }: { actual: number; max: number; color: string }) => (
  <div className="progress-custom" style={{ height: '4px' }}>
    <div
      className="bar"
      style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (actual / max) * 100)) : 0}%`, backgroundColor: color }}
    />
  </div>
);

export const CombatView = ({ perfil }: CombatViewProps) => {
  const theme = getTheme(perfil.zona);
  const sesionId = perfil.sesion_combate_id;

  // Aplica las fuentes de zona al montar, por si el jugador llegó directo a
  // en_cola/en_combate sin pasar por Registro (donde se setean normalmente).
  useEffect(() => {
    document.documentElement.style.setProperty('--font-display', theme.fontDisplay);
    document.documentElement.style.setProperty('--font-body', theme.fontBody);
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
  const [poderSeleccionado, setPoderSeleccionado] = useState<Poder | null>(null);
  const [accionArma, setAccionArma] = useState(false); // true = eligiendo objetivo para "golpe con arma"
  const logRef = useRef<HTMLDivElement>(null);

  // Cargar cola (mientras estado === 'en_cola')
  const [errorCola, setErrorCola] = useState<string | null>(null);
  const [intentoCola, setIntentoCola] = useState(0);
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
          .select('encounter_id, mini_boss_encounters!inner(nivel_jefe, estado)')
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
        const encuentro = colaRow.mini_boss_encounters as unknown as { nivel_jefe: number } | null;
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
        setErrorCola(timedOut ? 'La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.' : err.message);
      } finally {
        clearTimeout(timeoutId);
      }
    };
    cargar();
    return () => { activo = false; controller.abort(); clearTimeout(timeoutId); };
  }, [perfil.estado, perfil.telegram_id, intentoCola]);

  useEffect(() => {
    if (!colaEncounterId) return;
    const canal = supabase
      .channel(`cola-${colaEncounterId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mini_boss_queue', filter: `encounter_id=eq.${colaEncounterId}` },
        () => setColaCount((c) => c + 1))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [colaEncounterId]);

  // Cargar combate (mientras estado === 'en_combate')
  const [intentoCombate, setIntentoCombate] = useState(0);
  useEffect(() => {
    if (!sesionId) return;
    let activo = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const cargar = async () => {
      setCargando(true);
      setErrorCarga(null);
      try {
        const [sesionRes, combatientesRes, logRes, poderesRes] = await Promise.all([
          supabase.from('combat_sesiones').select('id, estado, turno_actual, ronda, oleada_actual, oleadas, votacion_huida').eq('id', sesionId).abortSignal(controller.signal).single(),
          supabase.from('combat_combatientes').select('*').eq('sesion_id', sesionId).order('orden').abortSignal(controller.signal),
          supabase.from('combat_log').select('*').eq('sesion_id', sesionId).order('creado_en', { ascending: true }).limit(50).abortSignal(controller.signal),
          supabase.from('character_powers').select('powers(id, nombre, icono, parametros, tipo)').eq('telegram_id', perfil.telegram_id).abortSignal(controller.signal),
        ]);
        if (!activo) return;

        if (sesionRes.error || !sesionRes.data) {
          throw new Error('No se encontró la sesión de combate. Puede que ya haya terminado.');
        }
        setSesion(sesionRes.data as Sesion);
        if (combatientesRes.data) setCombatientes(combatientesRes.data as Combatiente[]);
        if (logRes.data) setLog(logRes.data as LogEntry[]);
        if (poderesRes.data) {
          const activos = poderesRes.data
            .map((row: any) => row.powers)
            .filter((p: any) => p && p.tipo === 'activo');
          setPoderes(activos as Poder[]);
        }
      } catch (err: any) {
        if (!activo) return;
        const timedOut = err?.name === 'AbortError';
        setErrorCarga(timedOut ? 'La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.' : err.message);
      } finally {
        clearTimeout(timeoutId);
        if (activo) setCargando(false);
      }
    };
    cargar();
    return () => { activo = false; controller.abort(); clearTimeout(timeoutId); };
  }, [sesionId, perfil.telegram_id, intentoCombate]);

  useEffect(() => {
    if (!sesionId) return;
    const canal = supabase
      .channel(`combate-${sesionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'combat_sesiones', filter: `id=eq.${sesionId}` },
        (payload) => {
          setSesion((prev) => (prev ? { ...prev, ...payload.new } : (payload.new as Sesion)));
          // El cambio de turno puede venir junto con un recalculo de orden (nueva oleada),
          // que llega como eventos separados de combat_combatientes. Para evitar depender
          // de la carrera entre ambos streams, se refresca el orden real desde el servidor.
          supabase
            .from('combat_combatientes')
            .select('*')
            .eq('sesion_id', sesionId)
            .then(({ data }) => {
              if (data) setCombatientes(data.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
            });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combat_combatientes', filter: `sesion_id=eq.${sesionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const nuevo = payload.new as Combatiente;
          setCombatientes((prev) => {
            const existe = prev.some((c) => c.id === nuevo.id);
            return existe
              ? prev.map((c) => (c.id === nuevo.id ? { ...c, ...nuevo } : c))
              : [...prev, nuevo].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          });
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'combat_log', filter: `sesion_id=eq.${sesionId}` },
        (payload) => setLog((prev) => [...prev, payload.new as LogEntry]))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [sesionId]);

  // Cuando llega mi turno o entra una acción nueva, siempre vuelvo a la botonera de poderes
  useEffect(() => {
    setPoderSeleccionado(null);
    setAccionArma(false);
  }, [sesion?.turno_actual, sesion?.ronda]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log]);

  if (!sesionId && perfil.estado !== 'en_cola') return null;

  const miCombatiente = combatientes.find((c) => c.telegram_id === perfil.telegram_id);
  const esMiTurno = !!sesion && !!miCombatiente && miCombatiente.orden === sesion.turno_actual && sesion.estado === 'en_curso';
  const poderesDisponibles = poderes.filter((p) => !((miCombatiente?.cooldowns?.[p.id] ?? 0) > 0));

  const ejecutar = async (accion: 'poder' | 'golpe' | 'huir' | 'votar_huida', poderId?: number, objetivoId?: number, voto?: boolean) => {
    if (!sesionId || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc('combat_ejecutar_accion', {
      p_sesion_id: sesionId,
      p_telegram_id: perfil.telegram_id,
      p_accion: accion,
      p_power_id: poderId ?? null,
      p_objetivo_id: objetivoId ?? null,
      p_voto: voto ?? null,
    });
    setEnviando(false);
    if (error || !data?.ok) {
      console.error('Error ejecutando acción:', error || data);
      return;
    }
    setPoderSeleccionado(null);
    setAccionArma(false);
  };

  const tocarPoder = (poder: Poder) => {
    const cat = categoriaObjetivo(poder);
    if (cat === null) {
      ejecutar('poder', poder.id); // self / aliado_aleatorio: sin selección
    } else if (cat === 'area_enemigos' || cat === 'area_aliados' || cat === 'area_todos') {
      setPoderSeleccionado(poder); // sigue mostrando botonera de objetivos, pero con [Todos]
    } else {
      setPoderSeleccionado(poder);
    }
  };

  // --- Render: en_cola ---
  if (perfil.estado === 'en_cola' && !sesionId) {
    return (
      <div className="d-flex flex-column vh-100" style={{ backgroundColor: theme.bg, color: theme.text }}>
        <header className="py-3 px-3 text-center" style={{ backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
          <span className="fw-bold" style={{ fontFamily: 'var(--font-display)' }}>{perfil.nombre_personaje}</span>
        </header>
        <main className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3" style={{ fontFamily: 'var(--font-body)' }}>
          {errorCola ? (
            <>
              <p className="mb-3">{errorCola}</p>
              <button className="btn btn-outline-light" style={{ fontFamily: 'var(--font-body)' }} onClick={() => setIntentoCola((n) => n + 1)}>
                Reintentar
              </button>
            </>
          ) : (
            <>
              <i className="bi bi-exclamation-diamond-fill" style={{ fontSize: '3rem', color: theme.accent }}></i>
              <h4 className="mt-3" style={{ fontFamily: 'var(--font-display)' }}>{colaNivelJefe ? `Mini jefe de nivel ${colaNivelJefe}` : 'Buscando encuentro...'}</h4>
              <p className="fs-4" style={{ color: theme.accent, fontFamily: 'var(--font-display)' }}>{colaCount}/5</p>
            </>
          )}
        </main>
        <footer className="d-flex align-items-center justify-content-center gap-2" style={{ backgroundColor: theme.footerBg, borderTop: `1px solid ${theme.border}`, minHeight: '70px', fontFamily: 'var(--font-body)' }}>
          <i className="bi bi-arrow-repeat spin-icon fs-4" style={{ color: theme.accent }}></i>
          <span>Esperando otros...</span>
        </footer>
      </div>
    );
  }

  // --- Render: en_combate ---
  if (errorCarga) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100 text-center px-3" style={{ backgroundColor: theme.bg, color: theme.text, fontFamily: 'var(--font-body)' }}>
        <p className="mb-3">{errorCarga}</p>
        <button className="btn btn-outline-light" style={{ fontFamily: 'var(--font-body)' }} onClick={() => setIntentoCombate((n) => n + 1)}>
          Reintentar
        </button>
      </div>
    );
  }

  if (cargando || !sesion) {
    return (
      <div className="d-flex align-items-center justify-content-center vh-100" style={{ backgroundColor: theme.bg, color: theme.text }}>
        <div className="spinner-border" role="status" />
      </div>
    );
  }

  const vivos = combatientes.filter((c) => c.vivo).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const combateTerminado = sesion.estado !== 'en_curso';

  // Objetivos válidos según lo que pide el poder/arma seleccionados
  const accionActiva: { tipo: 'poder' | 'golpe'; poder?: Poder } | null = accionArma
    ? { tipo: 'golpe' }
    : poderSeleccionado
      ? { tipo: 'poder', poder: poderSeleccionado }
      : null;

  const categoria: Categoria = accionActiva?.tipo === 'golpe' ? 'enemigo' : accionActiva?.poder ? categoriaObjetivo(accionActiva.poder) : null;

  const objetivosPosibles =
    categoria === 'enemigo' || categoria === 'area_enemigos'
      ? combatientes.filter((c) => c.tipo === 'enemigo' && c.vivo)
      : categoria === 'aliado' || categoria === 'area_aliados'
        ? combatientes.filter((c) => c.tipo === 'jugador' && c.vivo)
        : categoria === 'area_todos'
          ? combatientes.filter((c) => c.vivo)
          : [];

  const esArea = categoria === 'area_enemigos' || categoria === 'area_aliados' || categoria === 'area_todos';

  const seleccionarObjetivo = (objetivoId: number) => {
    if (!accionActiva) return;
    if (accionActiva.tipo === 'golpe') ejecutar('golpe', undefined, objetivoId);
    else ejecutar('poder', accionActiva.poder!.id, objetivoId);
  };

  const usarArea = () => {
    if (!accionActiva?.poder) return;
    // El backend resuelve "todos" solo, no necesita un id de objetivo puntual.
    ejecutar('poder', accionActiva.poder.id);
  };

  return (
    <div className="d-flex flex-column vh-100" style={{ backgroundColor: theme.bg, color: theme.text }}>
      {/* Encabezado: ronda + bolitas de turno */}
      <header className="py-2 px-2" style={{ backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
        <div className="d-flex align-items-center" style={{ gap: '0.6rem' }}>
          <span
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: '34px', height: '34px', border: `2px solid ${theme.border}`, fontWeight: 'bold', fontFamily: 'var(--font-display)' }}
          >
            {sesion.ronda}
          </span>
          <div className="d-flex flex-grow-1" style={{ gap: '0.35rem', overflowX: 'auto', paddingBottom: '2px' }}>
            {vivos.map((c) => {
              const esTurno = c.orden === sesion.turno_actual;
              const yaJugo = (c.orden ?? 0) < sesion.turno_actual;
              const fill = esTurno ? '#4caf50' : yaJugo ? '#c0392b' : '#f0c419';
              const borde = c.tipo === 'jugador' ? '#4caf50' : '#c0392b';
              return (
                <span
                  key={c.id}
                  title={c.nombre}
                  className="rounded-circle flex-shrink-0 position-relative"
                  style={{ width: '24px', height: '24px', backgroundColor: fill, border: `2px solid ${borde}` }}
                >
                  {esTurno && (
                    <i
                      className="bi bi-flag-fill position-absolute"
                      style={{ fontSize: '0.6rem', top: '-6px', right: '-4px', color: theme.accent }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* Lateral: gauges PS/PM propios */}
        <div className="d-flex flex-shrink-0" style={{ width: '28px', gap: '4px', padding: '10px 6px' }}>
          {miCombatiente && (
            <>
              <div className="d-flex align-items-end" style={{ width: '8px', height: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '100%', backgroundColor: '#c0392b', height: `${miCombatiente.ps_max > 0 ? (miCombatiente.ps_actual / miCombatiente.ps_max) * 100 : 0}%`, transition: 'height 0.3s ease' }} />
              </div>
              <div className="d-flex align-items-end" style={{ width: '8px', height: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '100%', backgroundColor: '#2980b9', height: `${miCombatiente.pm_max > 0 ? (miCombatiente.pm_actual / miCombatiente.pm_max) * 100 : 0}%`, transition: 'height 0.3s ease' }} />
              </div>
            </>
          )}
        </div>

        {/* Centro: log */}
        <div ref={logRef} className="flex-grow-1 overflow-auto px-2 py-2" style={{ fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>
          {log.length === 0 && <p className="text-secondary text-center mt-4">El combate está por comenzar...</p>}
          {log
            .filter((entrada) => entrada.padre_id == null)
            .map((raiz) => {
              const ramas = log.filter((entrada) => entrada.padre_id === raiz.id);
              return (
                <div key={raiz.id} className="mb-2">
                  <p className="mb-0">
                    <span className="text-secondary">R{raiz.turno}</span> — {raiz.descripcion}
                  </p>
                  {ramas.map((rama) => (
                    <p key={rama.id} className="mb-0 ps-3" style={{ opacity: 0.85 }}>
                      <span className="text-secondary">|-</span> {rama.descripcion}
                    </p>
                  ))}
                </div>
              );
            })}
          {combateTerminado && (
            <h4 className="text-center mt-3" style={{ fontFamily: 'var(--font-display)' }}>
              {sesion.estado === 'victoria' ? '🏆 ¡Victoria!' : sesion.estado === 'derrota' ? '💀 Derrota' : 'Encuentro cancelado'}
            </h4>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer style={{ backgroundColor: theme.footerBg, borderTop: `1px solid ${theme.border}`, minHeight: '150px', padding: '8px', fontFamily: 'var(--font-body)' }}>
        {combateTerminado ? (
          <div className="text-center py-3">Volviendo al perfil...</div>
        ) : sesion.votacion_huida && esMiTurno ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 gap-3 py-2 text-center">
            <span>¿Quieres huir del combate, cristalito?</span>
            <div className="d-flex gap-3">
              <button
                disabled={enviando}
                onClick={() => ejecutar('votar_huida', undefined, undefined, false)}
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '3rem', height: '3rem', border: `1px solid ${theme.text}`, color: theme.text, backgroundColor: 'transparent' }}
                title="No huir"
              >
                <i className="bi bi-x-lg fs-5"></i>
              </button>
              <button
                disabled={enviando}
                onClick={() => ejecutar('votar_huida', undefined, undefined, true)}
                className="btn rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '3rem', height: '3rem', border: `1px solid ${theme.accent}`, color: theme.accent, backgroundColor: 'transparent' }}
                title="Huir"
              >
                <i className="bi bi-check-lg fs-5"></i>
              </button>
            </div>
          </div>
        ) : !esMiTurno ? (
          <div className="d-flex align-items-center justify-content-center h-100 gap-2 py-4">
            <span className="text-secondary">
              {sesion.votacion_huida ? 'Votación de huida en curso...' : `Turno de ${vivos.find((c) => c.orden === sesion.turno_actual)?.nombre ?? '...'}`}
            </span>
          </div>
        ) : accionActiva ? (
          // --- Selección de objetivo ---
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small text-secondary">Elige objetivo</span>
              <button className="btn btn-sm btn-outline-light" onClick={() => { setPoderSeleccionado(null); setAccionArma(false); }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            {esArea ? (
              <button className="btn btn-outline-light w-100 py-3" disabled={enviando} onClick={usarArea}>
                Todos
              </button>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {objetivosPosibles.slice(0, 4).map((obj) => (
                  <button
                    key={obj.id}
                    disabled={enviando}
                    onClick={() => seleccionarObjetivo(obj.id)}
                    className="btn btn-outline-light text-start p-2"
                    style={{ fontSize: '0.85rem' }}
                  >
                    <div>{obj.nombre}</div>
                    <MiniBarra actual={obj.ps_actual} max={obj.ps_max} color="#c0392b" />
                    <MiniBarra actual={obj.pm_actual} max={obj.pm_max} color="#2980b9" />
                  </button>
                ))}
                {objetivosPosibles.length > 4 && (
                  <button
                    disabled={enviando}
                    onClick={() => seleccionarObjetivo(objetivosPosibles[4].id)}
                    className="btn btn-outline-light text-start p-2"
                    style={{ gridColumn: '1 / -1', fontSize: '0.85rem' }}
                  >
                    <div>{objetivosPosibles[4].nombre}</div>
                    <MiniBarra actual={objetivosPosibles[4].ps_actual} max={objetivosPosibles[4].ps_max} color="#c0392b" />
                    <MiniBarra actual={objetivosPosibles[4].pm_actual} max={objetivosPosibles[4].pm_max} color="#2980b9" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          // --- Selección de poder / arma / inventario / huir ---
          <div className="d-flex h-100" style={{ gap: '8px' }}>
            <div
              className="flex-grow-1"
              style={{
                display: 'grid',
                gap: '6px',
                gridTemplateColumns: poderesDisponibles.length === 3 ? '1fr' : poderesDisponibles.length <= 1 ? '1fr' : '1fr 1fr',
                gridTemplateRows: poderesDisponibles.length === 3 ? '1fr 1fr 1fr' : poderesDisponibles.length <= 2 ? '1fr' : '1fr 1fr',
              }}
            >
              {poderesDisponibles.length === 0 && (
                <div className="d-flex align-items-center justify-content-center text-secondary small">
                  {poderes.length === 0 ? 'Sin poderes activos' : 'Todos en enfriamiento'}
                </div>
              )}
              {poderesDisponibles.map((poder) => (
                <button key={poder.id} disabled={enviando} onClick={() => tocarPoder(poder)} className="btn btn-outline-light d-flex flex-column align-items-center justify-content-center">
                  <i className={`bi bi-${poder.icono ?? 'stars'} fs-5`}></i>
                  <span style={{ fontSize: '0.7rem' }}>{poder.nombre}</span>
                </button>
              ))}
            </div>
            <div className="d-flex flex-column" style={{ gap: '6px', width: '70px' }}>
              <button disabled={enviando} onClick={() => setAccionArma(true)} className="btn btn-outline-light flex-grow-1">
                <i className="bi bi-hammer"></i>
              </button>
              <button disabled={enviando} onClick={() => alert('Inventario aún no disponible.')} className="btn btn-outline-light flex-grow-1">
                <i className="bi bi-bag"></i>
              </button>
              <button disabled={enviando} onClick={() => ejecutar('huir')} className="btn btn-outline-light flex-grow-1">
                <i className="bi bi-door-open"></i>
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};
