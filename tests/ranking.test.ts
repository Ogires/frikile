import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { guardarAlias, rankingHoy, rankingRachas, validarAlias } from "../src/ranking";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

async function jugador(n: number, alias: string, racha: number, max: number, ultima: string | null) {
  await env.DB.prepare(
    "INSERT INTO jugadores (id, alias, racha_actual, racha_max, ultima_fecha_ganada, creado_ms) VALUES (?, ?, ?, ?, ?, 0)"
  ).bind(id(n), alias, racha, max, ultima).run();
}
async function partida(n: number, fecha: string, estado: string, intentos: number, duracion: number | null) {
  await env.DB.prepare(
    "INSERT INTO partidas (jugador_id, fecha, estado, n_intentos, inicio_ms, duracion_ms) VALUES (?, ?, ?, ?, 0, ?)"
  ).bind(id(n), fecha, estado, intentos, duracion).run();
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM partidas"), env.DB.prepare("DELETE FROM jugadores")]);
});

describe("rankingHoy", () => {
  it("solo ganadas del día, por intentos y luego tiempo", async () => {
    await jugador(1, "Leia", 0, 0, null);
    await jugador(2, "Han", 0, 0, null);
    await jugador(3, "Luke", 0, 0, null);
    await jugador(4, "Jar_Jar", 0, 0, null);
    await partida(1, "2026-10-20", "ganada", 4, 9000);
    await partida(2, "2026-10-20", "ganada", 3, 50000);
    await partida(3, "2026-10-20", "ganada", 4, 2000);
    await partida(4, "2026-10-20", "perdida", 6, 1000);
    await partida(4, "2026-10-19", "ganada", 1, 10);
    expect((await rankingHoy(env.DB, "2026-10-20")).map((f) => f.alias)).toEqual(["Han", "Luke", "Leia"]);
  });
});

describe("rankingRachas", () => {
  it("solo rachas vivas, por actual y luego máxima", async () => {
    await jugador(1, "Hoy3", 3, 3, "2026-10-20");
    await jugador(2, "Ayer5", 5, 5, "2026-10-19");
    await jugador(3, "Muerta9", 9, 9, "2026-10-18");
    await jugador(4, "Cero", 0, 8, "2026-10-20");
    await jugador(5, "Hoy3Max7", 3, 7, "2026-10-20");
    const filas = await rankingRachas(env.DB, "2026-10-20");
    expect(filas).toEqual([
      { alias: "Ayer5", racha: 5, max: 5 },
      { alias: "Hoy3Max7", racha: 3, max: 7 },
      { alias: "Hoy3", racha: 3, max: 3 },
    ]);
  });
});

describe("alias", () => {
  it("valida 3-16 letras/números/_", () => {
    expect(validarAlias("  Mando_42 ")).toBe("Mando_42");
    expect(validarAlias("Ñoño")).toBe("Ñoño");
    expect(validarAlias("ab")).toBeNull();
    expect(validarAlias("<script>")).toBeNull();
    expect(validarAlias(42)).toBeNull();
  });
  it("crea o actualiza el alias", async () => {
    await guardarAlias(env.DB, id(1), "Primero", 0);
    await guardarAlias(env.DB, id(1), "Segundo", 0);
    const j = await env.DB.prepare("SELECT alias FROM jugadores WHERE id = ?").bind(id(1)).first<{ alias: string }>();
    expect(j?.alias).toBe("Segundo");
  });
});
