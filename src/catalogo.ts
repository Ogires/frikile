import { diasEntre } from "./fechas";

export interface Entrada {
  palabra: string;
  categoria: string;
  definicion: string;
  pista_reserva: string;
}

// `orden` es contiguo 0..n-1 (lo garantiza scripts/seed.mjs); añadir palabras al final
// no cambia los días ya jugados mientras no se haya dado la vuelta al catálogo
export async function palabraDelDia(db: D1Database, fecha: string, lanzamiento: string): Promise<Entrada | null> {
  const fila = await db.prepare("SELECT COUNT(*) AS total FROM palabras").first<{ total: number }>();
  const total = fila?.total ?? 0;
  if (total === 0) return null;
  const orden = ((diasEntre(lanzamiento, fecha) % total) + total) % total;
  return db
    .prepare("SELECT palabra, categoria, definicion, pista_reserva FROM palabras WHERE orden = ?")
    .bind(orden)
    .first<Entrada>();
}
