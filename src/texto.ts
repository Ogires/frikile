// NFD separa la tilde de la Ñ (N + U+0303): se recompone antes de borrar diacríticos
export function normalizar(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/N\u0303/g, "Ñ")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

export function esIntentoValido(intento: string, longitud: number): boolean {
  return intento.length === longitud && /^[A-ZÑ]+$/.test(intento);
}
