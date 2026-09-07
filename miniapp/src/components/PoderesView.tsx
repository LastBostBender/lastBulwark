import { useState, useEffect } from 'react';
import { Layout } from './Layout';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

interface PoderesViewProps {
  perfil: {
    telegram_id: number;
    nombre_personaje: string;
    nivel: number;
    zona: string;
    clase: string;
    clase_id: number;
    fue: number;
    int: number;
    agi: number;
    [stat: string]: any;
  };
  onPoderAprendido?: (poder: string) => void;
  onNavigate?: (vista: 'perfil' | 'mazmorra' | 'inventario' | 'poderes' | 'mercado') => void;
}

interface EfectoPoder {
  tipo: string;
  valor: number;
  unidad: string;
  stat?: string;
  target: string;
  trigger: string;
  duracion_turnos?: number;
  probabilidad?: number;
  escala_por?: string;
  critico_porcentaje?: number;
}

interface Poder {
  id: number;
  nombre: string;
  tipo: 'activo' | 'pasivo' | 'aura' | 'efecto_temporal';
  stat_requerido: 'fue' | 'int' | 'agi';
  tier: 1 | 2;
  descripcion: string;
  icono: string;
  parametros: { efectos: EfectoPoder[] };
  cooldown_turnos: number | null;
  costo_pm_base: number | null;
  nivel_minimo?: number | null;
  clase_requerida?: string | null;
}

interface BuffActivo {
  id: number;
  nombre: string;
  stats: Record<string, number>;
  expira_en: string;
}

interface Clase {
  id: number;
  nombre: string;
  stat_principal: 'fue' | 'int' | 'agi';
  rol: 'sanador' | 'tanque' | 'dañador';
  icono: string;
  descripcion: string;
  bono_stats: Record<string, number>;
}

// Esquema de color por stat primario — mismo criterio usado en el preview
// de clases: rojo=fue, azul=int, verde=agi.
const COLOR_STAT: Record<'fue' | 'int' | 'agi', string> = {
  fue: '#ff4d4d',
  int: '#4da6ff',
  agi: '#4dff88',
};

const HITOS = [10, 20, 30, 40, 50];

/*
 * Nombres de presentación de los stats.
 * Las claves siguen siendo las del backend; solamente se cambia
 * cómo se muestran al jugador.
 */
const NOMBRE_STAT: Record<string, string> = {
  ps_max: 'PS máx.',
  pm_max: 'PM máx.',
  ataque_fisico: 'Ataque físico',
  ataque_magico: 'Ataque mágico',
  defensa_fisica: 'Defensa física',
  defensa_magica: 'Defensa mágica',
  precision_stat: 'Precisión',
  escape: 'Escape',
  velocidad: 'Velocidad',
  critico: 'Crítico',
  suerte: 'Suerte',
  regen_ps: 'Regeneración de PS',
  regen_pm: 'Regeneración de PM',
  fue: 'FUE',
  int: 'INT',
  agi: 'AGI',
  aleatorio: 'Stat aleatorio',
};

// Nombres de stat propios de los buffs de descanso.
const NOMBRE_STAT_BUFF: Record<string, string> = {
  ...NOMBRE_STAT,
  ps_max: 'PS máx.',
  pm_max: 'PM máx.',
  regen_ps: 'Regeneración de PS',
  regen_pm: 'Regeneración de PM',
};

