// src/partida.ts
import { evaluar, type Color } from "./evaluar";
import { calcularRacha, type Racha } from "./rachas";
import { esIntentoValido, normalizar } from "./texto";

export const MAX_INTENTOS = 6;
export type Estado = "jugando" | "ganada" | "perdida";

export interface Partida {
  intentos: string[];
  estado: Estado;
  inicio_ms: number;
  duracion_ms: number | null;
}

export type ResultadoIntento =
  | { ok: true; partida: Partida }
  | { ok: false; error: "invalido" | "terminada" | "conflicto" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

export function aliasPorDefecto(jugadorId: string): string {
  return `Padawan-${jugadorId.slice(0, 4).toUpperCase()}`;
}

export async function leerPartida(db: D1Database, jugadorId: string, fecha: string): Promise<Partida | null> {
  const f = await db
    .prepare("SELECT intentos, estado, inicio_ms, duracion_ms FROM partidas WHERE jugador_id = ? AND fecha = ?")
    .bind(jugadorId, fecha)
    .first<{ intentos: string; estado: Estado; inicio_ms: number; duracion_ms: number | null }>();
  return f ? { ...f, intentos: JSON.parse(f.intentos) as string[] } : null;
}

export async function registrarIntento(
  db: D1Database,
  a: { jugadorId: string; fecha: string; solucion: string; intento: string; ahoraMs: number }
): Promise<ResultadoIntento> {
  const intento = normalizar(a.intento);
  if (!esIntentoValido(intento, a.solucion.length)) return { ok: false, error: "invalido" };

  // El cronómetro arranca con el primer intento, no al abrir la página
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO jugadores (id, alias, creado_ms) VALUES (?, ?, ?)")
      .bind(a.jugadorId, aliasPorDefecto(a.jugadorId), a.ahoraMs),
    db.prepare("INSERT OR IGNORE INTO partidas (jugador_id, fecha, inicio_ms) VALUES (?, ?, ?)")
      .bind(a.jugadorId, a.fecha, a.ahoraMs),
  ]);
  const previa = await leerPartida(db, a.jugadorId, a.fecha);
  if (!previa || previa.estado !== "jugando") return { ok: false, error: "terminada" };

  const intentos = [...previa.intentos, intento];
  const estado: Estado =
    intento === a.solucion ? "ganada" : intentos.length >= MAX_INTENTOS ? "perdida" : "jugando";
  const duracion = estado === "jugando" ? null : a.ahoraMs - previa.inicio_ms;

  // Bloqueo optimista: si otro intento ganó la carrera, n_intentos ya no coincide
  const r = await db
    .prepare(
      "UPDATE partidas SET intentos = ?, estado = ?, n_intentos = ?, duracion_ms = ? WHERE jugador_id = ? AND fecha = ? AND n_intentos = ?"
    )
    .bind(JSON.stringify(intentos), estado, intentos.length, duracion, a.jugadorId, a.fecha, previa.intentos.length)
    .run();
  if (r.meta.changes === 0) return { ok: false, error: "conflicto" };

  if (estado !== "jugando") await actualizarRacha(db, a.jugadorId, a.fecha, estado === "ganada");
  return { ok: true, partida: { intentos, estado, inicio_ms: previa.inicio_ms, duracion_ms: duracion } };
}

async function actualizarRacha(db: D1Database, jugadorId: string, fecha: string, gano: boolean): Promise<void> {
  const prev = await db
    .prepare("SELECT racha_actual, racha_max, ultima_fecha_ganada FROM jugadores WHERE id = ?")
    .bind(jugadorId)
    .first<Racha>();
  if (!prev) return;
  const r = calcularRacha(prev, fecha, gano);
  await db
    .prepare("UPDATE jugadores SET racha_actual = ?, racha_max = ?, ultima_fecha_ganada = ? WHERE id = ?")
    .bind(r.racha_actual, r.racha_max, r.ultima_fecha_ganada, jugadorId)
    .run();
}

export function contarFallos(p: Partida, solucion: string): number {
  return p.intentos.filter((i) => i !== solucion).length;
}

export function colorear(p: Partida, solucion: string): { palabra: string; colores: Color[] }[] {
  return p.intentos.map((palabra) => ({ palabra, colores: evaluar(palabra, solucion) }));
}
