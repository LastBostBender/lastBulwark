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
  };
  onPoderAprendido?: (poder: string) => void;
}

interface Poder {
  id: number;
  nombre: string;
  tipo: 'activo' | 'pasivo' | 'aura' | 'efecto_temporal';
  stat_requerido: 'fue' | 'int' | 'agi';
  tier: 1 | 2;
  descripcion: string;
  icono: string;
}

// Stat(s) con más puntos invertidos. Puede haber empate, en cuyo caso se ofrece
// más de un poder para que el jugador decida.
const statsDominantes = (stats: { fue: number; int: number; agi: number }): Array<'fue' | 'int' | 'agi'> => {
  const max = Math.max(stats.fue, stats.int, stats.agi);
  if (max === 0) return [];
  return (['fue', 'int', 'agi'] as const).filter((s) => stats[s] === max);
};

export const PoderesView = ({ perfil, onPoderAprendido }: PoderesViewProps) => {
  const [catalogo, setCatalogo] = useState<Poder[]>([]);
  const [aprendidos, setAprendidos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [poderExpandido, setPoderExpandido] = useState<string | null>(null);
  const [aprendiendoPoder, setAprendiendoPoder] = useState<string | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    const [catalogoRes, aprendidosRes] = await Promise.all([
      supabase.from('powers').select('id, nombre, tipo, stat_requerido, tier, descripcion, icono'),
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

  // Tier 1 a los 3 puntos, tier 2 a los 7 — por el stat dominante EN ESE MOMENTO,
  // sin perder lo ya aprendido en el tier anterior.
  const poderesPendientes: Poder[] = catalogo.filter((p) => {
    if (perfil.clase !== 'Marginado') return false;
    if (aprendidos.includes(p.nombre)) return false;
    if (!dominantes.includes(p.stat_requerido)) return false;
    if (p.tier === 1) return puntosAsignados >= 3;
    if (p.tier === 2) return puntosAsignados >= 7;
    return false;
  });

  const poderesAprendidosInfo = catalogo.filter((p) => aprendidos.includes(p.nombre));

  return (
    <Layout
      nombre={perfil.nombre_personaje}
      clase={perfil.clase}
      nivel={perfil.nivel}
      zona={perfil.zona}
    >
      <div className="container mt-2">
        <div className="text-center mb-3" style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: '1px', color: theme.accent }}>
          <i className="bi bi-bezier2 me-2"></i>Poderes
        </div>

        {cargando && (
          <p className="text-center" style={{ fontFamily: 'var(--font-body)', color: theme.border }}>
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
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.border }}>
                        <i className={`bi bi-${expandido ? 'chevron-up' : 'chevron-right'}`}></i>
                      </span>
                    </button>
                    {expandido && (
                      <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', color: theme.border, fontSize: '0.9rem' }}>
                        <p style={{ marginBottom: '0.5rem' }}>{poder.descripcion}</p>
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
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.border }}>
                    <i className={`bi bi-${poderExpandido === poder.nombre ? 'chevron-up' : 'chevron-right'}`}></i>
                  </span>
                </button>
                {poderExpandido === poder.nombre && (
                  <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', color: theme.border, fontSize: '0.9rem' }}>
                    <p>{poder.descripcion}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!cargando && poderesPendientes.length === 0 && poderesAprendidosInfo.length === 0 && (
          <p className="text-center" style={{ fontFamily: 'var(--font-body)', color: theme.border, marginTop: '2rem' }}>
            Todavía no tienes poderes. Reparte puntos de talento en tu perfil para desbloquear el primero a los 3 puntos.
          </p>
        )}
      </div>
    </Layout>
  );
};
