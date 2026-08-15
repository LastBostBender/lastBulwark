import { useState, useEffect } from 'react';
import { Layout } from './Layout';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

interface ProfileViewProps {
  perfil: {
    telegram_id: number;
    nombre_personaje: string;
    nivel: number;
    zona: string;
    clase: string;
    xp_total: number;
    fue: number;
    int: number;
    agi: number;
    energia: number;
    ps_max: number;
    pm_max: number;
    poder_elegido?: string | null;
  };
  onPoderSeleccionado?: (poder: string) => void;
}

const xpBaseNivel = (nivel: number): number => {
  if (nivel <= 1) return 0;
  return Math.floor(20 * Math.pow(nivel, 1.8));
};

const xpNecesaria = (nivel: number): number => {
  return Math.floor(20 * Math.pow(nivel + 1, 1.8));
};

const calcularAtaqueFisico = (fue: number, nivel: number) => Math.floor(fue * 1.5 + nivel * 0.5);
const calcularAtaqueMagico = (int: number, nivel: number) => Math.floor(int * 1.5 + nivel * 0.5);
const calcularDefensaFisica = (fue: number, nivel: number) => Math.floor(fue * 0.8 + nivel * 0.3);
const calcularDefensaMagica = (int: number, nivel: number) => Math.floor(int * 0.8 + nivel * 0.3);
const calcularPrecision = (agi: number) => Math.floor(70 + agi * 0.5);
const calcularEvasion = (agi: number) => Math.floor(5 + agi * 0.4);
const calcularVelocidad = (agi: number) => Math.floor(10 + agi * 0.3);
const calcularSuerte = (nivel: number) => Math.floor(5 + nivel * 0.3);

const getStatPrincipal = (clase: string): 'fue' | 'int' | 'agi' | null => {
  if (clase === 'Marginado') return null;
  return null;
};

const calcularVersatilidad = (statPrincipal: 'fue' | 'int' | 'agi', stats: { fue: number; int: number; agi: number }) => {
  const valor = stats[statPrincipal];
  return Math.floor(1 + valor * 0.05);
};

const descripcionesPoderes: Record<string, { icono: string; descripcion: string; stat: 'fue' | 'int' | 'agi' }> = {
  'Golpe de rabia': {
    icono: 'emoji-angry-fill',
    descripcion: 'Golpea descontroladamente a tu enemigo produciendo 150 % de daÃ±o. Al perder el control disminuye un 5 % tu defensa fÃ­sica durante 3 turnos.',
    stat: 'fue',
  },
  'Cauterizar': {
    icono: 'fire',
    descripcion: 'Cauteriza las heridas produciendo un 10 % de daÃ±o y, consecuentemente, sana un 48 % de tu vida actual durante los siguientes 3 turnos.',
    stat: 'int',
  },
  'Empujar': {
    icono: 'person-arms-up',
    descripcion: 'Empuja a tu enemigo y lo inhabilitas en el siguiente turno, pero al acercÃ¡rtele tu probabilidad de escape disminuye un 15 %.',
    stat: 'agi',
  },
};

