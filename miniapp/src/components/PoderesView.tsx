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
    fue: number;
    int: number;
    agi: number;
    // Stats derivadas usadas por escala_por (ataque_fisico, ataque_magico, etc.).
    // Índice abierto porque escala_por puede apuntar a cualquier stat del
    // combatiente, igual que to_jsonb(p_actor)->>v_escala_por en el SQL.
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
}

const NOMBRE_STAT: Record<string, string> = {
  ataque_fisico: 'ataque físico',
  ataque_magico: 'ataque mágico',
  defensa_fisica: 'defensa física',
  defensa_magica: 'defensa mágica',
  precision_stat: 'precisión',
  escape: 'escape',
  velocidad: 'velocidad',
  critico: 'crítico',
  suerte: 'suerte',
  aleatorio: 'stat aleatorio',
};

// Etiqueta de a quién le llega el efecto. Cubre los valores de `target` que
// existen hoy en la tabla powers; si aparece uno nuevo, se muestra tal cual
// en vez de desaparecer en silencio.
const NOMBRE_TARGET: Record<string, string> = {
  self: 'ti',
  enemigo: 'enemigo',
  todos_enemigos: 'todos los enemigos',
  todos_aliados: 'todos los aliados',
  aliado_objetivo: 'aliado objetivo',
  aliado_con_menos_vida: 'aliado con menos vida',
  siguientes_enemigos_cola: 'próximos en la cola',
};

function etiquetaDestino(target: string): string {
  return NOMBRE_TARGET[target] ?? target;
}

// Si el efecto trae escala_por, ajusta el valor base con la stat del jugador
// que abre esta pantalla — misma fórmula que combat_resolver_efecto_combate
// en SQL: delta_final = delta_base * (1 + stat/100), truncado.
function valorEscalado(e: EfectoPoder, perfil: PoderesViewProps['perfil']): number {
  if (!e.escala_por) return e.valor;
  const statValor = Number(perfil[e.escala_por] ?? 0);
  const factor = 1 + statValor / 100;
  return Math.trunc(e.valor * factor);
}

// Convierte cada efecto del poder en una línea ±stat legible. El valor ya
// viene escalado por la stat del jugador cuando el efecto lo requiere, para
// que coincida con lo que de verdad recibe en combate. Toda línea termina
// con "· <destino>" para que quede claro sobre quién actúa el efecto.
function formatearEfecto(e: EfectoPoder, perfil: PoderesViewProps['perfil']): string {
  const valor = valorEscalado(e, perfil);
  const duracion = e.duracion_turnos && e.duracion_turnos > 0 ? ` / ${e.duracion_turnos}t` : '';
  const prob = e.probabilidad ? ` (${e.probabilidad}% prob.)` : '';
  const destino = ` · ${etiquetaDestino(e.target)}`;

  switch (e.unidad) {
    case 'porcentaje_ataque_fisico':
    case 'porcentaje_ataque_magico':
      return `+${valor}% daño${destino}`;
    case 'porcentaje_vida_maxima':
    case 'porcentaje_vida_actual': {
      const signo = e.tipo === 'curacion' ? '+' : '-';
      return `${signo}${Math.abs(valor)}% vida${duracion}${destino}`;
    }
    case 'porcentaje_dano_recibido':
      return `+${valor}% contraataque${destino}`;
    case 'porcentaje_stat':
    case 'puntos_porcentuales': {
      const signo = valor >= 0 ? '+' : '';
      const stat = NOMBRE_STAT[e.stat ?? ''] ?? e.stat;
      return `${signo}${valor}% ${stat}${duracion}${prob}${destino}`;
    }
    case 'turnos':
      return `Inhabilita ${valor} turno${valor > 1 ? 's' : ''}${destino}`;
    // No hay un número fijo: el backend lo calcula en tiempo de combate
    // (combat_resolver_efecto_combate lo ignora a propósito, cae en el ELSE).
    // Esta línea es puramente descriptiva para el jugador.
    case 'robo_variable': {
      const stat = NOMBRE_STAT[e.stat ?? ''] ?? e.stat;
      return `+${stat} robad${stat === 'velocidad' ? 'a' : 'o'}${duracion}${destino}`;
    }
    default:
      return '';
  }
}

// Stat(s) con más puntos invertidos. Puede haber empate, en cuyo caso se ofrece
// más de un poder para que el jugador decida.
const statsDominantes = (stats: { fue: number; int: number; agi: number }): Array<'fue' | 'int' | 'agi'> => {
  const max = Math.max(stats.fue, stats.int, stats.agi);
  if (max === 0) return [];
  return (['fue', 'int', 'agi'] as const).filter((s) => stats[s] === max);
};

