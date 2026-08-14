export function filtrarMensaje(texto: string): number {
  const soloLetras = texto.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]/g, "");
  const longitud = soloLetras.length;
  if (longitud < 6 || longitud > 90) return 0;
  return longitud;
}