import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { getTheme } from '../utils/themes';
import { CombatShell } from './CombatShell';

interface CombatViewProps {
  perfil: {
    telegram_id: number;
    estado: string;
    sesion_combate_id: number | null;
    zona: string;
  };
  onProfileChange: (perfil: any) => void;
}

interface ColaInfo {
  encounterId: number;
  nivelJefe: number;
}

// Cupo de la cola: hardcodeado en mb_unirse_cola (v_count >= 5). Si cambia ahí, actualizar acá.
const CUPO_COLA = 5;

export const CombatView = ({ perfil }: CombatViewProps) => {
  const theme = getTheme(perfil.zona);
  const [colaInfo, setColaInfo] = useState<ColaInfo | null>(null);
  const [participantes, setParticipantes] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (perfil.estado !== 'en_cola') return;
    let activo = true;

    const cargarCola = async () => {
      setCargando(true);
      const { data: fila } = await supabase
        .from('mini_boss_queue')
        .select('encounter_id')
        .eq('telegram_id', perfil.telegram_id)
        .single();
      if (!fila || !activo) return;

      const [{ data: encuentro }, { count }] = await Promise.all([
        supabase.from('mini_boss_encounters').select('nivel_jefe').eq('id', fila.encounter_id).single(),
        supabase.from('mini_boss_queue').select('telegram_id', { count: 'exact', head: true }).eq('encounter_id', fila.encounter_id),
      ]);
      if (!activo) return;
      setColaInfo({ encounterId: fila.encounter_id, nivelJefe: encuentro?.nivel_jefe ?? 1 });
      setParticipantes(count ?? 0);
      setCargando(false);
    };
    cargarCola();

    return () => { activo = false; };
  }, [perfil.estado, perfil.telegram_id]);

  // Contador en vivo: suma 1 por cada nuevo INSERT en la cola, sin volver a pedir toda la fila.
  useEffect(() => {
    if (!colaInfo) return;
    const canal = supabase
      .channel(`cola-${colaInfo.encounterId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mini_boss_queue', filter: `encounter_id=eq.${colaInfo.encounterId}` },
        () => setParticipantes((prev) => prev + 1)
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [colaInfo?.encounterId]);

  if (perfil.estado === 'en_combate') {
    return <CombatShell perfil={perfil} />;
  }

  return (
    <div className="container mt-5 text-center" style={{ fontFamily: 'var(--font-body)', color: theme.text }}>
      <h4 style={{ fontFamily: 'var(--font-title)' }}>Encuentro contra mini-jefe</h4>
      {cargando || !colaInfo ? (
        <p className="mt-3 text-secondary">Uniéndote a la cola...</p>
      ) : (
        <>
          <p className="mt-3">Nivel del jefe: {colaInfo.nivelJefe}</p>
          <p style={{ fontFamily: 'var(--font-title)', fontSize: '1.8rem' }}>
            {participantes}/{CUPO_COLA}
          </p>
          <p className="text-secondary">Esperando a que se complete el grupo...</p>
        </>
      )}
    </div>
  );
};
