// Tipos de validar-catalogo.mjs para los tests (tsc no tipa .mjs sin allowJs)
export interface EntradaCatalogo {
  palabra: string;
  categoria: string;
  definicion: string;
  pista_reserva: string;
}
export function normalizarPalabra(s: string): string;
export function validarCatalogo(entradas: readonly Partial<EntradaCatalogo>[]): string[];
