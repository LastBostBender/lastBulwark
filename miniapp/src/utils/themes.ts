// Paletas de colores y tipografías por zona
export const themes: Record<string, {
  bg: string;            // Fondo general
  text: string;          // Texto principal
  border: string;        // Bordes y separadores
  headerBg: string;      // Fondo del header
  footerBg: string;      // Fondo del footer
  cardBg: string;        // Fondo de tarjetas
  accent: string;        // Color de acento (botón flotante)
  badge: string;         // Color de la etiqueta de nivel
  fontDisplay: string;   // Fuente para títulos
  fontBody: string;      // Fuente para texto de cuerpo
}> = {
  'Núcleo Hustle': {
    bg: '#0d1117',
    text: '#e6edf3',
    border: '#30363d',
    headerBg: '#161b22',
    footerBg: '#161b22',
    cardBg: '#161b22',
    accent: '#f5b042',
    badge: '#00ff85',
    fontDisplay: "'Montserrat', sans-serif",
    fontBody: "'Roboto Mono', monospace",
  },
  'Valle Serenidad': {
    bg: '#fdf6f0',
    text: '#4a3f35',
    border: '#e8d5c4',
    headerBg: '#f7ece1',
    footerBg: '#f7ece1',
    cardBg: '#ffffff',
    accent: '#4a9d82',
    badge: '#d5b3d9',
    fontDisplay: "'Quicksand', sans-serif",
    fontBody: "'Nunito', sans-serif",
  },
  'GlitchCity': {
    bg: '#0a0a0f',
    text: '#b0b0b0',
    border: '#2a1a3a',
    headerBg: '#120a1c',
    footerBg: '#120a1c',
    cardBg: '#120a1c',
    accent: '#ff00ff',
    badge: '#00ffff',
    fontDisplay: "'Orbitron', sans-serif",
    fontBody: "'Space Mono', monospace",
  },
  'Reino del Ghosting': {
    bg: '#1a1a1e',
    text: '#c0c0c0',
    border: '#2d2d33',
    headerBg: '#222227',
    footerBg: '#222227',
    cardBg: '#222227',
    accent: '#8a6de9',
    badge: '#6b6b6b',
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Fira Code', monospace",
  }
};

// Tema por defecto (antes de elegir zona)
export const defaultTheme = {
  bg: '#121212',
  text: '#e0e0e0',
  border: '#2a2a2a',
  headerBg: '#1e1e1e',
  footerBg: '#1e1e1e',
  cardBg: '#1e1e1e',
  accent: '#f0ad4e',
  badge: '#f0ad4e',
  fontDisplay: "'Press Start 2P', cursive",
  fontBody: "'VT323', monospace",
};

export const getTheme = (zona: string | null) => {
  if (!zona || !themes[zona]) return defaultTheme;
  return themes[zona];
};
