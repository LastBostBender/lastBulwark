import { useState, useEffect } from 'react';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

type Zona = 'Núcleo Hustle' | 'Valle Serenidad' | 'GlitchCity' | 'Reino del Ghosting';

interface EfectoPasivo {
  titulo: string;
  flavor: string;
}

interface ZonaInfo {
  id: Zona;
  icono: string;
  narrativa: string;
  efectos: EfectoPasivo[];
  confirmar: string;
  rechazar: string;
  bautizo: string;
}

const ZONAS: ZonaInfo[] = [
  {
    id: 'Núcleo Hustle',
    icono: 'cup-hot-fill',
    narrativa:
      'El ruido de los teclados nunca cesa: himno de una generación que cree que dormir es perder y el café es combustible. Las horas extra son medallas de honor; el agotamiento, una publicación más de LinkedIn.',
    efectos: [
      { titulo: 'Horas extra', flavor: 'Notas que tus golpes pesan más. El calor de la ambición te da ese empujón que necesitas para creerte que todo vale la pena.' },
      { titulo: 'Contagio de burnout', flavor: 'El agotamiento no es individual. Cuando uno cae, todos lo sienten un poco.' },
    ],
    confirmar: 'Ficharme ya.',
    rechazar: 'No sumar horas extra.',
    bautizo: 'Un tipo con ojeras y un vaso de café frío te mira sin parpadear. «¿Nombre? Ponlo en el asunto del correo.»',
  },
  {
    id: 'Valle Serenidad',
    icono: 'flower1',
    narrativa:
      'No hay muros aquí, no los necesitas: el bosque de incienso y mantras es tu refugio y también tu ruina. El aire no se respira, se aspira con intención — te llena de paz y te vacía la cuenta bancaria.',
    efectos: [
      { titulo: 'Brotes de paz', flavor: 'Tu cuerpo se recupera más rápido. Tanta meditación y superalimentos finalmente dan resultado. O eso crees.' },
      { titulo: 'Resaca de serenidad', flavor: 'Tanta paz empalaga. Sin querer, tus habilidades pueden terminar afectando a un aliado con una felicidad tan intensa que les duele.' },
    ],
    confirmar: 'Fluir con la energía.',
    rechazar: 'No estoy listo para tanta paz.',
    bautizo: 'Una mujer con incienso en la mano te sonríe con calma forzada. «¿Nombre? Que fluya, que no cueste.»',
  },
  {
    id: 'GlitchCity',
    icono: 'broadcast-pin',
    narrativa:
      'La ciudad no descansa. Tampoco su conexión. Cada farola es una antena, cada transeúnte un dato sin procesar. A veces todo se atasca: no es un error, es el sistema respirando.',
    efectos: [
      { titulo: 'Scroll infinito', flavor: 'Tienes un don para moverte entre el ruido. Tus reflejos se agudizan, tus movimientos se vuelven impredecibles.' },
      { titulo: 'Lag colectivo', flavor: 'El sistema no discrimina. Cuando se traba, todos se traban un poco, tú incluido.' },
    ],
    confirmar: 'Sincronizar mi señal.',
    rechazar: 'Necesito mejor cobertura.',
    bautizo: 'Una pantalla parpadea tu reflejo distorsionado. «¿Nombre? El sistema necesita un handle.»',
  },
  {
    id: 'Reino del Ghosting',
    icono: 'chat-left-dots',
    narrativa:
      'Las calles están llenas de gente con el teléfono en la mano que no responde nada. Se saludan con la mirada, nunca con la boca — contestar genera compromiso, y eso da ansiedad.',
    efectos: [
      { titulo: 'Modo avión', flavor: 'Has perfeccionado el arte de no importarte. Las críticas rebotan, los golpes se amortiguan un poco.' },
      { titulo: 'Se pegó el visto', flavor: 'El silencio es contagioso. Cuando actúas, tú y tus aliados pueden empezar a moverse más lento, como esperando una respuesta que nunca llega.' },
    ],
    confirmar: 'Dejar en visto mi antigua vida.',
    rechazar: 'Prefiero seguir respondiendo tarde.',
    bautizo: 'Un chat se abre solo, sin nadie escribiendo. «¿Nombre? Contesta antes de que también te dejen en visto.»',
  },
];

