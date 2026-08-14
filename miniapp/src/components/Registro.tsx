import { useState } from 'react';
import { Layout } from './Layout';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

interface RegistroProps {
  telegramId: number;
  onRegistroCompletado: (perfil: any) => void;
}

export const Registro = ({ telegramId, onRegistroCompletado }: RegistroProps) => {
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [paso, setPaso] = useState<'zona' | 'nombre'>('zona');
  const [error, setError] = useState<string | null>(null);

  const theme = getTheme(zonaSeleccionada); // <--- AHORA pasa string | null

  const seleccionarZona = (zona: string) => {
    setZonaSeleccionada(zona);
    setPaso('nombre');
  };

  const guardarPerfil = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        telegram_id: telegramId,
        nombre_personaje: nombre,
        zona: zonaSeleccionada,
        nivel: 1,
        clase: 'Marginado',
        xp_total: 0,
        fue: 0,
        int: 0,
        agi: 0,
        energia: 5,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return;
    }
    onRegistroCompletado(data);
  };

  return (
    <Layout nombre="Nuevo Recluta" clase="" nivel={0} zona={zonaSeleccionada}>
      <div className="container mt-4" style={{ color: theme.text }}>
        {error && <div className="alert alert-danger">{error}</div>}

        {paso === 'zona' && (
          <>
            <p className="text-center mb-3">Elige tu destino:</p>
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              {['Las calderas', 'Brote de acero', 'El alacranero', 'Última aurora'].map((z) => (
                <button
                  key={z}
                  className="btn"
                  style={{
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    backgroundColor: 'transparent',
                  }}
                  onClick={() => seleccionarZona(z)}
                >
                  {z}
                </button>
              ))}
            </div>
          </>
        )}

        {paso === 'nombre' && zonaSeleccionada && (
          <>
            <p className="text-center mb-3">
              Escribe el nombre de tu personaje (4-12 letras, sin espacios):
            </p>
            <div className="d-flex flex-column align-items-center gap-2">
              <input
                type="text"
                className="form-control"
                style={{
                  maxWidth: '300px',
                  backgroundColor: theme.cardBg,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Kael"
              />
              <button
                className="btn"
                style={{
                  backgroundColor: theme.accent,
                  color: '#121212',
                  border: 'none',
                }}
                onClick={guardarPerfil}
                disabled={!nombre.match(/^[A-Za-z]{4,12}$/)}
              >
                Crear personaje
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};