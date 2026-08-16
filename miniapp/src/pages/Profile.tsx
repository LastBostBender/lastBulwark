import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { OnboardingFlow as Registro } from '../components/Registro';
import { ProfileView } from '../components/ProfileView';
import { PoderesView } from '../components/PoderesView';
import { CombatView } from '../components/CombatView';
import { Layout } from '../components/Layout';
import TelegramWebApp from '@twa-dev/sdk';

type Vista = 'perfil' | 'mazmorra' | 'inventario' | 'poderes';

const TIMEOUT_MS = 10000;

export const Profile = () => {
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registro, setRegistro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('perfil');
  const [intento, setIntento] = useState(0);

  // Obtener ID real de Telegram
  const user = TelegramWebApp.initDataUnsafe?.user;
  const TELEGRAM_ID = user?.id ?? 123456;

  // Sin esto, varios clientes de Telegram (sobre todo Desktop y algunas
  // versiones de Android) mantienen su propio overlay de carga nativo
  // encima de la app, o no terminan de asentar el WebView.
  useEffect(() => {
    try {
      TelegramWebApp.ready();
      TelegramWebApp.expand();
    } catch (err) {
      console.error('Error inicializando Telegram WebApp:', err);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const cargarPerfil = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('telegram_id', TELEGRAM_ID)
          .abortSignal(controller.signal)
          .single();

        if (!activo) return;

        if (error && error.code === 'PGRST116') {
          setRegistro(true);
          return;
        }
        if (error) throw error;
        setPerfil(data);
      } catch (err: any) {
        if (!activo) return;
        const timedOut = err?.name === 'AbortError';
        setError(timedOut ? 'La conexión tardó demasiado. Revisa tu señal e intenta de nuevo.' : err.message);
      } finally {
        clearTimeout(timeoutId);
        if (activo) setLoading(false);
      }
    };
    cargarPerfil();

    return () => {
      activo = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [intento]);

  // El bot (backend de Telegram) puede subir de nivel o modificar el perfil
  // mientras la miniapp está abierta. Sin esto, esos cambios solo se veían
  // al cerrar y reabrir la miniapp.
  useEffect(() => {
    const canal = supabase
      .channel(`profile-${TELEGRAM_ID}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `telegram_id=eq.${TELEGRAM_ID}` },
        (payload) => setPerfil((prev: any) => ({ ...prev, ...payload.new }))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TELEGRAM_ID]);

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
        <div className="text-center">
          <button className="btn btn-outline-light" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (registro) {
    return <Registro telegramId={TELEGRAM_ID} onCompletado={handleRegistroCompletado} />;
  }

  // El bloqueo de combate tiene prioridad sobre la navegación por tabs:
  // si el bot cambió perfil.estado a 'en_cola' o 'en_combate' (vía Realtime,
  // arriba), no importa en qué vista estabas.
  if (perfil.estado === 'en_cola' || perfil.estado === 'en_combate') {
    return <CombatView perfil={perfil} onProfileChange={setPerfil} />;
  }

  if (vista === 'poderes') {
    return <PoderesView perfil={perfil} onNavigate={setVista} />;
  }

  // Mazmorra e Inventario todavía no existen como vistas propias.
  // Placeholder para que los tabs del footer no queden muertos mientras se construyen.
  if (vista === 'mazmorra' || vista === 'inventario') {
    return (
      <Layout
        nombre={perfil.nombre_personaje}
        clase={perfil.clase}
        nivel={perfil.nivel}
        zona={perfil.zona}
        vistaActual={vista}
        onNavigate={setVista}
      >
        <div className="text-center mt-5" style={{ fontFamily: 'var(--font-body)' }}>
          {vista === 'mazmorra' ? 'La mazmorra aún no abre sus puertas.' : 'El inventario todavía está vacío... de código.'}
        </div>
      </Layout>
    );
  }

  return <ProfileView perfil={perfil} onNavigate={setVista} onProfileChange={setPerfil} />;
};
