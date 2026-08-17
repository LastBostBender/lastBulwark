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
      'El ruido de los teclados nunca cesa. Es el himno de una generación que cree que dormir es perder, que el café es un combustible y que las horas extras son medallas de honor. Las pantallas parpadean como ojos de un dios que se olvidó de parpadear.\n\n' +
      'En sus pasillos cuelgan los restos de los que intentaron domar el tiempo: certificados de productividad enmarcados, agendas donde solo se tachan sueños, tazas con frases como "El éxito no espera" que ya nadie lee porque están demasiado ocupados actualizando su perfil de LinkedIn. El humo del vaper se mezcla con el aroma a ambición barata y a desodorante de última generación que no tapa el olor a desesperación.\n\n' +
      'El agotamiento no se ha ido. Vive en las ojeras que son más profundas que sus ideas, en las publicaciones de LinkedIn que presumen de jornadas de 14 horas, en la nuca de los que llevan tres días sin dormir porque "el descanso es para los débiles". Los que sobreviven aprenden a moverse como el capital: rápidos, fríos, capaces de liquidar cualquier obstáculo con una presentación bien sincronizada. Pero el precio es alto. El sistema te exprime, te estruja, te convence de que eres imparable mientras desangras tu vida en métricas y KPIs.',
    efectos: [
      { titulo: 'Horas extra', flavor: 'Notas que tus golpes pesan más. El calor de la ambición te da ese empujón que necesitas para creerte que todo vale la pena.' },
      { titulo: 'Contagio de burnout', flavor: 'El agotamiento no es individual. Cuando uno cae, todos lo sienten un poco.' },
    ],
    confirmar: 'Ficharme ya.',
    rechazar: 'No sumar horas extra.',
    bautizo:
      'Un tipo con ojeras y un vaso de café frío te mira sin parpadear. «¿Nombre? Ponlo en el asunto del correo.»',
  },
  {
    id: 'Valle Serenidad',
    icono: 'flower1',
    narrativa:
      'No hay muros aquí. No los necesitas. El bosque de incienso y mantras que se extiende hasta donde alcanza la vista es tu refugio. Y también tu ruina.\n\n' +
      'El aire no se respira, se aspira con intención. No es oxígeno, es vibración. Te llena de paz, pero también te vacía la cuenta bancaria. Y sin embargo, sin él, no sobrevives. Es un pacto: te calma, pero te deja en bancarrota.\n\n' +
      'Los árboles son sahumerios de edición limitada. Las ramas, cuencos tibetanos que cuestan más que el alquiler. El musgo es matcha en polvo que se vende a precio de oro. Los que viven aquí han aprendido a moverse con la energía, a sentir dónde va a fluir antes de que fluya. A veces aciertan. A veces están demasiado ocupados tomándole foto a su desayuno para darse cuenta.\n\n' +
      'Cuando lanzas un golpe o un conjuro, la paz que llevas dentro puede desbordarse y salpicar a los que tienes al lado. No es mala intención. Es solo que tanta armonía termina siendo contagiosa.',
    efectos: [
      { titulo: 'Brotes de paz', flavor: 'Tu cuerpo se recupera más rápido. Tanta meditación y superalimentos finalmente dan resultado. O eso crees.' },
      { titulo: 'Resaca de serenidad', flavor: 'Tanta paz empalaga. Sin querer, tus habilidades pueden terminar afectando a un aliado con una felicidad tan intensa que les duele.' },
    ],
    confirmar: 'Fluir con la energía.',
    rechazar: 'No estoy listo para tanta paz.',
    bautizo:
      'Una mujer con incienso en la mano te sonríe con calma forzada. «¿Nombre? Que fluya, que no cueste.»',
  },
  {
    id: 'GlitchCity',
    icono: 'broadcast-pin',
    narrativa:
      'La ciudad no descansa. Tampoco lo hace su conexión. Cada farola es una antena, cada pared una pantalla, cada transeúnte un dato que aún no sabe que está siendo procesado. Las luces parpadean al ritmo de los latidos de quienes olvidaron cómo se mira sin grabar.\n\n' +
      'Las calles están llenas de gente que camina sin ver. Sus ojos brillan con el reflejo de feeds interminables, sus dedos se mueven solos, como si el pulgar hubiera desarrollado conciencia propia. Los carteles no anuncian productos, anuncian tendencias. Y las tendencias duran lo que tarda un dedo en deslizarse hacia arriba.\n\n' +
      'A veces, sin previo aviso, la ciudad se atasca. Las pantallas se congelan, los mensajes se duplican, el tiempo se parte en dos. Los lugareños llaman a esto el parpadeo. No es un error. Es el sistema respirando. Y cuando el sistema respira, todos se desincronizan. Porque en GlitchCity, el caos no es un accidente. Es la única constante.',
    efectos: [
      { titulo: 'Scroll infinito', flavor: 'Tienes un don para moverte entre el ruido. Tus reflejos se agudizan, tus movimientos se vuelven impredecibles.' },
      { titulo: 'Lag colectivo', flavor: 'El sistema no discrimina. Cuando se traba, todos se traban un poco, tú incluido.' },
    ],
    confirmar: 'Sincronizar mi señal.',
    rechazar: 'Necesito mejor cobertura.',
    bautizo:
      'Una pantalla parpadea tu reflejo distorsionado. «¿Nombre? El sistema necesita un handle.»',
  },
  {
    id: 'Reino del Ghosting',
    icono: 'chat-left-dots',
    narrativa:
      'Las calles están llenas de gente con el teléfono en la mano, pero nadie responde nada. Las conversaciones cuelgan en el aire como estornudos que nunca terminan de salir. La gente se saluda con la mirada, pero no con la boca. Es más seguro así, no genera compromiso.\n\n' +
      'Los edificios son grises y altos, con ventanas que parecen chats abiertos donde nadie escribe. En las puertas, carteles que dicen "Vuelvo en 5 minutos" desde hace tres años. Los habitantes han perfeccionado el arte de desaparecer sin moverse, de responder con un emoji y esfumarse durante semanas. No es maldad, es que contestar genera compromiso, y el compromiso genera ansiedad. Mejor no.\n\n' +
      'A veces, en medio de la acción, uno se queda mirando la pantalla, esperando una respuesta que nunca llega. Y el resto del grupo se contagia. Los golpes se vuelven flojos, las reacciones se retrasan, y el equipo entero se mueve como si estuviera respondiendo un mensaje que ya no importa.',
    efectos: [
      { titulo: 'Modo avión', flavor: 'Has perfeccionado el arte de no importarte. Las críticas rebotan, los golpes se amortiguan un poco.' },
      { titulo: 'Se pegó el visto', flavor: 'El silencio es contagioso. Cuando actúas, tú y tus aliados pueden empezar a moverse más lento, como esperando una respuesta que nunca llega.' },
    ],
    confirmar: 'Dejar en visto mi antigua vida.',
    rechazar: 'Prefiero seguir respondiendo tarde.',
    bautizo:
      'Un chat se abre solo, sin nadie escribiendo. «¿Nombre? Contesta antes de que también te dejen en visto.»',
  },
];

