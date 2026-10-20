// src/ranking.ts
import { fechaAnterior } from "./fechas";

const TOP = 20;

export interface FilaHoy {
  alias: string;
  intentos: number;
  duracion_ms: number;
}

export interface FilaRacha {
  alias: string;
  racha: number;
  max: number;
}

export async function rankingHoy(db: D1Database, fecha: string): Promise<FilaHoy[]> {
  const { results } = await db
    .prepare(
      `SELECT j.alias AS alias, p.n_intentos AS intentos, p.duracion_ms AS duracion_ms
       FROM partidas p JOIN jugadores j ON j.id = p.jugador_id
       WHERE p.fecha = ? AND p.estado = 'ganada'
       ORDER BY p.n_intentos ASC, p.duracion_ms ASC LIMIT ?`
    )
    .bind(fecha, TOP)
    .all<FilaHoy>();
  return results;
}

// Fechas ISO 'YYYY-MM-DD' se comparan bien como texto
export async function rankingRachas(db: D1Database, hoy: string): Promise<FilaRacha[]> {
  const { results } = await db
    .prepare(
      `SELECT alias, racha_actual AS racha, racha_max AS max FROM jugadores
       WHERE racha_actual > 0 AND ultima_fecha_ganada >= ?
       ORDER BY racha_actual DESC, racha_max DESC LIMIT ?`
    )
    .bind(fechaAnterior(hoy), TOP)
    .all<FilaRacha>();
  return results;
}

export function validarAlias(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const alias = s.trim();
  return /^[\p{L}\p{N}_]{3,16}$/u.test(alias) ? alias : null;
}

export async function guardarAlias(db: D1Database, jugadorId: string, alias: string, ahoraMs: number): Promise<void> {
  await db
    .prepare(
      "INSERT INTO jugadores (id, alias, creado_ms) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET alias = excluded.alias"
    )
    .bind(jugadorId, alias, ahoraMs)
    .run();
}

export async function leerAlias(db: D1Database, jugadorId: string): Promise<string | null> {
  const fila = await db.prepare("SELECT alias FROM jugadores WHERE id = ?").bind(jugadorId).first<{ alias: string }>();
  return fila?.alias ?? null;
}