export const ProfileView = ({ perfil, onPoderSeleccionado }: ProfileViewProps) => {
  const [profile, setProfile] = useState(perfil);
  const [puntosDisponibles, setPuntosDisponibles] = useState(() => {
    const asignados = perfil.fue + perfil.int + perfil.agi;
    const totales = perfil.nivel - 1;
    return totales - asignados > 0 ? totales - asignados : 0;
  });
  const [poderElegido, setPoderElegido] = useState<string | null>(perfil.poder_elegido || null);
  const [poderExpandido, setPoderExpandido] = useState<string | null>(null);
  const [guardandoStat, setGuardandoStat] = useState<'fue' | 'int' | 'agi' | null>(null);

  // Resincroniza el estado local cada vez que el perfil del padre cambia
  // (ej. al subir de nivel por XP ganada en el grupo, o al recargar el perfil desde Supabase).
  // Sin esto, `profile` quedaba congelado con los valores del primer render.
  useEffect(() => {
    setProfile(perfil);
    setPoderElegido(perfil.poder_elegido || null);
    const asignados = perfil.fue + perfil.int + perfil.agi;
    const totales = perfil.nivel - 1;
    setPuntosDisponibles(totales - asignados > 0 ? totales - asignados : 0);
  }, [perfil]);

  const asignarPunto = async (stat: 'fue' | 'int' | 'agi') => {
    if (puntosDisponibles <= 0 || guardandoStat) return;

    const valorAnterior = profile[stat];
    const puntosAnteriores = puntosDisponibles;
    const nuevo = { ...profile, [stat]: valorAnterior + 1 };

    // Actualización optimista de la UI
    setProfile(nuevo);
    setPuntosDisponibles(puntosAnteriores - 1);
    setGuardandoStat(stat);

    const { data, error } = await supabase
      .from('profiles')
      .update({ [stat]: nuevo[stat] })
      .eq('telegram_id', profile.telegram_id)
      .select('ps_max, pm_max')
      .single();

    setGuardandoStat(null);

    if (error) {
      // Revertir si falla el guardado en Supabase
      console.error('Error guardando punto de talento:', error);
      setProfile((prev) => ({ ...prev, [stat]: valorAnterior }));
      setPuntosDisponibles(puntosAnteriores);
      return;
    }

    // ps_max/pm_max los recalcula un trigger en la DB al actualizar fue/int/nivel;
    // los tomamos de la respuesta para que la UI quede exactamente en sync con la DB.
    if (data) {
      setProfile((prev) => ({ ...prev, ps_max: data.ps_max, pm_max: data.pm_max }));
    }
  };

  const seleccionarPoder = async (poder: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ poder_elegido: poder })
      .eq('telegram_id', profile.telegram_id);
    if (!error) {
      setPoderElegido(poder);
      setPoderExpandido(null);
      if (onPoderSeleccionado) onPoderSeleccionado(poder);
    }
  };

  const toggleExpandir = (poder: string) => {
    setPoderExpandido(poderExpandido === poder ? null : poder);
  };

  const cancelarSeleccion = () => setPoderExpandido(null);

  const theme = getTheme(profile.zona);

  const psMax = profile.ps_max;
  const pmMax = profile.pm_max;
  const psActual = psMax;
  const pmActual = pmMax;

  const xpBase = xpBaseNivel(profile.nivel);
  const xpSiguiente = xpNecesaria(profile.nivel);
  const xpEnEsteNivel = profile.xp_total - xpBase;
  const xpParaSubir = xpSiguiente - xpBase;

  const regenPS = (profile.fue * 0.4) + (profile.agi * 0.1) + 2;
  const regenPM = (profile.int * 0.5) + (profile.agi * 0.1) + 1;

  const statPrincipal = getStatPrincipal(profile.clase);
  const versatilidad = statPrincipal ? calcularVersatilidad(statPrincipal, { fue: profile.fue, int: profile.int, agi: profile.agi }) : 0;
  const mostrarVersatilidad = profile.nivel >= 5 && profile.clase !== 'Marginado';

  const psPorcentaje = Math.min(100, (psActual / psMax) * 100);
  const pmPorcentaje = Math.min(100, (pmActual / pmMax) * 100);
  const energiaPorcentaje = Math.min(100, (profile.energia / 5) * 100);
  const xpPorcentaje = Math.min(100, (xpEnEsteNivel / xpParaSubir) * 100);

  const puntosAsignados = profile.fue + profile.int + profile.agi;
  const mostrarEleccionPoder = !poderElegido && profile.clase === 'Marginado' && puntosAsignados >= 3;

  const poderesDisponibles = Object.entries(descripcionesPoderes)
    .filter(([_nombre, info]) => profile[info.stat] >= 1) // <--- CORREGIDO: _nombre
    .map(([nombre]) => nombre);

  const mostrarBotones = puntosDisponibles > 0 && !mostrarEleccionPoder;

  const estadisticasSecundarias = [
    { label: 'Ataque físico', valor: calcularAtaqueFisico(profile.fue, profile.nivel), icono: 'emoji-angry' },
    { label: 'Ataque mágico', valor: calcularAtaqueMagico(profile.int, profile.nivel), icono: 'magic' },
    { label: 'Defensa física', valor: calcularDefensaFisica(profile.fue, profile.nivel), icono: 'shield' },
    { label: 'Defensa mágica', valor: calcularDefensaMagica(profile.int, profile.nivel), icono: 'shield-exclamation' },
    { label: 'Precisión', valor: `${calcularPrecision(profile.agi)}%`, icono: 'bullseye' },
    { label: 'Escape', valor: `${calcularEvasion(profile.agi)}%`, icono: 'leaf' },
    { label: 'Velocidad', valor: calcularVelocidad(profile.agi), icono: 'speedometer' },
    { label: 'Suerte', valor: calcularSuerte(profile.nivel), icono: 'dice-5' },
  ];

  if (mostrarVersatilidad) {
    estadisticasSecundarias.push({ label: 'Versatilidad', valor: `+${versatilidad}%`, icono: 'stars' });
  }

  return (
    <Layout
      nombre={profile.nombre_personaje}
      clase={profile.clase}
      nivel={profile.nivel}
      zona={profile.zona}
    >
      <div className="container mt-2">
        {/* BARRAS DE RECURSOS */}
        <div className="row g-2 mb-3" style={{ fontSize: '0.85rem' }}>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-heart text-success"></i> {psActual}/{psMax}</span>
              <span className="text-success" style={{ fontSize: '0.7rem' }}>
                <i className="bi bi-hearts text-success"></i> +{regenPS.toFixed(1)}/m
              </span>
            </div>
            <div className="progress-custom">
              <div className="bar bg-success" style={{ width: `${psPorcentaje}%` }}></div>
            </div>
          </div>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-water text-info"></i> {pmActual}/{pmMax}</span>
              <span className="text-info" style={{ fontSize: '0.7rem' }}>
                <i className="bi bi-droplet-half text-info"></i> +{regenPM.toFixed(1)}/m
              </span>
            </div>
            <div className="progress-custom">
              <div className="bar bg-info" style={{ width: `${pmPorcentaje}%` }}></div>
            </div>
          </div>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-lightning-charge text-warning"></i> {profile.energia}/5</span>
            </div>
            <div className="progress-custom">
              <div className="bar bg-warning" style={{ width: `${energiaPorcentaje}%` }}></div>
            </div>
          </div>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-tropical-storm" style={{ color: '#a855f7' }}></i> {xpEnEsteNivel}/{xpParaSubir}</span>
            </div>
            <div className="progress-custom">
              <div className="progress" style={{ height: '0.8rem' }}>
                <div className="progress-bar" style={{ backgroundColor: '#a855f7', width: `${xpPorcentaje}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* ESTADÍSTICAS PRINCIPALES */}
        <div className="mb-2">
          <div className="d-flex flex-nowrap gap-1 justify-content-center align-items-center">
            <div className="text-center" style={{ minWidth: '60px' }}>
              <span className="badge bg-danger text-white" style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem' }}>
                <i className="bi bi-hammer me-1"></i>FUE {profile.fue}
              </span>
              <div style={{ height: '1.2rem' }}>
                {mostrarBotones && (
                  <span
                    className="badge bg-danger text-white"
                    style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', cursor: guardandoStat ? 'wait' : 'pointer', opacity: guardandoStat ? 0.6 : 1 }}
                    onClick={() => asignarPunto('fue')}
                  >
                    <i className="bi bi-plus"></i>
                  </span>
                )}
              </div>
            </div>
            <div className="text-center" style={{ minWidth: '60px' }}>
              <span className="badge bg-primary text-white" style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem' }}>
                <i className="bi bi-eyeglasses me-1"></i>INT {profile.int}
              </span>
              <div style={{ height: '1.2rem' }}>
                {mostrarBotones && (
                  <span
                    className="badge bg-primary text-white"
                    style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', cursor: guardandoStat ? 'wait' : 'pointer', opacity: guardandoStat ? 0.6 : 1 }}
                    onClick={() => asignarPunto('int')}
                  >
                    <i className="bi bi-plus"></i>
                  </span>
                )}
              </div>
            </div>
            <div className="text-center" style={{ minWidth: '60px' }}>
              <span className="badge bg-success text-white" style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem' }}>
                <i className="bi bi-eye me-1"></i>AGI {profile.agi}
              </span>
              <div style={{ height: '1.2rem' }}>
                {mostrarBotones && (
                  <span
                    className="badge bg-success text-white"
                    style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', cursor: guardandoStat ? 'wait' : 'pointer', opacity: guardandoStat ? 0.6 : 1 }}
                    onClick={() => asignarPunto('agi')}
                  >
                    <i className="bi bi-plus"></i>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-center" style={{ fontSize: '0.7rem', color: theme.border, marginTop: '0.2rem' }}>
            {puntosDisponibles > 0 ? (
              <span style={{ color: theme.accent }}>Puntos de stats: {puntosDisponibles}</span>
            ) : (
              <span style={{ color: theme.border }}>Sin puntos de stats</span>
            )}
          </div>
        </div>

        {/* PODERES A APRENDER */}
        {mostrarEleccionPoder && poderesDisponibles.length > 0 && (
          <div className="mt-3">
            <div className="text-center mb-2" style={{ color: theme.accent, fontSize: '0.8rem' }}>
              <i className="bi bi-brilliance me-1"></i> Elige un poder
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {poderesDisponibles.map((poder) => {
                const expandido = poderExpandido === poder;
                return (
                  <div key={poder} style={{ borderBottom: `1px solid ${theme.border}40` }}>
                    <button
                      onClick={() => toggleExpandir(poder)}
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
                      <i className={`bi bi-${descripcionesPoderes[poder]?.icono ?? 'stars'}`} style={{ color: theme.accent, fontSize: '1.1rem' }}></i>
                      <span>{poder}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.border }}>
                        <i className={`bi bi-${expandido ? 'chevron-up' : 'chevron-right'}`}></i>
                      </span>
                    </button>
                    {expandido && (
                      <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', color: theme.border, fontSize: '0.9rem' }}>
                        <p style={{ marginBottom: '0.5rem' }}>{descripcionesPoderes[poder]?.descripcion}</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn rounded-circle"
                            style={{
                              width: '2rem',
                              height: '2rem',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: theme.border,
                              border: `1px solid ${theme.border}`,
                              backgroundColor: 'transparent',
                            }}
                            onClick={(e) => { e.stopPropagation(); cancelarSeleccion(); }}
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
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
                            }}
                            onClick={(e) => { e.stopPropagation(); seleccionarPoder(poder); }}
                          >
                            <i className="bi bi-check-lg"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ESTADÍSTICAS SECUNDARIAS */}
        <div className="px-1 mt-3" style={{ fontSize: '0.85rem' }}>
          {estadisticasSecundarias.map((stat, index) => (
            <div key={index} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: `${theme.border}40` }}>
              <span style={{ color: theme.text }}>
                <i className={`bi bi-${stat.icono} me-2`} style={{ color: theme.accent, fontSize: '0.8rem' }}></i>
                {stat.label}
              </span>
              <span className="fw-bold" style={{ color: theme.text }}>{stat.valor}</span>
            </div>
          ))}
        </div>

        {/* ORO */}
        <div className="mt-3 text-center" style={{ fontSize: '0.8rem', color: theme.accent }}>
          <i className="bi bi-coin me-1"></i> 0
        </div>

        {/* PODER ELEGIDO */}
        {poderElegido && (
          <div className="mt-3">
            <div className="text-center mb-2" style={{ color: theme.accent, fontSize: '0.8rem' }}>
              <i className="bi bi-brilliance me-1" style={{ color: theme.accent }}></i> Poder aprendido
            </div>
            <div style={{ borderBottom: `1px solid ${theme.border}40`, backgroundColor: 'rgba(255,255,0,0.05)' }}>
              <button
                onClick={() => toggleExpandir(poderElegido)}
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
                <i className={`bi bi-${descripcionesPoderes[poderElegido]?.icono ?? 'stars'}`} style={{ color: theme.accent, fontSize: '1.1rem' }}></i>
                <span>{poderElegido}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: theme.border }}>
                  <i className={`bi bi-${poderExpandido === poderElegido ? 'chevron-up' : 'chevron-right'}`}></i>
                </span>
              </button>
              {poderExpandido === poderElegido && (
                <div style={{ padding: '0.2rem 0.2rem 0.8rem 1.8rem', color: theme.border, fontSize: '0.9rem' }}>
                  <p>{descripcionesPoderes[poderElegido]?.descripcion}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