const TEXTO_BIENVENIDA =
  'Bien, sí. Llegaste al "Último Bastión". No es un refugio épico: es la sala de espera de un centro comercial abandonado, con olor a vaper quemado y ambientador de coche que no tapa lo inevitable.\n\n' +
  'Elige un camino. Ninguno es el correcto — todos son igual de ridículos, solo cambia el color de las tonterías que vas a tener que soportar.';

const NOMBRE_REGEX = /^[A-Za-z]{4,12}$/;
const MENSAJE_ERROR_NOMBRE = 'Ni muy largo ni muy corto. Letras, nada más. Prueba otra vez.';

const temaNeutro = {
  bg: 'var(--bg-color, #121212)',
  card: 'var(--card-bg, #1e1e1e)',
  border: 'var(--border-color, #2a2a2a)',
  text: 'var(--text-main, #e0e0e0)',
  accent: '#e0e0e0',
};

type Paso = 'inicio' | 'zona-detalle';

interface OnboardingFlowProps {
  telegramId?: number;
  onCompletado: (perfil: { telegram_id: number; nombre_personaje: string; zona: Zona }) => void;
}

function getTelegramId(propId?: number): number | null {
  if (propId) return propId;
  const w = window as any;
  return w?.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;
}

function getTelegramUsername(): string | null {
  const w = window as any;
  return w?.Telegram?.WebApp?.initDataUnsafe?.user?.username ?? null;
}

