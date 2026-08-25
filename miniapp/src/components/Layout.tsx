import React, { useEffect } from 'react';
import { getTheme } from '../utils/themes';

type Vista = 'perfil' | 'mazmorra' | 'inventario' | 'poderes';

interface LayoutProps {
  children: React.ReactNode;
  nombre: string;
  clase: string;
  nivel: number;
  zona?: string | null;
  vistaActual?: Vista;
  onNavigate?: (vista: Vista) => void;
}

const HEADER_MIN_HEIGHT = 72; // piso: nunca reserva menos que esto (caso de 2 líneas)

export const Layout = ({
  children,
  nombre,
  clase,
  nivel,
  zona,
  vistaActual,
  onNavigate
}: LayoutProps) => {
  const theme = getTheme(zona || null);
  const headerRef = React.useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = React.useState(HEADER_MIN_HEIGHT);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-display', theme.fontDisplay);
    document.documentElement.style.setProperty('--font-body', theme.fontBody);
  }, [theme.fontDisplay, theme.fontBody]);

  // El header puede crecer a 3+ líneas si el nombre de la clase es largo.
  // En vez de una altura fija, medimos el header real y ajustamos el
  // padding del contenido para que nunca quede tapado.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const actualizarAltura = () => {
      setHeaderHeight(Math.max(HEADER_MIN_HEIGHT, el.offsetHeight));
    };

    actualizarAltura();

    const observer = new ResizeObserver(actualizarAltura);
    observer.observe(el);
    return () => observer.disconnect();
  }, [nombre, clase, nivel]);

  const colorTab = (vista: Vista) =>
    vistaActual === vista ? theme.accent : theme.text;

  const ir = (vista: Vista) => () =>
    onNavigate && onNavigate(vista);

  return (
    <div
      className="d-flex flex-column vh-100"
      style={{
        backgroundColor: theme.bg,
        color: theme.text
      }}
    >
      {/* Header fijo - altura dinámica, crece si el contenido necesita más de 2 líneas */}
      <header
        ref={headerRef}
        className="fixed-top px-3 py-2 d-flex align-items-center justify-content-center flex-wrap"
        style={{
          backgroundColor: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
          zIndex: 10,
          minHeight: `${HEADER_MIN_HEIGHT}px`,
          lineHeight: 1.2,
          textAlign: 'center'
        }}
      >
        <span
          className="fw-bold me-2"
          style={{
            color: theme.text,
            maxWidth: '100%',
            overflowWrap: 'anywhere'
          }}
        >
          {nombre || 'Sin nombre'}
        </span>

        <span
          style={{ color: theme.border }}
          className="mx-2"
        >
          |
        </span>

        <span
          style={{
            color: theme.text,
            maxWidth: '100%',
            overflowWrap: 'anywhere'
          }}
        >
          {clase || 'NPC consciente'}
        </span>

        <span
          style={{ color: theme.border }}
          className="mx-2"
        >
          |
        </span>

        <span
          className="badge"
          style={{
            backgroundColor: theme.badge,
            color: '#121212',
            flexShrink: 0
          }}
        >
          Nvl. {nivel || 1}
        </span>
      </header>

      {/* Contenido */}
      <main
        className="flex-grow-1 overflow-auto px-3"
        style={{
          paddingTop: `${headerHeight + 8}px`,
          paddingBottom: '80px',
          marginBottom: '0',
          backgroundColor: theme.bg,
          color: theme.text
        }}
      >
        {children}
      </main>

      {/* Footer */}
      <div
        className="fixed-bottom"
        style={{
          zIndex: 10,
          filter: `drop-shadow(0px -1px 0px ${theme.border})`
        }}
      >
        <button
          onClick={ir('perfil')}
          className="btn rounded-circle d-flex align-items-center justify-content-center shadow-lg"
          style={{
            position: 'absolute',
            top: '-28px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '56px',
            height: '56px',
            backgroundColor: theme.accent,
            color: '#121212',
            border: `2px solid ${theme.border}`,
            zIndex: 20
          }}
        >
          <i className="bi bi-person-fill fs-3"></i>
        </button>

        <footer
          style={{
            backgroundColor: theme.footerBg,
            minHeight: '60px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 20px',
            WebkitMaskImage:
              'radial-gradient(circle at center 0px, transparent 36px, black 37px)',
            maskImage:
              'radial-gradient(circle at center 0px, transparent 36px, black 37px)'
          }}
        >
          <div
            className="d-flex"
            style={{ gap: '1.25rem' }}
          >
            <button
              onClick={ir('mazmorra')}
              className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
              style={{
                border: 'none',
                color: colorTab('mazmorra')
              }}
            >
              <i className="bi bi-shield-shaded fs-4"></i>
              <span className="small">Mazmorra</span>
            </button>

            <button
              onClick={ir('poderes')}
              className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
              style={{
                border: 'none',
                color: colorTab('poderes')
              }}
            >
              <i className="bi bi-bezier2 fs-4"></i>
              <span className="small">Poderes</span>
            </button>
          </div>

          <div style={{ width: '80px' }}></div>

          <button
            onClick={ir('inventario')}
            className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
            style={{
              border: 'none',
              color: colorTab('inventario')
            }}
          >
            <i className="bi bi-backpack fs-4"></i>
            <span className="small">Inventario</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
