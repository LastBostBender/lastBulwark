// Paletas de colores por zona (versión clara)
export const themes: Record<string, {
  bg: string;            // Fondo general
  text: string;          // Texto principal
  border: string;        // Bordes y separadores
  headerBg: string;      // Fondo del header
  footerBg: string;      // Fondo del footer
  cardBg: string;        // Fondo de tarjetas
  accent: string;        // Color de acento (botón flotante)
  badge: string;         // Color de la etiqueta de nivel
}> = {
  'Las calderas': {
    bg: '#fdf6f0',        // Crema claro
    text: '#3a1f14',      // Marrón oscuro
    border: '#d4a08a',    // Terracota suave
    headerBg: '#f5e4d8',  // Beige rosado
    footerBg: '#f5e4d8',
    cardBg: '#ffffff',
    accent: '#e07b4a',    // Naranja quemado
    badge: '#d45c3a'
  },
  'Brote de acero': {
    bg: '#f2f9f0',        // Verde muy claro
    text: '#1a3a1a',      // Verde oscuro
    border: '#8aba8a',    // Verde suave
    headerBg: '#e2f0df',  // Verde pálido
    footerBg: '#e2f0df',
    cardBg: '#ffffff',
    accent: '#4caf50',    // Verde vibrante
    badge: '#3e8e41'
  },
  'El alacranero': {
    bg: '#fdf6ed',        // Arena clara
    text: '#4a3520',      // Marrón oscuro
    border: '#d4bea0',    // Beige arenisca
    headerBg: '#f5eadc',  // Crema cálido
    footerBg: '#f5eadc',
    cardBg: '#ffffff',
    accent: '#c49a6c',    // Ámbar desierto
    badge: '#a87b52'
  },
  'Última aurora': {
    bg: '#f0f5fc',        // Azul hielo muy claro
    text: '#1a2a4a',      // Azul profundo
    border: '#8ab0d4',    // Azul grisáceo
    headerBg: '#deeaf7',  // Azul pálido
    footerBg: '#deeaf7',
    cardBg: '#ffffff',
    accent: '#5b8fc9',    // Azul glacial
    badge: '#3a7ab5'
  }
};

// Tema por defecto (claro neutro)
export const defaultTheme = {
  bg: '#f8f9fa',
  text: '#212529',
  border: '#dee2e6',
  headerBg: '#e9ecef',
  footerBg: '#e9ecef',
  cardBg: '#ffffff',
  accent: '#f0ad4e',
  badge: '#f0ad4e'
};

export const getTheme = (zona: string | null) => {
  if (!zona || !themes[zona]) return defaultTheme;
  return themes[zona];
};