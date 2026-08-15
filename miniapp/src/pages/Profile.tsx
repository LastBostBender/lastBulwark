import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { OnboardingFlow as Registro } from '../components/Registro';
import { ProfileView } from '../components/ProfileView';
import TelegramWebApp from '@twa-dev/sdk';

export const Profile = () => {
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registro, setRegistro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Obtener ID real de Telegram
  const user = TelegramWebApp.initDataUnsafe?.user;
  const TELEGRAM_ID = user?.id ?? 123456;

  useEffect(() => {
    const cargarPerfil = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('telegram_id', TELEGRAM_ID)
          .single();

        if (error && error.code === 'PGRST116') {
          setRegistro(true);
          return;
        }
        if (error) throw error;
        setPerfil(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    cargarPerfil();
  }, []);

  const handleRegistroCompletado = (data: any) => {
    setPerfil(data);
    setRegistro(false);
  };

  if (loading) {
    return (
      <div className="text-center mt-5">
        <div className="spinner-border text-light" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
        <p className="mt-3 text-secondary">Consultando el Bastión...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-5">
        <div className="alert alert-danger" role="alert">
          Error: {error}
        </div>
      </div>
    );
  }

  if (registro) {
    return <Registro telegramId={TELEGRAM_ID} onCompletado={handleRegistroCompletado} />;
  }

  return <ProfileView perfil={perfil} />;
};