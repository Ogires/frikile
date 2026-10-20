import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { obtenerPistas, pistaRevela, pistasDeReserva, pistasDesbloqueadas } from "../src/pistas";
import { mockGroq, respuestaGroq, restaurarFetch } from "./helpers";

const e = { palabra: "GROGU", categoria: "🎬 Cine y series", definicion: "Bebé verde.", pista_reserva: "Pequeño y verde." };
const cfg = { apiKey: "test", model: "openai/gpt-oss-120b" };
afterEach(restaurarFetch);

describe("reglas de pistas", () => {
  it("se desbloquean con 3 y 5 fallos", () => {
    expect([0, 2, 3, 4, 5, 6].map(pistasDesbloqueadas)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("detecta pistas que revelan la palabra o su raíz", () => {
    expect(pistaRevela("Se llama Grogú, ¿no?", "GROGU")).toBe(true);
    expect(pistaRevela("Los fans lo llaman GROG", "GROGU")).toBe(true);
    expect(pistaRevela("Pequeño, verde y adorable", "GROGU")).toBe(false);
  });
  it("reserva: pista manual + primera/última letra", () => {
    expect(pistasDeReserva(e)).toEqual(["Pequeño y verde.", "Empieza por «G» y acaba por «U»"]);
  });
});

describe("obtenerPistas", () => {
  it("0 desbloqueadas = sin llamada", async () => {
    const m = mockGroq(() => respuestaGroq("{}"));
    expect(await obtenerPistas(env.KV, cfg, "2030-01-01", e, 0)).toEqual([]);
    expect(m.llamadas).toBe(0);
  });
  it("llama a Groq una vez y cachea en KV", async () => {
    const m = mockGroq(() => respuestaGroq('Aquí va: {"pista1":"Verde y diminuto","pista2":"Viaja en una cuna flotante"}'));
    expect(await obtenerPistas(env.KV, cfg, "2030-01-02", e, 1)).toEqual(["Verde y diminuto"]);
    expect(await obtenerPistas(env.KV, cfg, "2030-01-02", e, 2)).toEqual(["Verde y diminuto", "Viaja en una cuna flotante"]);
    expect(m.llamadas).toBe(1);
  });
  it("Groq caído → reserva", async () => {
    mockGroq(() => new Response("boom", { status: 500 }));
    expect(await obtenerPistas(env.KV, cfg, "2030-01-03", e, 2)).toEqual(pistasDeReserva(e));
  });
  it("pista que revela la palabra → reserva", async () => {
    mockGroq(() => respuestaGroq('{"pista1":"Es Grogu","pista2":"Verde"}'));
    expect(await obtenerPistas(env.KV, cfg, "2030-01-04", e, 1)).toEqual([e.pista_reserva]);
  });
  it("sin API key → reserva sin llamar", async () => {
    const m = mockGroq(() => respuestaGroq("{}"));
    expect(await obtenerPistas(env.KV, { model: "x" }, "2030-01-05", e, 1)).toEqual([e.pista_reserva]);
    expect(m.llamadas).toBe(0);
  });
});
