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
  };
  onIrAPoderes?: () => void;
}

const xpBaseNivel = (nivel: number): number => {
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

// Stat(s) con más puntos invertidos. Se usa SOLO para saber si hay un poder pendiente
// que mostrar como aviso — la elección real vive en PoderesView.
const statsDominantes = (stats: { fue: number; int: number; agi: number }): Array<'fue' | 'int' | 'agi'> => {
  const max = Math.max(stats.fue, stats.int, stats.agi);
  if (max === 0) return [];
  return (['fue', 'int', 'agi'] as const).filter((s) => stats[s] === max);
};

export const ProfileView = ({ perfil, onIrAPoderes }: ProfileViewProps) => {
  const [profile, setProfile] = useState(perfil);
  const [puntosDisponibles, setPuntosDisponibles] = useState(() => {
    const asignados = perfil.fue + perfil.int + perfil.agi;
    const totales = perfil.nivel - 1;
    return totales - asignados > 0 ? totales - asignados : 0;
  });
  const [guardandoStat, setGuardandoStat] = useState<'fue' | 'int' | 'agi' | null>(null);

  // Solo para saber si hay un poder pendiente de elegir (aviso, sin UI de detalle aquí).
  const [statsConPoderPendiente, setStatsConPoderPendiente] = useState<Set<string>>(new Set());

  const revisarPoderPendiente = async () => {
    const [catalogoRes, aprendidosRes] = await Promise.all([
      supabase.from('powers').select('nombre, stat_requerido, tier'),
      supabase.from('character_powers').select('powers(nombre)').eq('telegram_id', perfil.telegram_id),
    ]);
    if (!catalogoRes.data) return;
    const aprendidos = (aprendidosRes.data ?? []).map((row: any) => row.powers.nombre);
    const puntosAsignados = perfil.fue + perfil.int + perfil.agi;
    const dominantes = statsDominantes({ fue: perfil.fue, int: perfil.int, agi: perfil.agi });
    const pendientes = catalogoRes.data.filter((p: any) => {
      if (perfil.clase !== 'Marginado') return false;
      if (aprendidos.includes(p.nombre)) return false;
      if (!dominantes.includes(p.stat_requerido)) return false;
      if (p.tier === 1) return puntosAsignados >= 3;
      if (p.tier === 2) return puntosAsignados >= 7;
      return false;
    });
    setStatsConPoderPendiente(new Set(pendientes.map((p: any) => p.stat_requerido)));
  };

  useEffect(() => {
    revisarPoderPendiente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id, perfil.fue, perfil.int, perfil.agi]);

  // Resincroniza el estado local cada vez que el perfil del padre cambia
  // (ej. al subir de nivel por XP ganada en el grupo, o al recargar el perfil desde Supabase).
  // Sin esto, `profile` quedaba congelado con los valores del primer render.
  useEffect(() => {
    setProfile(perfil);
    const asignados = perfil.fue + perfil.int + perfil.agi;
    const totales = perfil.nivel - 1;
    setPuntosDisponibles(totales - asignados > 0 ? totales - asignados : 0);
  }, [perfil]);

  const hayPoderPendiente = statsConPoderPendiente.size > 0;

  const asignarPunto = async (stat: 'fue' | 'int' | 'agi') => {
    if (puntosDisponibles <= 0 || guardandoStat || hayPoderPendiente) return;

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

  const mostrarBotones = puntosDisponibles > 0 && !hayPoderPendiente;

  const estadisticasSecundarias = [
    { label: 'Ataque físico', valor: calcularAtaqueFisico(profile.fue, profile.nivel), icono: 'emoji-angry' },
    { label: 'Ataque mágico', valor: calcularAtaqueMagico(profile.int, profile.nivel), icono: 'magic' },
    { label: 'Defensa física', valor: calcularDefensaFisica(profile.fue, profile.nivel), icono: 'shield' },
    { label: 'Defensa mágica', valor: calcularDefensaMagica(profile.int, profile.nivel), icono: 'shield-exclamation' },
    { label: 'Precisión', valor: `${calcularPrecision(profile.agi)}%`, icono: 'bullseye' },
    { label: 'Escape', valor: `${calcularEvasion(profile.agi)}%`, icono: 'leaf' },
    { label: 'Velocidad', valor: calcularVelocidad(profile.agi), icono: 'speedometer' },
    { label: 'Suerte', valor: calcularSuerte(profile.nivel), icono: 'dice-4' },
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

        {/* AVISO: hay un poder por elegir → manda a la sección de Poderes */}
        {hayPoderPendiente && (
          <button
            onClick={() => onIrAPoderes && onIrAPoderes()}
            className="w-100 mt-2 mb-3"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.6rem 0.9rem',
              backgroundColor: 'rgba(255,255,0,0.06)',
              border: `1px solid ${theme.accent}`,
              borderRadius: '4px',
              color: theme.accent,
              fontFamily: 'var(--font-body)',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            <i className="bi bi-bezier2" style={{ fontSize: '1.2rem' }}></i>
            <span>Tienes un poder por elegir</span>
            <i className="bi bi-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}></i>
          </button>
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
      </div>
    </Layout>
  );
};