function formatearRestante(ms: number): string {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function curacionEstimada(e: EfectoPoder, perfil: PoderesViewProps['perfil']): number {
  const nivel = Math.max(5, perfil.nivel ?? 5);
  const crecimiento = 1 + (4 * Math.max(0, Math.min(45, nivel - 5))) / 45;
  const ataque = e.escala_por ? Math.max(0, Number(perfil[e.escala_por] ?? 0)) : 0;
  return Math.max(0, Math.round(e.valor * crecimiento * (1 + ataque / 100)));
}

// Réplica de combat_costo_mana (SQL) / misma función que usa CombatView —
// mismo costo base + franjas por nivel. Es solo para mostrar el número acá,
// el backend sigue siendo la fuente de verdad al momento de tirar el poder.
function costoManaPoder(costoBase: number | null, nivel: number): number | null {
  if (costoBase === null || costoBase === undefined) return null;
  const franja =
    nivel <= 9 ? 0
    : nivel <= 19 ? 1
    : nivel <= 29 ? 3
    : nivel <= 39 ? 5
    : nivel <= 49 ? 9
    : 14;
  return costoBase + franja;
}

// Valores de daño/sanación de un poder para el resumen final: junta TODOS
// los efectos de tipo 'daño' y 'curacion' que tenga (no solo el primero).
// La mayoría de los poderes activos tienen uno solo, pero los
// "variable_bando" como Changquian hacen daño si apuntás a un enemigo o
// sana si apuntás a un aliado — ahí se muestran ambos valores a la vez.
function efectoDanoOSanacion(
  poder: Poder,
  perfil: PoderesViewProps['perfil'],
): Array<{ etiqueta: 'Daño' | 'Sanación'; valor: number }> {
  const efectos = poder.parametros?.efectos ?? [];
  return efectos
    .filter((e) => e.tipo === 'daño' || e.tipo === 'curacion')
    .map((e) => ({
      etiqueta: (e.tipo === 'curacion' ? 'Sanación' : 'Daño') as 'Daño' | 'Sanación',
      valor: curacionEstimada(e, perfil),
    }));
}

const statsDominantes = (stats: { fue: number; int: number; agi: number }): Array<'fue' | 'int' | 'agi'> => {
  const max = Math.max(stats.fue, stats.int, stats.agi);
  if (max === 0) return [];
  return (['fue', 'int', 'agi'] as const).filter((s) => stats[s] === max);
};

// Modal de selección de clase: fijo en pantalla, con scroll interno propio.
// Los 5 hitos van en una franja horizontal scrolleable (no entran los 5 juntos
// en el ancho del modal), unidos por una línea. Tocar un hito muestra qué
// poder entrega ese nivel — o un placeholder si todavía no está cargado.
// Franja de hitos reusable: círculos con el número de nivel, unidos por un
// hilo, scrolleable horizontal. El color/opacidad de cada círculo lo decide
// quien la usa (colorHito/opacidadHito) — en el modal de selección van todos
// al mismo color vivo (preview de la clase completa); en el panel de "mi
// clase" ya elegida, el hilo se pinta con el theme de zona y cada hito se ve
// opaco hasta que el nivel real lo alcanza, ahí se pone vívido.
const HitosStrip = ({
  poderesHito,
  theme,
  colorHito,
  opacidadHito,
}: {
  poderesHito: Poder[];
  theme: ReturnType<typeof getTheme>;
  colorHito: (hito: number) => string;
  opacidadHito: (hito: number) => number;
}) => {
  const [hitoAbierto, setHitoAbierto] = useState<number | null>(null);

  const poderDeHito = (hito: number) =>
    poderesHito.find((p) => p.nombre && (p as any).nivel_minimo === hito);

  return (
    <div>
      <div style={{ overflowX: 'auto', paddingBottom: '0.3rem' }}>
        <div style={{ position: 'relative', display: 'inline-flex', gap: '1.6rem', padding: '0 0.5rem', minWidth: '100%' }}>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '1.3rem',
              right: '1.3rem',
              height: '2px',
              backgroundColor: `${theme.border}`,
              zIndex: 0,
            }}
          />
          {HITOS.map((hito) => {
            const abierto = hitoAbierto === hito;
            const color = colorHito(hito);
            const opacidad = opacidadHito(hito);
            return (
              <button
                key={hito}
                onClick={() => setHitoAbierto(abierto ? null : hito)}
                className="rounded-circle"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  flex: '0 0 auto',
                  width: '2.6rem',
                  height: '2.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: abierto ? color : theme.cardBg,
                  color: abierto ? '#111' : color,
                  border: `2px solid ${color}`,
                  opacity: opacidad,
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.3s ease',
                }}
              >
                {hito}
              </button>
            );
          })}
        </div>
      </div>

      {hitoAbierto && (
        <div style={{ padding: '0.6rem 0.3rem 0.8rem', fontSize: '0.85rem' }}>
          {(() => {
            const poder = poderDeHito(hitoAbierto);
            const color = colorHito(hitoAbierto);
            if (!poder) {
              return (
                <p style={{ color: theme.text, opacity: 0.6, margin: 0, fontStyle: 'italic' }}>
                  Todavía sin definir.
                </p>
              );
            }
            return (
              <>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <i className={`bi bi-${poder.icono ?? 'stars'}`} style={{ color, fontSize: '1rem' }}></i>
                  <span style={{ color }}>{poder.nombre}</span>
                </div>
                <p style={{ color: theme.text, margin: 0 }}>{poder.descripcion}</p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const ClaseModal = ({
  clase,
  poderesHito,
  theme,
  eligiendo,
  onCancelar,
  onAceptar,
}: {
  clase: Clase;
  poderesHito: Poder[];
  theme: ReturnType<typeof getTheme>;
  eligiendo: boolean;
  onCancelar: () => void;
  onAceptar: () => void;
}) => {
  const color = COLOR_STAT[clase.stat_principal];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '360px',
          maxHeight: '80vh',
          overflowY: 'auto',
          backgroundColor: theme.cardBg,
          border: `1px solid ${color}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header: ícono + nombre */}
        <div
          className="d-flex align-items-center gap-2"
          style={{ padding: '0.9rem 1rem 0.6rem', borderBottom: `1px solid ${theme.border}` }}
        >
          <i className={`bi bi-${clase.icono}`} style={{ color, fontSize: '1.4rem' }}></i>
          <span style={{ color, fontFamily: 'var(--font-display)', fontSize: '1rem', letterSpacing: '0.5px' }}>
            {clase.nombre}
          </span>
        </div>

        {/* Descripción */}
        <div style={{ padding: '0.8rem 1rem', borderBottom: `1px solid ${theme.border}` }}>
          <p style={{ color: theme.text, fontSize: '0.9rem', margin: 0 }}>{clase.descripcion}</p>
        </div>

        {/* Hitos: preview completo de la clase — todos vívidos, es lo que ganarías */}
        <div style={{ padding: '1rem 1rem 0.4rem', borderBottom: `1px solid ${theme.border}` }}>
          <HitosStrip
            poderesHito={poderesHito}
            theme={theme}
            colorHito={() => color}
            opacidadHito={() => 1}
          />
        </div>

        {/* Cancelar / Aceptar */}
        <div className="d-flex justify-content-center gap-4" style={{ padding: '1rem' }}>
          <button
            onClick={onCancelar}
            disabled={eligiendo}
            className="btn rounded-circle"
            style={{
              width: '2.6rem',
              height: '2.6rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.text,
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
            }}
          >
            <i className="bi bi-x-lg"></i>
          </button>
          <button
            onClick={onAceptar}
            disabled={eligiendo}
            className="btn rounded-circle"
            style={{
              width: '2.6rem',
              height: '2.6rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111',
              border: `1px solid ${color}`,
              backgroundColor: color,
              opacity: eligiendo ? 0.6 : 1,
              cursor: eligiendo ? 'wait' : 'pointer',
            }}
          >
            <i className="bi bi-check-lg"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

// Panel de "mi clase" ya elegida: mismo sistema de hitos, pero persistente
// (no modal) y coloreado con el theme de zona en vez del color por stat.
// Los hitos ya alcanzados (nivel actual >= hito) se ven vívidos; los que
// faltan quedan opacos, como progreso.
const MiClasePanel = ({
  clase,
  poderesHito,
  perfil,
  theme,
}: {
  clase: Clase;
  poderesHito: Poder[];
  perfil: PoderesViewProps['perfil'];
  theme: ReturnType<typeof getTheme>;
}) => {
  return (
    <div
      className="mb-3"
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: '6px',
        backgroundColor: theme.cardBg,
      }}
    >
      <div
        className="d-flex align-items-center gap-2"
        style={{ padding: '0.7rem 0.9rem', borderBottom: `1px solid ${theme.border}` }}
      >
        <i className={`bi bi-${clase.icono}`} style={{ color: theme.accent, fontSize: '1.2rem' }}></i>
        <span style={{ color: theme.accent, fontFamily: 'var(--font-display)', fontSize: '0.9rem', letterSpacing: '0.5px' }}>
          {clase.nombre}
        </span>
      </div>
      <div style={{ padding: '0.6rem 0.9rem 0.2rem' }}>
        <p style={{ color: theme.text, fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>{clase.descripcion}</p>
      </div>
      <div style={{ padding: '0.8rem 0.9rem 0.6rem' }}>
        <HitosStrip
          poderesHito={poderesHito}
          theme={theme}
          colorHito={() => theme.accent}
          opacidadHito={(hito) => (perfil.nivel >= hito ? 1 : 0.3)}
        />
      </div>
    </div>
  );
};

const DetallePoder = ({
  poder,
  theme,
  perfil,
}: {
  poder: Poder;
  theme: ReturnType<typeof getTheme>;
  perfil: PoderesViewProps['perfil'];
}) => {
  return (
    <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', fontSize: '0.9rem' }}>
      <p style={{ color: theme.text, marginBottom: 0 }}>
        {poder.descripcion}
      </p>

      {(() => {
        const efectos = efectoDanoOSanacion(poder, perfil);
        const pm = costoManaPoder(poder.costo_pm_base, perfil.nivel);
        const partes: string[] = [
          ...efectos.map((ef) => `${ef.etiqueta}: ${ef.valor}`),
        ];
        if (pm !== null) partes.push(`PM: ${pm}`);
        if (poder.cooldown_turnos) {
          partes.push(`CD: ${poder.cooldown_turnos} turno${poder.cooldown_turnos > 1 ? 's' : ''}`);
        }
        if (partes.length === 0) return null;
        return (
          <div
            style={{
              color: theme.text,
              opacity: 0.75,
              marginTop: '0.4rem',
              fontSize: '0.8rem',
            }}
          >
            {partes.join(' • ')}
          </div>
        );
      })()}
    </div>
  );
};

const DetalleBuff = ({
  buff,
  theme,
}: {
  buff: BuffActivo;
  theme: ReturnType<typeof getTheme>;
}) => {
  const entradas = Object.entries(buff.stats ?? {});

  return (
    <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', fontSize: '0.9rem' }}>
      {entradas.length > 0 ? (
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
            padding: '0.4rem 0',
          }}
        >
          {entradas.map(([k, v]) => (
            <div key={k} style={{ color: theme.accent, fontFamily: 'var(--font-body)' }}>
              {v >= 0 ? '+' : ''}
              {v} {NOMBRE_STAT_BUFF[k] ?? k.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: theme.text }}>Sin efecto asociado.</div>
      )}
    </div>
  );
};

export const PoderesView = ({
  perfil,
  onPoderAprendido,
  onNavigate,
}: PoderesViewProps) => {
  const [catalogo, setCatalogo] = useState<Poder[]>([]);
  const [aprendidos, setAprendidos] = useState<string[]>([]);
  const [buffsActivos, setBuffsActivos] = useState<BuffActivo[]>([]);
  const [clases, setClases] = useState<Clase[]>([]);
  const [claseModal, setClaseModal] = useState<Clase | null>(null);
  const [eligiendoClase, setEligiendoClase] = useState(false);
  const [errorClase, setErrorClase] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [poderExpandido, setPoderExpandido] = useState<string | null>(null);
  const [buffExpandido, setBuffExpandido] = useState<number | null>(null);
  const [aprendiendoPoder, setAprendiendoPoder] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargarDatos = async () => {
    setCargando(true);
    const [catalogoRes, aprendidosRes, buffsRes, clasesRes] = await Promise.all([
      supabase
        .from('powers')
        .select(
          'id, nombre, tipo, stat_requerido, tier, descripcion, icono, parametros, cooldown_turnos, costo_pm_base, nivel_minimo, clase_requerida'
        ),

      supabase
        .from('character_powers')
        .select('powers(nombre)')
        .eq('telegram_id', perfil.telegram_id),

      supabase
        .from('character_buffs_activos')
        .select('id, nombre, stats, expira_en')
        .eq('telegram_id', perfil.telegram_id)
        .gt('expira_en', new Date().toISOString()),
      supabase
        .from('classes')
        .select('id, nombre, stat_principal, rol, icono, descripcion, bono_stats')
        .neq('id', 1),
    ]);

    if (catalogoRes.data) setCatalogo(catalogoRes.data as Poder[]);

    if (aprendidosRes.data) {
      setAprendidos(
        aprendidosRes.data.map((row: any) => row.powers.nombre)
      );
    }

    if (buffsRes.data) setBuffsActivos(buffsRes.data as BuffActivo[]);
    if (clasesRes.data) setClases(clasesRes.data as Clase[]);
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id]);

  useEffect(() => {
    if (buffsActivos.length === 0) return;

    const id = setInterval(() => setAhora(Date.now()), 1000);

    return () => clearInterval(id);
  }, [buffsActivos.length]);

  const buffsVigentes = buffsActivos.filter(
    (b) => new Date(b.expira_en).getTime() > ahora
  );

  const aprenderPoder = async (poder: Poder) => {
    if (aprendiendoPoder) return;

    setAprendiendoPoder(poder.nombre);

    const { error } = await supabase
      .from('character_powers')
      .insert({
        telegram_id: perfil.telegram_id,
        power_id: poder.id,
      });

    setAprendiendoPoder(null);

    if (error) {
      console.error('Error aprendiendo poder:', error);
      return;
    }

    setAprendidos((prev) => [...prev, poder.nombre]);
    setPoderExpandido(null);

    if (onPoderAprendido) {
      onPoderAprendido(poder.nombre);
    }
  };

  const elegirClase = async () => {
    if (!claseModal || eligiendoClase) return;
    setEligiendoClase(true);
    setErrorClase(null);

    const { data, error } = await supabase.rpc('elegir_clase', {
      p_telegram_id: perfil.telegram_id,
      p_clase_id: claseModal.id,
    });

    setEligiendoClase(false);

    if (error || !data?.ok) {
      const motivos: Record<string, string> = {
        ya_tiene_clase: 'Ya tienes una clase elegida.',
        nivel_insuficiente: 'Todavía no llegas al nivel necesario.',
        puntos_insuficientes: 'Todavía no tienes los puntos necesarios.',
        clase_invalida: 'Esa clase no es válida.',
        clase_no_disponible: 'Esa clase ya no está disponible para tu stat dominante.',
      };
      setErrorClase(motivos[data?.motivo] ?? 'No se pudo aplicar la clase. Probá de nuevo.');
      return;
    }

    // El perfil se actualiza solo por la suscripción realtime del padre;
    // acá solo cerramos el modal.
    setClaseModal(null);
  };

  const toggleExpandir = (poder: string) => {
    setPoderExpandido(
      poderExpandido === poder ? null : poder
    );
  };

  const theme = getTheme(perfil.zona);

  const puntosAsignados = perfil.fue + perfil.int + perfil.agi;
  const dominantes = statsDominantes({
    fue: perfil.fue,
    int: perfil.int,
    agi: perfil.agi,
  });

  const poderesAprendidosInfo = catalogo.filter((p) =>
    aprendidos.includes(p.nombre)
  );

  const tiersYaElegidos = new Set(
    poderesAprendidosInfo.map((p) => p.tier)
  );

  // Mismo umbral que tier 1/2 (suma total), un escalón más (9) + nivel 10.
  const clasePendiente = perfil.clase_id === 1 && perfil.nivel >= 10 && puntosAsignados >= 9;
  const clasesCandidatas = clasePendiente ? clases.filter((c) => dominantes.includes(c.stat_principal)) : [];

  const poderesPendientes: Poder[] = catalogo.filter((p) => {
    if (perfil.clase_id !== 1) return false;
    if (aprendidos.includes(p.nombre)) return false;

    if (tiersYaElegidos.has(p.tier)) return false;

    if (!dominantes.includes(p.stat_requerido)) return false;

    if (p.tier === 1) return puntosAsignados >= 4;
    if (p.tier === 2) return puntosAsignados >= 7;

    return false;
  });

  return (
    <Layout
      nombre={perfil.nombre_personaje}
      clase={perfil.clase}
      nivel={perfil.nivel}
      zona={perfil.zona}
      vistaActual="poderes"
      onNavigate={onNavigate}
    >
      <div className="container mt-2">
        <div
          className="text-center mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.85rem',
            letterSpacing: '1px',
            color: theme.accent,
          }}
        >
          <i className="bi bi-bezier2 me-2"></i>
          Poderes
        </div>

        {cargando && (
          <p
            className="text-center"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme.text,
            }}
          >
            Cargando...
          </p>
        )}

        {!cargando && perfil.clase_id !== 1 && (() => {
          const miClase = clases.find((c) => c.id === perfil.clase_id);
          if (!miClase) return null;
          return (
            <MiClasePanel
              clase={miClase}
              perfil={perfil}
              theme={theme}
              poderesHito={catalogo.filter((p) => p.clase_requerida === miClase.nombre)}
            />
          );
        })()}

        {!cargando && clasesCandidatas.length > 0 && (
          <div className="mb-3">
            <div className="text-center mb-2" style={{ color: theme.accent, fontSize: '0.8rem' }}>
              <i className="bi bi-award me-1"></i> Elige tu clase
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
              }}
            >
              {clasesCandidatas.map((c) => {
                const color = COLOR_STAT[c.stat_principal];
                return (
                  <button
                    key={c.id}
                    onClick={() => setClaseModal(c)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.7rem 0.3rem',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${color}`,
                      borderRadius: '6px',
                      color,
                      cursor: 'pointer',
                    }}
                  >
                    <i className={`bi bi-${c.icono}`} style={{ fontSize: '1.4rem' }}></i>
                    <span style={{ fontSize: '0.7rem', textAlign: 'center', lineHeight: 1.1, fontFamily: 'var(--font-body)' }}>
                      {c.nombre}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!cargando && buffsVigentes.length > 0 && (
          <div className="mb-3">
            <div
              className="text-center mb-2"
              style={{ color: theme.accent, fontSize: '0.8rem' }}
            >
              <i className="bi bi-flask me-1"></i>
              Consumibles activos
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {buffsVigentes.map((buff) => {
                const expandido = buffExpandido === buff.id;
                const restanteMs =
                  new Date(buff.expira_en).getTime() - ahora;

                return (
                  <div
                    key={buff.id}
                    style={{
                      borderBottom: `1px solid ${theme.border}40`,
                    }}
                  >
                    <button
                      onClick={() =>
                        setBuffExpandido(expandido ? null : buff.id)
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '0.4rem 0.2rem',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.95rem',
                        color: theme.text,
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          'rgba(255,255,0,0.05)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          'transparent')
                      }
                    >
                      <i
                        className="bi bi-flask"
                        style={{
                          color: theme.accent,
                          fontSize: '1.1rem',
                        }}
                      ></i>

                      <span>{buff.nombre}</span>

                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.75rem',
                          color: theme.accent,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatearRestante(restanteMs)}
                      </span>

                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: theme.text,
                        }}
                      >
                        <i
                          className={`bi bi-${
                            expandido
                              ? 'chevron-up'
                              : 'chevron-right'
                          }`}
                        ></i>
                      </span>
                    </button>

                    {expandido && (
                      <DetalleBuff buff={buff} theme={theme} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!cargando && poderesPendientes.length > 0 && (
          <div className="mb-3">
            <div
              className="text-center mb-2"
              style={{ color: theme.accent, fontSize: '0.8rem' }}
            >
              <i className="bi bi-brilliance me-1"></i>
              Elige un poder
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {poderesPendientes.map((poder) => {
                const expandido =
                  poderExpandido === poder.nombre;

                return (
                  <div
                    key={poder.nombre}
                    style={{
                      borderBottom: `1px solid ${theme.border}40`,
                    }}
                  >
                    <button
                      onClick={() =>
                        toggleExpandir(poder.nombre)
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        padding: '0.4rem 0.2rem',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.95rem',
                        color: theme.text,
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          'rgba(255,255,0,0.05)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          'transparent')
                      }
                    >
                      <i
                        className={`bi bi-${
                          poder.icono ?? 'stars'
                        }`}
                        style={{
                          color: theme.accent,
                          fontSize: '1.1rem',
                        }}
                      ></i>

                      <span>{poder.nombre}</span>

                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.7rem',
                          color: theme.text,
                        }}
                      >
                        <i
                          className={`bi bi-${
                            expandido
                              ? 'chevron-up'
                              : 'chevron-right'
                          }`}
                        ></i>
                      </span>
                    </button>

                    {expandido && (
                      <>
                        <DetallePoder
                          poder={poder}
                          theme={theme}
                          perfil={perfil}
                        />

                        <div
                          style={{
                            padding: '0 0.2rem 0.8rem 1.8rem',
                          }}
                        >
                          <button
                            className="btn rounded-circle"
                            style={{
                              width: '2rem',
                              height: '2rem',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: theme.accent,
                              border: `1px solid ${theme.accent}`,
                              backgroundColor: 'transparent',
                              opacity: aprendiendoPoder ? 0.6 : 1,
                              cursor: aprendiendoPoder
                                ? 'wait'
                                : 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              aprenderPoder(poder);
                            }}
                          >
                            <i className="bi bi-check-lg"></i>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!cargando && poderesAprendidosInfo.length > 0 && (
          <div>
            <div
              className="text-center mb-2"
              style={{
                color: theme.accent,
                fontSize: '0.8rem',
              }}
            >
              <i className="bi bi-brilliance me-1"></i>
              Poderes aprendidos
            </div>

            {poderesAprendidosInfo.map((poder) => (
              <div
                key={poder.nombre}
                style={{
                  borderBottom: `1px solid ${theme.border}40`,
                  backgroundColor: 'rgba(255,255,0,0.05)',
                }}
              >
                <button
                  onClick={() =>
                    toggleExpandir(poder.nombre)
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: '0.4rem 0.2rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.95rem',
                    color: theme.accent,
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      'rgba(255,255,0,0.08)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      'transparent')
                  }
                >
                  <i
                    className={`bi bi-${
                      poder.icono ?? 'stars'
                    }`}
                    style={{
                      color: theme.accent,
                      fontSize: '1.1rem',
                    }}
                  ></i>

                  <span>{poder.nombre}</span>

                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.7rem',
                      color: theme.text,
                    }}
                  >
                    <i
                      className={`bi bi-${
                        poderExpandido === poder.nombre
                          ? 'chevron-up'
                          : 'chevron-right'
                      }`}
                    ></i>
                  </span>
                </button>

                {poderExpandido === poder.nombre && (
                  <DetallePoder
                    poder={poder}
                    theme={theme}
                    perfil={perfil}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {!cargando &&
          poderesPendientes.length === 0 &&
          poderesAprendidosInfo.length === 0 &&
          buffsVigentes.length === 0 && (
            <p
              className="text-center"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme.text,
                marginTop: '2rem',
              }}
            >
              Todavía no tienes poderes. Reparte puntos de talento en tu perfil
              para desbloquear el primero a los 4 puntos.
            </p>
          )}
      </div>
      {claseModal && (
        <ClaseModal
          clase={claseModal}
          poderesHito={catalogo.filter((p) => p.clase_requerida === claseModal.nombre)}
          theme={theme}
          eligiendo={eligiendoClase}
          onCancelar={() => { setClaseModal(null); setErrorClase(null); }}
          onAceptar={elegirClase}
        />
      )}
      {errorClase && !claseModal && (
        <div
          className="px-3 py-2 text-center"
          style={{
            position: 'fixed',
            bottom: '1rem',
            left: '1rem',
            right: '1rem',
            backgroundColor: 'rgba(220, 53, 69, 0.9)',
            color: '#fff',
            fontSize: '0.85rem',
            borderRadius: '4px',
            zIndex: 900,
          }}
        >
          {errorClase}
        </div>
      )}
    </Layout>
  );
};