const DetallePoder = ({ poder, theme, perfil }: { poder: Poder; theme: ReturnType<typeof getTheme>; perfil: PoderesViewProps['perfil'] }) => {
  const lineas = (poder.parametros?.efectos ?? []).map((e) => formatearEfecto(e, perfil)).filter(Boolean);
  return (
    <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', fontSize: '0.9rem' }}>
      <p style={{ color: theme.text, marginBottom: lineas.length ? '0.5rem' : 0 }}>{poder.descripcion}</p>
      {lineas.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
            padding: '0.4rem 0',
          }}
        >
          {lineas.map((linea, i) => (
            <div key={i} style={{ color: theme.accent, fontFamily: 'var(--font-body)' }}>
              {linea}
            </div>
          ))}
        </div>
      )}
      {poder.cooldown_turnos && (
        <div style={{ color: theme.text, opacity: 0.75, marginTop: '0.4rem', fontSize: '0.8rem' }}>
          CD: {poder.cooldown_turnos} turno{poder.cooldown_turnos > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export const PoderesView = ({ perfil, onPoderAprendido, onNavigate }: PoderesViewProps) => {
  const [catalogo, setCatalogo] = useState<Poder[]>([]);
  const [aprendidos, setAprendidos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [poderExpandido, setPoderExpandido] = useState<string | null>(null);
  const [aprendiendoPoder, setAprendiendoPoder] = useState<string | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    const [catalogoRes, aprendidosRes] = await Promise.all([
      supabase.from('powers').select('id, nombre, tipo, stat_requerido, tier, descripcion, icono, parametros, cooldown_turnos'),
      supabase
        .from('character_powers')
        .select('powers(nombre)')
        .eq('telegram_id', perfil.telegram_id),
    ]);
    if (catalogoRes.data) setCatalogo(catalogoRes.data as Poder[]);
    if (aprendidosRes.data) {
      setAprendidos(aprendidosRes.data.map((row: any) => row.powers.nombre));
    }
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id]);

  const aprenderPoder = async (poder: Poder) => {
    if (aprendiendoPoder) return;
    setAprendiendoPoder(poder.nombre);

    const { error } = await supabase
      .from('character_powers')
      .insert({ telegram_id: perfil.telegram_id, power_id: poder.id });

    setAprendiendoPoder(null);

    if (error) {
      console.error('Error aprendiendo poder:', error);
      return;
    }

    setAprendidos((prev) => [...prev, poder.nombre]);
    setPoderExpandido(null);
    if (onPoderAprendido) onPoderAprendido(poder.nombre);
  };

  const toggleExpandir = (poder: string) => {
    setPoderExpandido(poderExpandido === poder ? null : poder);
  };

  const theme = getTheme(perfil.zona);

  const puntosAsignados = perfil.fue + perfil.int + perfil.agi;
  const dominantes = statsDominantes({ fue: perfil.fue, int: perfil.int, agi: perfil.agi });

  // Tier 1 a los 4 puntos, tier 2 a los 7 — por el stat dominante EN ESE MOMENTO,
  // sin perder lo ya aprendido en el tier anterior.
  const poderesAprendidosInfo = catalogo.filter((p) => aprendidos.includes(p.nombre));
  const tiersYaElegidos = new Set(poderesAprendidosInfo.map((p) => p.tier));

  const poderesPendientes: Poder[] = catalogo.filter((p) => {
    if (perfil.clase !== 'NPC consciente') return false;
    if (aprendidos.includes(p.nombre)) return false;
    // Solo se elige 1 poder por tier: si ya aprendió alguno de este tier
    // (aunque haya sido de otro stat empatado), el resto deja de ofrecerse.
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
        <div className="text-center mb-3" style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: '1px', color: theme.accent }}>
          <i className="bi bi-bezier2 me-2"></i>Poderes
        </div>

        {cargando && (
          <p className="text-center" style={{ fontFamily: 'var(--font-body)', color: theme.text }}>
            Cargando...
          </p>
        )}

        {!cargando && poderesPendientes.length > 0 && (
          <div className="mb-3">
            <div className="text-center mb-2" style={{ color: theme.accent, fontSize: '0.8rem' }}>
              <i className="bi bi-brilliance me-1"></i> Elige un poder
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {poderesPendientes.map((poder) => {
                const expandido = poderExpandido === poder.nombre;
                return (
                  <div key={poder.nombre} style={{ borderBottom: `1px solid ${theme.border}40` }}>
                    <button
                      onClick={() => toggleExpandir(poder.nombre)}
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
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,0,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <i className={`bi bi-${poder.icono ?? 'stars'}`} style={{ color: theme.accent, fontSize: '1.1rem' }}></i>
                      <span>{poder.nombre}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.text }}>
                        <i className={`bi bi-${expandido ? 'chevron-up' : 'chevron-right'}`}></i>
                      </span>
                    </button>
                    {expandido && (
                      <>
                        <DetallePoder poder={poder} theme={theme} perfil={perfil} />
                        <div style={{ padding: '0 0.2rem 0.8rem 1.8rem' }}>
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
                              cursor: aprendiendoPoder ? 'wait' : 'pointer',
                            }}
                            onClick={(e) => { e.stopPropagation(); aprenderPoder(poder); }}
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
            <div className="text-center mb-2" style={{ color: theme.accent, fontSize: '0.8rem' }}>
              <i className="bi bi-brilliance me-1"></i> Poderes aprendidos
            </div>
            {poderesAprendidosInfo.map((poder) => (
              <div key={poder.nombre} style={{ borderBottom: `1px solid ${theme.border}40`, backgroundColor: 'rgba(255,255,0,0.05)' }}>
                <button
                  onClick={() => toggleExpandir(poder.nombre)}
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
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,0,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <i className={`bi bi-${poder.icono ?? 'stars'}`} style={{ color: theme.accent, fontSize: '1.1rem' }}></i>
                  <span>{poder.nombre}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.text }}>
                    <i className={`bi bi-${poderExpandido === poder.nombre ? 'chevron-up' : 'chevron-right'}`}></i>
                  </span>
                </button>
                {poderExpandido === poder.nombre && <DetallePoder poder={poder} theme={theme} perfil={perfil} />}
              </div>
            ))}
          </div>
        )}

        {!cargando && poderesPendientes.length === 0 && poderesAprendidosInfo.length === 0 && (
          <p className="text-center" style={{ fontFamily: 'var(--font-body)', color: theme.text, marginTop: '2rem' }}>
            Todavía no tienes poderes. Reparte puntos de talento en tu perfil para desbloquear el primero a los 4 puntos.
          </p>
        )}
      </div>
    </Layout>
  );
};
