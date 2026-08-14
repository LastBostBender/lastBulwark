import { useState } from 'react';
import { getTheme } from '../utils/themes';
import { supabase } from '../services/supabase';

type Zona = 'Las calderas' | 'Brote de acero' | 'El alacranero' | 'Última aurora';

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
    id: 'Las calderas',
    icono: '🌋',
    narrativa:
      'El volcán no está muerto. Respira. Y su aliento es una columna de ceniza que tiñe el cielo de plomo durante semanas.\n\n' +
      'En su ladera, los restos de una civilización que creyó domar el fuego cuelgan como costillas rotas: cadenas de montaje retorcidas, hornos fríos que escupen polvo cuando el viento se cuela por las grietas, raíles que se hunden en la lava solidificada.\n\n' +
      'El calor no se ha ido. Vive en el suelo, en el aire, en los huesos de los que se quedaron. Cada respiración es un acuerdo con el infierno. Los que sobreviven aprenden a moverse como la lava: lentos, implacables, capaces de fundir cualquier resistencia. Pero el precio es alto. El volcán no da tregua. Desgasta. Consume. Te arranca la vida a sorbos mientras te convence de que eres más fuerte.\n\n' +
      'En verano, el fuego se vuelve aliado. En invierno, recuerdas que solo eres un inquilino en su casa.',
    efectos: [
      { titulo: 'Hijos del sol', flavor: 'En verano, notas que tus ataques hieren más.' },
      { titulo: 'Sobrecarga', flavor: 'Siempre activo: notas que tu resistencia es menor.' },
    ],
    confirmar: 'Pisar el suelo que arde.',
    rechazar: 'Retirarse de la fragua.',
    bautizo:
      'El calor te golpea como un puño. Una sombra te escupe ceniza. «¿Nombre? Que no sea una maldición.»',
  },
  {
    id: 'Brote de acero',
    icono: '🪾',
    narrativa:
      'No hay murallas aquí. No las necesitas. El bosque de metal podrido que se extiende hasta donde alcanza la vista es tu única defensa. Y también tu condena.\n\n' +
      'La lluvia no cae, se desliza. Se cuela por las grietas de tu armadura, por las rendijas de tu respiradero. No es agua, es aliento de la tierra. Disuelve el óxido, pero también la carne. Y sin embargo, sin ella, no sobrevives. Es un pacto: te pudre, pero te alimenta.\n\n' +
      'Los árboles son mástiles de barcos hundidos. Las ramas, cables de alta tensión. El musgo es aceite quemado. Todo crece con una prisa enferma, como si el suelo supiera que su tiempo es prestado. Los que viven aquí han aprendido a moverse con el ácido, a sentir dónde va a caer antes de que caiga. A veces aciertan. A veces no.\n\n' +
      'Cuando lanzas un golpe o un conjuro, la lluvia que llevas dentro puede salpicar a los que tienes al lado. No es intención. Es la sangre del territorio recordándote que aquí nada es limpio, ni siquiera tus aliados.',
    efectos: [
      { titulo: 'Voracidad', flavor: 'Notas que tu cuerpo se recupera más rápido, como si la podredumbre lo alimentara.' },
      { titulo: 'Salpicadura ácida', flavor: 'De vez en cuando, tus ataques o hechizos dañan a un aliado sin explicación aparente.' },
    ],
    confirmar: 'Echar raíces de acero.',
    rechazar: 'Buscar tierra más seca.',
    bautizo:
      'La lluvia ácida golpea tu capucha. Una mano oxidada te tiende un trapo. «Di algo. Cualquier cosa que sirva para llamarte.»',
  },
  {
    id: 'El alacranero',
    icono: '🦂',
    narrativa:
      'El otoño no es una estación aquí. Es una condena. Las noches se alargan como dedos de hambre, y el frío no llega de golpe, se cuela por los huesos, una caricia que anuncia lo que viene.\n\n' +
      'El mundo ha perdido el color. Todo es gris, ocre, herrumbre. Los pocos árboles que quedan son esqueletos de metal retorcido, y el viento que silba entre sus ramas parece llevar voces de otros tiempos. Las bestias que sobreviven aquí no son grandes ni fuertes; son pacientes. Han aprendido a moverse en la penumbra, a oler el miedo antes de que el miedo sepa que está siendo olido.\n\n' +
      'Pero hay algo más en el aire. Algo que los lugareños llaman la Danza. Cuando el viento cambia de dirección de repente, todo se acelera durante unos instantes: los pasos, los golpes, las sombras. Los que han vivido suficiente aquí saben que la Danza no es un regalo. Es una advertencia. Porque cuando el viento baila, nadie controla el ritmo. Ni siquiera tú. Y los tuyos también se desequilibran.',
    efectos: [
      { titulo: 'Danza de tormenta', flavor: 'En ciertos momentos de combate, tus movimientos se vuelven repentinamente más rápidos y esquivos, como si el viento te empujara.' },
      { titulo: 'Perder el control', flavor: 'Cuando la Danza se activa, el caos no es selectivo. Tus aliados fallan más, tus enemigos también, pero los tuyos más.' },
    ],
    confirmar: 'Seguir el rastro del viento.',
    rechazar: 'Buscar un refugio más alto.',
    bautizo:
      'El viento se lleva tus primeras palabras. Un cazador te escupe en el suelo. «¿Nombre? Para saber a quién entierran.»',
  },
  {
    id: 'Última aurora',
    icono: '💠',
    narrativa:
      'El invierno no llegó. Siempre estuvo. Solo que antes había treguas. Ahora no.\n\n' +
      'La luz es un rumor. El día dura lo que un suspiro envenenado. El resto es noche, y la noche es una bestia que te lame los huesos. La vida aquí no florece, se enquista. La gente no vive, aguarda. No hay esperanza, solo memoria de lo que fue calor.\n\n' +
      'El hielo no es blanco. Es gris como la ceniza, duro como el rencor. Todo lo que toca se vuelve frágil, incluso los pensamientos. Los que sobreviven han aprendido a endurecerse, a hacerse más densos que el frío, a caminar por el hielo como si fuera suya la tierra que pisotean. La defensa aquí no es un escudo, es una segunda piel.\n\n' +
      'Pero hay un precio. Cuando lanzas un hechizo para proteger a los tuyos, el frío se cuela por las grietas. No siempre, pero a veces, la escarcha que llevas dentro se enreda en los pies de tus aliados. Los entumece. Los ralentiza. No es traición. Es el invierno recordándote que el calor no se da sin coste.',
    efectos: [
      { titulo: 'Permafrost', flavor: 'Los golpes y hechizos enemigos te duelen menos, como si tu cuerpo se hubiera vuelto más denso, más reacio a ceder.' },
      { titulo: 'Escarchas', flavor: 'Cuando lanzas un hechizo a un aliado, a veces notas que se mueve más lento, como si el frío lo hubiera alcanzado.' },
    ],
    confirmar: 'Abrir la puerta al frío.',
    rechazar: 'Buscar un resquicio de calor.',
    bautizo:
      'El frío te corta la voz. Una figura envuelta en pieles te señala con la barbilla. «¿Nombre? O te pongo uno yo. No te va a gustar, pero servirá.»',
  },
];

