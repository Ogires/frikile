import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { colorear, contarFallos, esUuid, leerPartida, registrarIntento } from "../src/partida";

const J = "0f8fad5b-d9cb-469f-a165-70867728950e";
const base = { jugadorId: J, fecha: "2026-10-20", solucion: "GROGU" };

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM partidas"), env.DB.prepare("DELETE FROM jugadores")]);
});

describe("registrarIntento", () => {
  it("el primer intento crea jugador (alias Padawan) y partida", async () => {
    const r = await registrarIntento(env.DB, { ...base, intento: "grupo", ahoraMs: 1000 });
    expect(r).toMatchObject({ ok: true, partida: { intentos: ["GRUPO"], estado: "jugando" } });
    const j = await env.DB.prepare("SELECT alias FROM jugadores WHERE id = ?").bind(J).first<{ alias: string }>();
    expect(j?.alias).toBe("Padawan-0F8F");
  });

  it("gana normalizando tildes y mide la duración en servidor", async () => {
    await registrarIntento(env.DB, { ...base, intento: "GRUPO", ahoraMs: 1000 });
    const r = await registrarIntento(env.DB, { ...base, intento: "grógu", ahoraMs: 31000 });
    expect(r).toMatchObject({ ok: true, partida: { estado: "ganada", duracion_ms: 30000 } });
  });

  it("rechaza longitud o caracteres inválidos", async () => {
    expect(await registrarIntento(env.DB, { ...base, intento: "GROG", ahoraMs: 1 })).toEqual({ ok: false, error: "invalido" });
  });

  it("6 fallos = perdida; el 7.º se rechaza", async () => {
    for (let i = 0; i < 6; i++) await registrarIntento(env.DB, { ...base, intento: "ZZZZZ", ahoraMs: i });
    const p = await leerPartida(env.DB, J, base.fecha);
    expect(p?.estado).toBe("perdida");
    expect(await registrarIntento(env.DB, { ...base, intento: "GROGU", ahoraMs: 9 })).toEqual({ ok: false, error: "terminada" });
  });

  it("no se puede seguir jugando tras ganar", async () => {
    await registrarIntento(env.DB, { ...base, intento: "GROGU", ahoraMs: 1 });
    expect(await registrarIntento(env.DB, { ...base, intento: "GROGU", ahoraMs: 2 })).toEqual({ ok: false, error: "terminada" });
  });

  it("actualiza rachas al terminar", async () => {
    await registrarIntento(env.DB, { ...base, fecha: "2026-10-20", intento: "GROGU", ahoraMs: 1 });
    await registrarIntento(env.DB, { ...base, fecha: "2026-10-21", intento: "GROGU", ahoraMs: 2 });
    let j = await env.DB.prepare("SELECT racha_actual, racha_max FROM jugadores WHERE id = ?").bind(J).first();
    expect(j).toEqual({ racha_actual: 2, racha_max: 2 });
    for (let i = 0; i < 6; i++) await registrarIntento(env.DB, { ...base, fecha: "2026-10-22", intento: "ZZZZZ", ahoraMs: 3 });
    j = await env.DB.prepare("SELECT racha_actual, racha_max FROM jugadores WHERE id = ?").bind(J).first();
    expect(j).toEqual({ racha_actual: 0, racha_max: 2 });
  });

  it("intentos concurrentes nunca se cuentan dos veces", async () => {
    const rs = await Promise.all(
      Array.from({ length: 4 }, (_, i) => registrarIntento(env.DB, { ...base, intento: "ZZZZZ", ahoraMs: i }))
    );
    const p = await leerPartida(env.DB, J, base.fecha);
    expect(p?.intentos.length).toBe(rs.filter((r) => r.ok).length);
  });
});

describe("helpers", () => {
  it("esUuid", () => {
    expect(esUuid(J)).toBe(true);
    expect(esUuid("hola")).toBe(false);
    expect(esUuid(undefined)).toBe(false);
  });
  it("contarFallos y colorear", () => {
    const p = { intentos: ["GRUPO", "GROGU"], estado: "ganada" as const, inicio_ms: 0, duracion_ms: 1 };
    expect(contarFallos(p, "GROGU")).toBe(1);
    expect(colorear(p, "GROGU")[1]).toEqual({ palabra: "GROGU", colores: ["verde", "verde", "verde", "verde", "verde"] });
  });
});
