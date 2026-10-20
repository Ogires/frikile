import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import ejemplo from "../data/palabras.ejemplo.json";
import { palabraDelDia } from "../src/catalogo";

const L = "2026-10-20";

describe("palabraDelDia", () => {
  it("el día de lanzamiento es orden 0 y avanza de uno en uno", async () => {
    expect((await palabraDelDia(env.DB, L, L))?.palabra).toBe(ejemplo[0].palabra);
    expect((await palabraDelDia(env.DB, "2026-10-21", L))?.palabra).toBe(ejemplo[1].palabra);
  });
  it("da la vuelta al catálogo", async () => {
    expect((await palabraDelDia(env.DB, "2026-11-09", L))?.palabra).toBe(ejemplo[0].palabra); // +20 días
    expect((await palabraDelDia(env.DB, "2026-10-19", L))?.palabra).toBe(ejemplo[19].palabra); // -1 día
  });
  it("devuelve la entrada completa", async () => {
    const e = await palabraDelDia(env.DB, L, L);
    expect(e).toEqual(ejemplo[0]);
  });
});