export const OnboardingFlow = ({ telegramId, onCompletado }: OnboardingFlowProps) => {
  const [paso, setPaso] = useState<Paso>('inicio');
  const [zonaActiva, setZonaActiva] = useState<ZonaInfo | null>(null);
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const tema = zonaActiva ? getTheme(zonaActiva.id) : temaNeutro;

  useEffect(() => {
    const activo = zonaActiva ? getTheme(zonaActiva.id) : null;
    document.documentElement.style.setProperty('--font-display', activo ? activo.fontDisplay : "'Press Start 2P', cursive");
    document.documentElement.style.setProperty('--font-body', activo ? activo.fontBody : "'VT323', monospace");
  }, [zonaActiva]);

  const elegirZona = (zona: ZonaInfo) => {
    setZonaActiva(zona);
    setPaso('zona-detalle');
    setNombre('');
    setErrorNombre(null);
    setErrorGuardado(null);
  };

  const cancelar = () => {
    setZonaActiva(null);
    setPaso('inicio');
  };

  const validarNombre = (valor: string) => NOMBRE_REGEX.test(valor);

  const enviarNombre = async () => {
    if (!validarNombre(nombre)) {
      setErrorNombre(MENSAJE_ERROR_NOMBRE);
      return;
    }
    if (!zonaActiva) return;

    const id = getTelegramId(telegramId);
    if (!id) {
      setErrorGuardado('No se pudo identificar tu cuenta de Telegram. Reabre la app desde el bot.');
      return;
    }

    setGuardando(true);
    setErrorGuardado(null);

    const { data, error } = await supabase
      .from('profiles')
      .insert({ telegram_id: id, nombre_personaje: nombre, zona: zonaActiva.id, username: getTelegramUsername() })
      .select()
      .single();

    setGuardando(false);

    if (error) {
      console.error('Error al registrar personaje:', error);
      setErrorGuardado('Algo se rompió al grabar tu destino. Intenta de nuevo.');
      return;
    }

    onCompletado(data); // directo al perfil, sin pantalla extra
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: temaNeutro.bg,
        color: temaNeutro.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '1.5rem',
        transition: 'color 0.4s ease',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          width: '100%',
          backgroundColor: temaNeutro.card,
          border: `1px solid ${tema.border}`,
          borderTop: `3px solid ${tema.accent}`,
          borderRadius: '4px',
          padding: '1.5rem',
          transition: 'border-color 0.4s ease',
        }}
      >
        {paso === 'inicio' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {TEXTO_BIENVENIDA}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '1.2rem' }}>
              {ZONAS.map((zona) => {
                const t = getTheme(zona.id);
                return (
                  <button
                    key={zona.id}
                    onClick={() => elegirZona(zona)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      textAlign: 'center',
                      background: 'transparent',
                      border: `1px solid ${temaNeutro.border}`,
                      borderTop: `3px solid ${t.accent}`,
                      borderRadius: '4px',
                      padding: '1rem 0.5rem',
                      color: temaNeutro.text,
                      fontFamily: t.fontDisplay,
                      fontSize: '0.75rem',
                      letterSpacing: '0.5px',
                      cursor: 'pointer',
                      minHeight: '90px',
                    }}
                  >
                    <i className={`bi bi-${zona.icono}`} style={{ fontSize: '1.6rem', color: t.accent }}></i>
                    <span>{zona.id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {paso === 'zona-detalle' && zonaActiva && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <div className="text-center mb-3">
              <i className={`bi bi-${zonaActiva.icono}`} style={{ fontSize: '2rem', color: tema.accent }}></i>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: '1px', color: tema.accent, margin: '0.4rem 0 0' }}>
                {zonaActiva.id}
              </p>
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.6 }}>
              {zonaActiva.narrativa}
            </p>
            <div style={{ borderTop: `1px solid ${tema.border}`, margin: '1rem 0', paddingTop: '0.8rem' }}>
              {zonaActiva.efectos.map((efecto) => (
                <div key={efecto.titulo} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: tema.accent, letterSpacing: '0.5px' }}>
                    {efecto.titulo}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: temaNeutro.text, opacity: 0.85 }}>
                    {efecto.flavor}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.5, borderTop: `1px solid ${tema.border}`, paddingTop: '0.8rem' }}>
              {zonaActiva.bautizo}
            </p>
            <input
              type="text"
              value={nombre}
              maxLength={12}
              onChange={(e) => { setNombre(e.target.value); setErrorNombre(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') enviarNombre(); }}
              placeholder="Tu nombre"
              autoFocus
              style={{
                width: '100%',
                marginTop: '0.6rem',
                padding: '0.6rem 0.8rem',
                fontFamily: 'var(--font-body)',
                fontSize: '1.2rem',
                backgroundColor: 'transparent',
                border: `1px solid ${errorNombre ? '#c0392b' : tema.accent}`,
                borderRadius: '4px',
                color: temaNeutro.text,
                outline: 'none',
              }}
            />
            {errorNombre && (
              <p style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                {errorNombre}
              </p>
            )}
            {errorGuardado && (
              <p style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                {errorGuardado}
              </p>
            )}

            <div className="d-flex gap-2 justify-content-center mt-3">
              <button
                onClick={cancelar}
                disabled={guardando}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.65rem',
                  padding: '0.6rem 1rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${temaNeutro.text}`,
                  color: temaNeutro.text,
                  opacity: guardando ? 0.6 : 0.85,
                  letterSpacing: '0.5px',
                }}
              >
                {zonaActiva.rechazar}
              </button>
              <button
                onClick={enviarNombre}
                disabled={guardando}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.65rem',
                  padding: '0.6rem 1rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${tema.accent}`,
                  color: tema.accent,
                  letterSpacing: '0.5px',
                  opacity: guardando ? 0.6 : 1,
                  cursor: guardando ? 'wait' : 'pointer',
                }}
              >
                {guardando ? 'Grabando...' : zonaActiva.confirmar}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
