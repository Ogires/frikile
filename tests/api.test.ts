import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { palabraDelDia } from "../src/catalogo";
import { diaDeHoy } from "../src/fechas";
import { mockGroq, restaurarFetch } from "./helpers";

const base = "https://example.com";
const J = "0f8fad5b-d9cb-469f-a165-70867728950e";
let ipN = 0;

async function solucion() {
  const e = await palabraDelDia(env.DB, diaDeHoy(Date.now()), env.FECHA_LANZAMIENTO);
  if (!e) throw new Error("catálogo de test vacío");
  return e;
}
function intentar(intento: string, jugador = J, ip = `10.0.0.${ipN}`) {
  return SELF.fetch(`${base}/api/intento`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ jugador, intento }),
  });
}
const fallo = (n: number) => "Z".repeat(n);

beforeEach(async () => {
  ipN++;
  // .dev.vars podría traer una key real: Groq SIEMPRE mockeado (caído) en estos tests
  mockGroq(() => new Response("caído", { status: 503 }));
  await env.DB.batch([env.DB.prepare("DELETE FROM partidas"), env.DB.prepare("DELETE FROM jugadores")]);
  await env.KV.delete(`pistas:${diaDeHoy(Date.now())}`);
});
afterEach(restaurarFetch);

describe("GET /api/hoy", () => {
  it("400 con jugador inválido", async () => {
    expect((await SELF.fetch(`${base}/api/hoy?jugador=hola`)).status).toBe(400);
  });
  it("devuelve longitud y categoría SIN filtrar la palabra", async () => {
    const e = await solucion();
    const r = await SELF.fetch(`${base}/api/hoy?jugador=${J}`);
    const texto = await r.text();
    expect(r.status).toBe(200);
    expect(JSON.parse(texto)).toMatchObject({ numero: expect.any(Number), longitud: e.palabra.length, categoria: e.categoria, partida: null });
    expect(texto).not.toContain(e.palabra);
  });
  it("recupera la partida en curso con colores", async () => {
    const e = await solucion();
    await intentar(fallo(e.palabra.length));
    await intentar(fallo(e.palabra.length));
    const body = await (await SELF.fetch(`${base}/api/hoy?jugador=${J}`)).json<any>();
    expect(body.partida.intentos).toHaveLength(2);
    expect(body.partida.intentos[0].colores).toHaveLength(e.palabra.length);
    expect(body.partida.estado).toBe("jugando");
  });
});

describe("POST /api/intento", () => {
  it("fallo: colores y sin palabra", async () => {
    const e = await solucion();
    const r = await intentar(fallo(e.palabra.length));
    const body = await r.json<any>();
    expect(r.status).toBe(200);
    expect(body.estado).toBe("jugando");
    expect(body.colores).toHaveLength(e.palabra.length);
    expect(body.palabra).toBeUndefined();
  });
  it("acierto: ganada + palabra + definición", async () => {
    const e = await solucion();
    const body = await (await intentar(e.palabra.toLowerCase())).json<any>();
    expect(body).toMatchObject({ estado: "ganada", palabra: e.palabra, definicion: e.definicion });
  });
  it("400 si la longitud no cuadra", async () => {
    const e = await solucion();
    expect((await intentar(fallo(e.palabra.length + 1))).status).toBe(400);
  });
  it("409 si la partida ya terminó", async () => {
    const e = await solucion();
    await intentar(e.palabra);
    expect((await intentar(e.palabra)).status).toBe(409);
  });
  it("3 fallos desbloquean la pista de reserva si Groq cae", async () => {
    const e = await solucion();
    let body: any;
    for (let i = 0; i < 3; i++) body = await (await intentar(fallo(e.palabra.length))).json();
    expect(body.pistas).toEqual([e.pista_reserva]);
  });
  it("429 al pasar de 30 intentos/min por IP", async () => {
    const ip = "10.9.9.9";
    for (let i = 0; i < 30; i++) await intentar("x", "no-uuid", ip);
    expect((await intentar("x", "no-uuid", ip)).status).toBe(429);
  });
});

describe("ranking y alias", () => {
  it("alias + victoria aparecen en el ranking de hoy y de rachas", async () => {
    const e = await solucion();
    const a = await SELF.fetch(`${base}/api/alias`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jugador: J, alias: "Mando_42" }),
    });
    expect(a.status).toBe(200);
    await intentar(e.palabra);
    const hoy = await (await SELF.fetch(`${base}/api/ranking?tipo=hoy`)).json<any>();
    expect(hoy.filas[0]).toMatchObject({ alias: "Mando_42", intentos: 1 });
    const rachas = await (await SELF.fetch(`${base}/api/ranking?tipo=rachas`)).json<any>();
    expect(rachas.filas[0]).toMatchObject({ alias: "Mando_42", racha: 1 });
  });
  it("400 con alias o tipo inválido", async () => {
    const a = await SELF.fetch(`${base}/api/alias`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jugador: J, alias: "<b>" }),
    });
    expect(a.status).toBe(400);
    expect((await SELF.fetch(`${base}/api/ranking?tipo=foo`)).status).toBe(400);
  });
  it("404 en rutas desconocidas", async () => {
    expect((await SELF.fetch(`${base}/api/nada`)).status).toBe(404);
  });
});