const TEXTO_BIENVENIDA =
  'Bien, sí. Llegaste al "Último Bastión".\n\n' +
  'Pero no te emociones, que no es un refugio épico. Es más bien la sala de espera de un centro comercial abandonado. Huele a vaper quemado, a desesperación con conexión WiFi y a ese ambientador de coche que intenta tapar lo inevitable.\n\n' +
  'Aquí los jóvenes crecen rápido... porque si no, les dan like a sus fotos de bebé y eso es peor que la muerte.\n\n' +
  'Tienes que elegir un camino. Cuatro. Como las direcciones de un mapa de Fortnite, pero con más traumas y menos bots.\n\n' +
  'Ninguna zona es la "correcta". Todas son igual de ridículas. La única diferencia es el color de las tonterías que vas a tener que soportar.\n\n' +
  'Elige con el instinto. O con el dedo. No hay vuelta atrás... bueno, sí, puedes reiniciar la app, pero te haré sentir culpable.';

const NOMBRE_REGEX = /^[A-Za-z]{4,12}$/;
const MENSAJE_ERROR_NOMBRE = 'Ni muy largo ni muy corto. Letras, nada más. Prueba otra vez.';

const temaNeutro = {
  bg: 'var(--bg-color, #121212)',
  card: 'var(--card-bg, #1e1e1e)',
  border: 'var(--border-color, #2a2a2a)',
  text: 'var(--text-main, #e0e0e0)',
  accent: '#e0e0e0',
};

type Paso = 'bienvenida' | 'zona' | 'zona-detalle' | 'bautizo' | 'completado';

interface OnboardingFlowProps {
  telegramId?: number;
  onCompletado: (perfil: { telegram_id: number; nombre_personaje: string; zona: Zona }) => void;
}

function getTelegramId(propId?: number): number | null {
  if (propId) return propId;
  const w = window as any;
  return w?.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null;
}

