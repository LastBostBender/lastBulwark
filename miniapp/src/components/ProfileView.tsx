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
    energia_max: number;
    ps_max: number;
    pm_max: number;
    ps_actual: number;
    pm_actual: number;
    ataque_fisico: number;
    ataque_magico: number;
    defensa_fisica: number;
    defensa_magica: number;
    precision_stat: number;
    escape: number;
    velocidad: number;
    suerte: number;
    critico: number;
    aura: number;
    elo: number;
    oro: number;
    clase_id: number;
  };
  onNavigate?: (vista: 'perfil' | 'mazmorra' | 'inventario' | 'poderes' | 'mercado') => void;
  // Notifica al padre (Profile.tsx) cada vez que el perfil cambia localmente,
  // para que otras vistas (ej. PoderesView) reciban datos frescos sin recargar.
  onProfileChange?: (perfil: any) => void;
}

// Costo de XP para subir del nivel dado al siguiente, calculado desde 0
// (no acumulado histórico — ver sumar_xp/mb_otorgar_xp en el backend).
const xpNecesaria = (nivel: number): number => {
  return Math.floor(20 * Math.pow(nivel, 1.8));
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

export const ProfileView = ({ perfil, onNavigate, onProfileChange }: ProfileViewProps) => {
  const [profile, setProfile] = useState(perfil);
  const [puntosDisponibles, setPuntosDisponibles] = useState(() => {
    const asignados = perfil.fue + perfil.int + perfil.agi;
    const totales = perfil.nivel - 1;
    return totales - asignados > 0 ? totales - asignados : 0;
  });
  const [guardandoStat, setGuardandoStat] = useState<'fue' | 'int' | 'agi' | null>(null);

  // Solo para saber si hay un poder pendiente de elegir (aviso, sin UI de detalle aquí).
  const [statsConPoderPendiente, setStatsConPoderPendiente] = useState<Set<string>>(new Set());

  // Bonus % de los pasivos de zona SIEMPRE-ACTIVOS que apliquen ahora mismo
  // (según temporada real). Ej: { ataque_fisico: 5, ataque_magico: 5 } para
  // "Hijos del sol" en Las Calderas durante el verano.
  const [bonusZona, setBonusZona] = useState<Record<string, number>>({});
  const [pasivosZonaActivos, setPasivosZonaActivos] = useState<{ nombre: string; descripcion_flavor: string }[]>([]);

  // Bono de ps_max/pm_max de buffs de descanso vigentes (ej. Limonada). Se
  // calcula acá en vez de depender de profile.ps_max/pm_max porque esa
  // columna en `profiles` NUNCA incluye el buff (el trigger de stats
  // derivados solo suma fue/int/agi/nivel/bono_equipo) y además cualquier
  // refetch crudo de la fila — incluido el UPDATE que hace el propio RPC de
  // regenerar_recursos, que dispara la suscripción Realtime en Profile.tsx —
  // pisaría un valor "parchado" en el estado local. Sumarlo en cada render
  // es lo único que sobrevive a esos refrescos.
  const [bonoMaxBuffs, setBonoMaxBuffs] = useState({ ps_max: 0, pm_max: 0, regen_ps: 0, regen_pm: 0 });

  // stat_principal de cada clase, para calcular Versatilidad (antes era un
  // stub que siempre devolvía null — nunca llegaba a mostrar nada).
  const [clases, setClases] = useState<{ id: number; stat_principal: 'fue' | 'int' | 'agi' }[]>([]);

  useEffect(() => {
    supabase
      .from('classes')
      .select('id, stat_principal')
      .then(({ data }) => {
        if (data) setClases(data as { id: number; stat_principal: 'fue' | 'int' | 'agi' }[]);
      });
  }, []);

  const cargarBonoMaxBuffs = async () => {
    const { data } = await supabase
      .from('character_buffs_activos')
      .select('stats')
      .eq('telegram_id', perfil.telegram_id)
      .gt('expira_en', new Date().toISOString());
    if (!data) return;
    const bono = { ps_max: 0, pm_max: 0, regen_ps: 0, regen_pm: 0 };
    for (const fila of data as any[]) {
      bono.ps_max += Number(fila.stats?.ps_max ?? 0);
      bono.pm_max += Number(fila.stats?.pm_max ?? 0);
      bono.regen_ps += Number(fila.stats?.regen_ps ?? 0);
      bono.regen_pm += Number(fila.stats?.regen_pm ?? 0);
    }
    setBonoMaxBuffs(bono);
  };

  useEffect(() => {
    cargarBonoMaxBuffs();
    // Se refresca cada 30s para que el techo baje solo apenas vence el buff,
    // sin depender de que el jugador reabra la pantalla.
    const id = setInterval(cargarBonoMaxBuffs, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id]);

  const cargarPasivosZona = async () => {
    const [bonusRes, temporadaRes] = await Promise.all([
      supabase.rpc('obtener_bonus_zona', { p_zona: perfil.zona }),
      supabase.rpc('temporada_actual'),
    ]);
    if (bonusRes.data) {
      const mapa: Record<string, number> = {};
      for (const fila of bonusRes.data as any[]) mapa[fila.stat] = Number(fila.bonus_pct);
      setBonusZona(mapa);
    }
    const temporadaActual = temporadaRes.data as string | null;
    let query = supabase
      .from('zone_passives')
      .select('nombre, descripcion_flavor')
      .eq('zona', perfil.zona);
    if (temporadaActual) query = query.or(`temporada.is.null,temporada.eq.${temporadaActual}`);
    const listaRes = await query;
    if (listaRes.data) setPasivosZonaActivos(listaRes.data as any[]);
  };

  useEffect(() => {
    cargarPasivosZona();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.zona]);

  // Al entrar al perfil, se calcula cuánto PS/PM se regeneraron desde la
  // última vez (RPC en la DB, basado en minutos transcurridos) y se sincroniza
  // el estado local con los valores reales — ya no es un número decorativo.
  const regenerarRecursos = async () => {
    const { data, error } = await supabase
      .rpc('regenerar_recursos', { p_telegram_id: perfil.telegram_id })
      .single();
    if (error) {
      console.error('Error regenerando recursos:', error);
      return;
    }
    if (data) {
      setProfile((prev) => {
        // Solo ps_actual/pm_actual: el RPC devuelve ps_max/pm_max EFECTIVOS
        // (base + buffs) para el clamp interno, pero esta vista ya calcula
        // ese mismo bono por separado (bonoMaxBuffs, ver más abajo) para que
        // sobreviva a refrescos crudos de `profiles` — sumarlo también acá
        // lo duplicaría.
        const actualizado = {
          ...prev,
          ps_actual: (data as any).ps_actual,
          pm_actual: (data as any).pm_actual,
        };
        onProfileChange?.(actualizado);
        return actualizado;
      });
    }
  };

  const regenerarEnergia = async () => {
    const { data, error } = await supabase
      .rpc('regenerar_energia', { p_telegram_id: perfil.telegram_id })
      .single();
    if (error) {
      console.error('Error regenerando energía:', error);
      return;
    }
    if (data) {
      setProfile((prev) => {
        const actualizado = {
          ...prev,
          energia: (data as any).energia,
          energia_max: (data as any).energia_max,
        };
        onProfileChange?.(actualizado);
        return actualizado;
      });
    }
  };

  useEffect(() => {
    regenerarRecursos();
    regenerarEnergia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id]);

  const revisarPoderPendiente = async (stats: { fue: number; int: number; agi: number }) => {
    const [catalogoRes, aprendidosRes] = await Promise.all([
      supabase.from('powers').select('nombre, stat_requerido, tier'),
      supabase.from('character_powers').select('powers(nombre)').eq('telegram_id', perfil.telegram_id),
    ]);
    if (!catalogoRes.data) return;
    const aprendidos = (aprendidosRes.data ?? []).map((row: any) => row.powers.nombre);
    const puntosAsignados = stats.fue + stats.int + stats.agi;
    const dominantes = statsDominantes(stats);
    const tiersYaElegidos = new Set(
      catalogoRes.data.filter((p: any) => aprendidos.includes(p.nombre)).map((p: any) => p.tier)
    );
    const pendientes = catalogoRes.data.filter((p: any) => {
      if (perfil.clase !== 'NPC consciente') return false;
      if (aprendidos.includes(p.nombre)) return false;
      if (tiersYaElegidos.has(p.tier)) return false;
      if (!dominantes.includes(p.stat_requerido)) return false;
      if (p.tier === 1) return puntosAsignados >= 4;
      if (p.tier === 2) return puntosAsignados >= 7;
      return false;
    });
    setStatsConPoderPendiente(new Set(pendientes.map((p: any) => p.stat_requerido)));
  };

  useEffect(() => {
    revisarPoderPendiente({ fue: profile.fue, int: profile.int, agi: profile.agi });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.telegram_id, profile.fue, profile.int, profile.agi]);

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

  // Clase pendiente: mismo umbral que tier 1/2 (suma fue+int+agi), un
  // escalón más arriba (9), y solo aplica antes de elegir clase.
  const hayClasePendiente =
    profile.clase === 'NPC consciente' &&
    profile.nivel >= 10 &&
    profile.fue + profile.int + profile.agi >= 9;

  const asignarPunto = async (stat: 'fue' | 'int' | 'agi') => {
    if (puntosDisponibles <= 0 || guardandoStat || hayPoderPendiente) return;

    const valorAnterior = profile[stat];
    const puntosAnteriores = puntosDisponibles;
    const nuevo = { ...profile, [stat]: valorAnterior + 1 };

    // Actualización optimista de la UI (local y padre, para que Poderes ya vea el cambio)
    setProfile(nuevo);
    setPuntosDisponibles(puntosAnteriores - 1);
    setGuardandoStat(stat);
    onProfileChange?.(nuevo);

    // select('*') en vez de solo ps_max/pm_max: el trigger de la DB recalcula
    // también ataque/defensa/precisión/etc., y antes esas quedaban desincronizadas
    // hasta refrescar la miniapp a mano.
    const { data, error } = await supabase
      .from('profiles')
      .update({ [stat]: nuevo[stat] })
      .eq('telegram_id', profile.telegram_id)
      .select('*')
      .single();

    setGuardandoStat(null);

    if (error) {
      // Revertir si falla el guardado en Supabase
      console.error('Error guardando punto de talento:', error);
      const revertido = { ...profile, [stat]: valorAnterior };
      setProfile(revertido);
      setPuntosDisponibles(puntosAnteriores);
      onProfileChange?.(revertido);
      return;
    }

    // Se sincroniza con TODO lo que devolvió la DB (incluye stats derivadas
    // recalculadas por el trigger). ps_max/pm_max quedan en base sin buff acá,
    // pero eso ya no importa: psMax/pmMax en el render suman bonoMaxBuffs aparte.
    if (data) {
      setProfile((prev) => {
        const actualizado = { ...prev, ...data };
        onProfileChange?.(actualizado);
        return actualizado;
      });
    }
  };

  const theme = getTheme(profile.zona);

  const psMax = profile.ps_max + bonoMaxBuffs.ps_max;
  const pmMax = profile.pm_max + bonoMaxBuffs.pm_max;
  const psActual = Math.min(profile.ps_actual, psMax);
  const pmActual = Math.min(profile.pm_actual, pmMax);

  // xp_total ya viene del backend como progreso DENTRO del nivel actual
  // (arranca en 0 al subir de nivel, con el sobrante acarreado) — no acumulado
  // histórico, así que aquí no se resta ninguna base.
  const xpEnEsteNivel = profile.xp_total;
  const xpParaSubir = xpNecesaria(profile.nivel);

  // regen_ps / regen_pm: bonus de Voracidad (Brote de Acero) aplicado al ritmo
  // mostrado, más el bono plano de buffs de descanso vigentes (ej. Limonada
  // +1 regen_pm) — coincide con la fórmula real de regenerar_recursos.
  const regenPS = ((profile.fue * 0.4) + (profile.agi * 0.1) + 2 + bonoMaxBuffs.regen_ps) * (1 + (bonusZona.regen_ps ?? 0) / 100);
  const regenPM = ((profile.int * 0.5) + (profile.agi * 0.1) + 1 + bonoMaxBuffs.regen_pm) * (1 + (bonusZona.regen_pm ?? 0) / 100);

  // Aplica el bonus de zona (si corresponde) a una stat de combate persistida.
  const conBonus = (statKey: string, base: number) =>
    Math.round(base * (1 + (bonusZona[statKey] ?? 0) / 100));

  const statPrincipal = clases.find((c) => c.id === profile.clase_id)?.stat_principal ?? null;
  const versatilidad = statPrincipal ? calcularVersatilidad(statPrincipal, { fue: profile.fue, int: profile.int, agi: profile.agi }) : 0;
  const mostrarVersatilidad = profile.nivel >= 5 && profile.clase !== 'NPC consciente';

  const psPorcentaje = Math.min(100, (psActual / psMax) * 100);
  const pmPorcentaje = Math.min(100, (pmActual / pmMax) * 100);
  const energiaPorcentaje = Math.min(100, (profile.energia / Math.max(1, profile.energia_max)) * 100);
  const xpPorcentaje = Math.min(100, (xpEnEsteNivel / xpParaSubir) * 100);

  const mostrarBotones = puntosDisponibles > 0 && !hayPoderPendiente;

  const estadisticasSecundarias = [
    { label: 'Ataque físico', valor: conBonus('ataque_fisico', profile.ataque_fisico), icono: 'emoji-angry', bonus: bonusZona.ataque_fisico },
    { label: 'Ataque mágico', valor: conBonus('ataque_magico', profile.ataque_magico), icono: 'magic', bonus: bonusZona.ataque_magico },
    { label: 'Defensa física', valor: conBonus('defensa_fisica', profile.defensa_fisica), icono: 'shield', bonus: bonusZona.defensa_fisica },
    { label: 'Defensa mágica', valor: conBonus('defensa_magica', profile.defensa_magica), icono: 'shield-exclamation', bonus: bonusZona.defensa_magica },
    { label: 'Precisión', valor: `${profile.precision_stat}%`, icono: 'bullseye' },
    { label: 'Escape', valor: `${profile.escape}%`, icono: 'leaf' },
    { label: 'Velocidad', valor: profile.velocidad, icono: 'speedometer' },
    { label: 'Suerte', valor: profile.suerte, icono: 'dice-4' },
    { label: 'Crítico', valor: `${profile.critico}%`, icono: 'arrow-through-heart' },
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
      vistaActual="perfil"
      onNavigate={onNavigate}
    >
      <div className="container mt-2">
        {/* BARRAS DE RECURSOS */}
        <div className="row g-2 mb-3" style={{ fontSize: '0.85rem' }}>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-heart text-success"></i> {psActual}/{psMax}</span>
              <span className="text-success" style={{ fontSize: '0.7rem' }}>
                <i className="bi bi-hearts text-success"></i> +{regenPS.toFixed(1)}/m{!!bonusZona.regen_ps && ' 🌿'}
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
                <i className="bi bi-droplet-half text-info"></i> +{regenPM.toFixed(1)}/m{!!bonusZona.regen_pm && ' 🌿'}
              </span>
            </div>
            <div className="progress-custom">
              <div className="bar bg-info" style={{ width: `${pmPorcentaje}%` }}></div>
            </div>
          </div>
          <div className="col-6">
            <div className="d-flex justify-content-between text-nowrap">
              <span><i className="bi bi-lightning-charge text-warning"></i> {profile.energia}/{profile.energia_max}</span>
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
          <div className="text-center" style={{ fontSize: '0.7rem', color: theme.text, marginTop: '0.2rem' }}>
            {puntosDisponibles > 0 ? (
              <span style={{ color: theme.accent }}>Puntos de stats: {puntosDisponibles}</span>
            ) : (
              <span style={{ color: theme.text }}>Sin puntos de stats</span>
            )}
          </div>
        </div>

        {/* AVISO: nivel + puntos alcanzan para elegir clase → manda a Poderes */}
        {hayClasePendiente && (
          <button
            onClick={() => onNavigate && onNavigate('poderes')}
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
            <i className="bi bi-award" style={{ fontSize: '1.2rem' }}></i>
            <span>Tienes una clase por elegir</span>
            <i className="bi bi-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}></i>
          </button>
        )}

        {/* AVISO: hay un poder por elegir → manda a la sección de Poderes */}
        {hayPoderPendiente && (
          <button
            onClick={() => onNavigate && onNavigate('poderes')}
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
              <span className="fw-bold" style={{ color: theme.text }}>
                {stat.valor}
                {!!stat.bonus && (
                  <span style={{ color: theme.accent, fontSize: '0.7rem', marginLeft: '0.35rem' }}>
                    (+{stat.bonus}% zona)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* PASIVOS DE ZONA ACTIVOS — para que se note la diferencia, no solo el número */}
        {pasivosZonaActivos.length > 0 && (
          <div className="mt-3 px-1" style={{ fontSize: '0.75rem' }}>
            <div className="mb-1" style={{ color: theme.accent }}>
              <i className="bi bi-geo-alt-fill me-1"></i> Pasivo{pasivosZonaActivos.length > 1 ? 's' : ''} de {profile.zona}
            </div>
            {pasivosZonaActivos.map((p) => (
              <div key={p.nombre} style={{ color: theme.text, marginBottom: '0.15rem' }}>
                <span style={{ color: theme.text }}>{p.nombre}:</span> {p.descripcion_flavor}
              </div>
            ))}
          </div>
        )}

        {/* ORO / AURA / ELO */}
        <div
          className="mt-3 text-center d-flex align-items-center justify-content-center"
          style={{ fontSize: '0.8rem', color: theme.accent, gap: '1rem' }}
        >
          <span>
            <i className="bi bi-coin me-1"></i> {profile.oro}
          </span>
          <span>
            <i className="bi bi-ticket-detailed me-1"></i> {profile.aura}
          </span>
          <span>
            <i className="bi bi-award me-1"></i> {profile.elo}
          </span>
        </div>
      </div>
    </Layout>
  );
};