const TEXTO_BIENVENIDA =
  'Has llegado al Último Bastión. No hay bienvenida, no hay celebración. Solo el rumor del viento entre grietas y el olor a metal quemado.\n\n' +
  'Aquí los críos crecen rápido. A los quince, o te vas o te pudres. El mundo no espera a nadie, y el Bastión no es un hogar, es una estación de paso.\n\n' +
  'Tienes que elegir un destino. Cuatro caminos. Cuatro formas de morir o de vivir un poco más.\n\n' +
  'Ninguno es mejor que otro. Cada uno te dará algo y te quitará algo. No te lo voy a decir. Lo aprenderás a tu manera, como todos.\n\n' +
  'Elige con cuidado. No hay vuelta atrás.';

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

  const tema = zonaActiva ? getTheme(zonaActiva.id) : temaNeutro;

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

    const { error } = await supabase
      .from('profiles')
      .insert({ telegram_id: id, nombre_personaje: nombre, zona: zonaActiva.id });

    setGuardando(false);

    if (error) {
      console.error('Error al registrar personaje:', error);
      setErrorGuardado('Algo se rompió al grabar tu destino. Intenta de nuevo.');
      return;
    }

    setPaso('completado');
    onCompletado({ telegram_id: id, nombre_personaje: nombre, zona: zonaActiva.id });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: temaNeutro.bg,
        color: tema.text,
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
                      border: `1px solid ${t.border}`,
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
                    <span style={{ fontSize: '1.6rem' }}>{zona.icono}</span>
                    <span>{zona.id}</span>
                    <span style={{ marginLeft: 'auto', color: t.border, fontSize: '0.8rem' }}>
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
              <span style={{ fontSize: '2rem' }}>{zonaActiva.icono}</span>
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
                  border: `1px solid ${tema.border}`,
                  color: tema.border,
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
            <div className="text-center mt-4">
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
            <span style={{ fontSize: '2.2rem' }}>{zonaActiva.icono}</span>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: tema.accent, margin: '0.8rem 0' }}>
              Bienvenido, {nombre}.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1.1rem', lineHeight: 1.6 }}>
              Tu destino queda marcado en {zonaActiva.id}. Que el Bastión te sea tan generoso como te lo hayas ganado.
            </p>
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