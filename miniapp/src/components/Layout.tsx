import React from 'react';
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

export const Layout = ({ children, nombre, clase, nivel, zona, vistaActual, onNavigate }: LayoutProps) => {
  const theme = getTheme(zona || null); // <--- CORREGIDO

  const colorTab = (vista: Vista) => (vistaActual === vista ? theme.accent : theme.text);
  const ir = (vista: Vista) => () => onNavigate && onNavigate(vista);

  return (
    <div className="d-flex flex-column vh-100" style={{ backgroundColor: theme.bg, color: theme.text }}>
      {/* Header fijo */}
      <header
        className="fixed-top py-2 px-3 d-flex align-items-center justify-content-center"
        style={{
          backgroundColor: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
          zIndex: 10,
          minHeight: '56px'
        }}
      >
        <span className="fw-bold me-2" style={{ color: theme.text }}>{nombre || 'Sin nombre'}</span>
        <span style={{ color: theme.border }} className="mx-2">|</span>
        <span style={{ color: theme.text }}>{clase || 'Marginado'}</span>
        <span style={{ color: theme.border }} className="mx-2">|</span>
        <span className="badge" style={{ backgroundColor: theme.badge, color: '#121212' }}>Nvl. {nivel || 1}</span>
      </header>

      {/* Contenido */}
      <main
        className="flex-grow-1 overflow-auto mt-5 pt-2 pb-5 px-3"
        style={{
          marginTop: '56px',
          marginBottom: '70px',
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
            WebkitMaskImage: 'radial-gradient(circle at center 0px, transparent 36px, black 37px)',
            maskImage: 'radial-gradient(circle at center 0px, transparent 36px, black 37px)'
          }}
        >
          <div className="d-flex" style={{ gap: '1.25rem' }}>
            <button
              onClick={ir('mazmorra')}
              className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
              style={{ border: 'none', color: colorTab('mazmorra') }}
            >
              <i className="bi bi-shield-shaded fs-4"></i>
              <span className="small">Mazmorra</span>
            </button>

            <button
              onClick={ir('poderes')}
              className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
              style={{ border: 'none', color: colorTab('poderes') }}
            >
              <i className="bi bi-bezier2 fs-4"></i>
              <span className="small">Poderes</span>
            </button>
          </div>

          <div style={{ width: '80px' }}></div>

          <button
            onClick={ir('inventario')}
            className="btn btn-outline-light btn-sm d-flex flex-column align-items-center"
            style={{ border: 'none', color: colorTab('inventario') }}
          >
            <i className="bi bi-backpack fs-4"></i>
            <span className="small">Inventario</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
