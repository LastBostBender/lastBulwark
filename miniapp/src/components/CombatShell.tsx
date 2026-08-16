import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { getTheme } from '../utils/themes';

interface CombatShellProps {
  perfil: {
    telegram_id: number;
    sesion_combate_id: number | null;
    zona: string;
  };
}

interface Sesion {
  id: number;
  estado: 'en_curso' | 'victoria' | 'derrota' | 'cancelado';
  turno_actual: number;
  oleada_actual: number;
  oleadas: Array<{ numero: number; enemigos?: number; jefe?: boolean }>;
}

interface Combatiente {
  id: number;
  orden: number | null;
  tipo: 'jugador' | 'enemigo';
  telegram_id: number | null;
  nombre: string;
  vivo: boolean;
  ps_actual: number;
  ps_max: number;
  pm_actual: number;
  pm_max: number;
}

interface LogEntry {
  id: number;
  turno: number;
  descripcion: string;
  creado_en: string;
}

const Barra = ({ actual, max, color }: { actual: number; max: number; color: string }) => (
  <div className="progress-custom">
    <div
      className="bar"
      style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (actual / max) * 100)) : 0}%`, backgroundColor: color }}
    />
  </div>
);

const TarjetaCombatiente = ({ c, esSuTurno }: { c: Combatiente; esSuTurno: boolean }) => (
  <div
    className="p-2 mb-2 rounded"
    style={{
      opacity: c.vivo ? 1 : 0.4,
      border: esSuTurno ? '2px solid #f0c419' : '1px solid rgba(255,255,255,0.1)',
    }}
  >
    <div className="d-flex justify-content-between" style={{ fontFamily: 'var(--font-body)' }}>
      <span>{c.nombre}{!c.vivo && ' (caído)'}</span>
      {esSuTurno && <span style={{ color: '#f0c419' }}>▶ turno</span>}
    </div>
    <Barra actual={c.ps_actual} max={c.ps_max} color="#c0392b" />
    {c.pm_max > 0 && <Barra actual={c.pm_actual} max={c.pm_max} color="#2980b9" />}
  </div>
);

export const CombatShell = ({ perfil }: CombatShellProps) => {
  const theme = getTheme(perfil.zona);
  const sesionId = perfil.sesion_combate_id;
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [combatientes, setCombatientes] = useState<Combatiente[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!sesionId) return;
    let activo = true;

    const cargar = async () => {
      const [sesionRes, combatientesRes, logRes] = await Promise.all([
        supabase.from('combat_sesiones').select('id, estado, turno_actual, oleada_actual, oleadas').eq('id', sesionId).single(),
        supabase.from('combat_combatientes').select('*').eq('sesion_id', sesionId).order('orden'),
        supabase.from('combat_log').select('*').eq('sesion_id', sesionId).order('creado_en', { ascending: false }).limit(20),
      ]);
      if (!activo) return;
      if (sesionRes.data) setSesion(sesionRes.data as Sesion);
      if (combatientesRes.data) setCombatientes(combatientesRes.data as Combatiente[]);
      if (logRes.data) setLog((logRes.data as LogEntry[]).reverse());
      setCargando(false);
    };
    cargar();

    return () => { activo = false; };
  }, [sesionId]);

  useEffect(() => {
    if (!sesionId) return;

    const canal = supabase
      .channel(`combate-${sesionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'combat_sesiones', filter: `id=eq.${sesionId}` },
        (payload) => setSesion((prev) => (prev ? { ...prev, ...payload.new } : (payload.new as Sesion))))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combat_combatientes', filter: `sesion_id=eq.${sesionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const nuevo = payload.new as Combatiente;
          setCombatientes((prev) => {
            const existe = prev.some((c) => c.id === nuevo.id);
            return existe ? prev.map((c) => (c.id === nuevo.id ? { ...c, ...nuevo } : c)) : [...prev, nuevo].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          });
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'combat_log', filter: `sesion_id=eq.${sesionId}` },
        (payload) => setLog((prev) => [...prev, payload.new as LogEntry].slice(-20)))
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [sesionId]);

  if (!sesionId) return null;

  if (cargando || !sesion) {
    return (
      <div className="text-center mt-5">
        <div className="spinner-border text-light" role="status" />
        <p className="mt-3 text-secondary">Entrando en combate...</p>
      </div>
    );
  }

  const jugadores = combatientes.filter((c) => c.tipo === 'jugador');
  const enemigos = combatientes.filter((c) => c.tipo === 'enemigo');
  const totalOleadas = sesion.oleadas?.length ?? 0;

  return (
    <div className="container mt-3 pb-5" style={{ fontFamily: 'var(--font-body)', color: theme.text }}>
      <h5 className="text-center" style={{ fontFamily: 'var(--font-title)' }}>
        Oleada {sesion.oleada_actual}{totalOleadas > 0 && ` / ${totalOleadas}`}
      </h5>
      <p className="text-center text-secondary" style={{ fontSize: '0.85rem' }}>
        Las acciones se juegan desde el bot de Telegram — acá seguís el combate en vivo.
      </p>

      <h6 className="mt-3">Grupo</h6>
      {jugadores.map((c) => (
        <TarjetaCombatiente key={c.id} c={c} esSuTurno={c.orden === sesion.turno_actual} />
      ))}

      <h6 className="mt-3">Enemigos</h6>
      {enemigos.map((c) => (
        <TarjetaCombatiente key={c.id} c={c} esSuTurno={c.orden === sesion.turno_actual} />
      ))}

      <h6 className="mt-3">Registro</h6>
      <div className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.25)', fontSize: '0.85rem', maxHeight: '30vh', overflowY: 'auto' }}>
        {log.length === 0 && <p className="text-secondary mb-0">Sin eventos todavía.</p>}
        {log.map((entrada) => (
          <p key={entrada.id} className="mb-1">
            <span className="text-secondary">T{entrada.turno}</span> — {entrada.descripcion}
          </p>
        ))}
      </div>

      {sesion.estado !== 'en_curso' && (
        <div className="text-center mt-4">
          <h4 style={{ fontFamily: 'var(--font-title)' }}>
            {sesion.estado === 'victoria' ? '¡Victoria!' : sesion.estado === 'derrota' ? 'Derrota' : 'Encuentro cancelado'}
          </h4>
        </div>
      )}
    </div>
  );
};