export const OnboardingFlow = ({ telegramId, onCompletado }: OnboardingFlowProps) => {
  const [paso, setPaso] = useState<Paso>('bienvenida');
  const [zonaActiva, setZonaActiva] = useState<ZonaInfo | null>(null);
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [perfilCreado, setPerfilCreado] = useState<any>(null);

  const tema = zonaActiva ? getTheme(zonaActiva.id) : temaNeutro;

  useEffect(() => {
    const activo = zonaActiva ? getTheme(zonaActiva.id) : null;
    document.documentElement.style.setProperty('--font-display', activo ? activo.fontDisplay : "'Press Start 2P', cursive");
    document.documentElement.style.setProperty('--font-body', activo ? activo.fontBody : "'VT323', monospace");
  }, [zonaActiva]);

  const elegirZona = (zona: ZonaInfo) => {
    setZonaActiva(zona);
    setPaso('zona-detalle');
  };

  const rechazarZona = () => {
    setZonaActiva(null);
    setPaso('zona');
  };

  const confirmarZona = () => {
    setPaso('bautizo');
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
      .insert({ telegram_id: id, nombre_personaje: nombre, zona: zonaActiva.id })
      .select()
      .single();

    setGuardando(false);

    if (error) {
      console.error('Error al registrar personaje:', error);
      setErrorGuardado('Algo se rompió al grabar tu destino. Intenta de nuevo.');
      return;
    }

    setPerfilCreado(data);
    setPaso('completado');
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
        {paso === 'bienvenida' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.15rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {TEXTO_BIENVENIDA}
            </p>
            <div className="text-center mt-4">
              <button
                onClick={() => setPaso('zona')}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  padding: '0.7rem 1.2rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${temaNeutro.text}`,
                  color: temaNeutro.text,
                  letterSpacing: '1px',
                }}
              >
                Elegir un destino
              </button>
            </div>
          </div>
        )}

        {paso === 'zona' && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <p
              className="text-center mb-4"
              style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', letterSpacing: '1px' }}
            >
              Cuatro caminos
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {ZONAS.map((zona) => {
                const t = getTheme(zona.id);
                return (
                  <button
                    key={zona.id}
                    onClick={() => elegirZona(zona)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.8rem',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: `1px solid ${temaNeutro.border}`,
                      borderLeft: `4px solid ${t.accent}`,
                      borderRadius: '4px',
                      padding: '0.8rem 1rem',
                      color: temaNeutro.text,
                      fontFamily: 'var(--font-body)',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <i className={`bi bi-${zona.icono}`} style={{ fontSize: '1.6rem', color: t.accent }}></i>
                    <span>{zona.id}</span>
                    <span style={{ marginLeft: 'auto', color: temaNeutro.text, opacity: 0.5, fontSize: '0.8rem' }}>
                      <i className="bi bi-chevron-right"></i>
                    </span>
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
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {zonaActiva.narrativa}
            </p>
            <div style={{ borderTop: `1px solid ${tema.border}`, margin: '1.2rem 0', paddingTop: '1rem' }}>
              {zonaActiva.efectos.map((efecto) => (
                <div key={efecto.titulo} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', color: tema.accent, letterSpacing: '0.5px' }}>
                    {efecto.titulo}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: temaNeutro.text, opacity: 0.85 }}>
                    {efecto.flavor}
                  </div>
                </div>
              ))}
            </div>
            <div className="d-flex gap-2 justify-content-center mt-4">
              <button
                onClick={rechazarZona}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.6rem',
                  padding: '0.6rem 1rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${temaNeutro.text}`,
                  color: temaNeutro.text,
                  opacity: 0.75,
                  letterSpacing: '0.5px',
                }}
              >
                {zonaActiva.rechazar}
              </button>
              <button
                onClick={confirmarZona}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.6rem',
                  padding: '0.6rem 1rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${tema.accent}`,
                  color: tema.accent,
                  letterSpacing: '0.5px',
                }}
              >
                {zonaActiva.confirmar}
              </button>
            </div>
          </div>
        )}

        {paso === 'bautizo' && zonaActiva && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.15rem', lineHeight: 1.6 }}>
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
                marginTop: '1rem',
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
              <p style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
                {errorNombre}
              </p>
            )}
            {errorGuardado && (
              <p style={{ color: '#e74c3c', fontFamily: 'var(--font-body)', fontSize: '0.95rem', marginTop: '0.4rem' }}>
                {errorGuardado}
              </p>
            )}
            <div className="d-flex gap-2 justify-content-center mt-4">
              <button
                onClick={rechazarZona}
                disabled={guardando}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  padding: '0.7rem 1.2rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${temaNeutro.text}`,
                  color: temaNeutro.text,
                  letterSpacing: '1px',
                  opacity: guardando ? 0.6 : 1,
                }}
              >
                Cambiar de zona
              </button>
              <button
                onClick={enviarNombre}
                disabled={guardando}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  padding: '0.7rem 1.2rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${tema.accent}`,
                  color: tema.accent,
                  letterSpacing: '1px',
                  opacity: guardando ? 0.6 : 1,
                  cursor: guardando ? 'wait' : 'pointer',
                }}
              >
                {guardando ? 'Grabando...' : 'Aceptar el nombre'}
              </button>
            </div>
          </div>
        )}

        {paso === 'completado' && zonaActiva && (
          <div style={{ animation: 'fadeIn 0.5s ease', textAlign: 'center' }}>
            <i className={`bi bi-${zonaActiva.icono}`} style={{ fontSize: '2.2rem', color: tema.accent }}></i>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: tema.accent, margin: '0.8rem 0' }}>
              Bienvenido, {nombre}.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', lineHeight: 1.6 }}>
              Tu destino queda marcado en {zonaActiva.id}. Que el Bastión te sea tan generoso como te lo hayas ganado.
            </p>
            <div className="mt-4">
              <button
                onClick={() => perfilCreado && onCompletado(perfilCreado)}
                className="btn"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  padding: '0.7rem 1.2rem',
                  backgroundColor: 'transparent',
                  border: `1px solid ${tema.accent}`,
                  color: tema.accent,
                  letterSpacing: '1px',
                }}
              >
                Entrar al Bastión
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