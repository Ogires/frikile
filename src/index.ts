import { palabraDelDia, type Entrada } from "./catalogo";
import type { Env } from "./env";
import { diaDeHoy, numeroDelDia } from "./fechas";
import { colorear, contarFallos, esUuid, leerPartida, registrarIntento, type Partida } from "./partida";
import { obtenerPistas, pistasDesbloqueadas } from "./pistas";
import { checkRateLimit } from "./rate-limit";
import { guardarAlias, leerAlias, rankingHoy, rankingRachas, validarAlias } from "./ranking";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/hoy" && request.method === "GET") return await manejarHoy(url, env);
      if (url.pathname === "/api/intento" && request.method === "POST") return await manejarIntento(request, env);
      if (url.pathname === "/api/alias" && request.method === "POST") return await manejarAlias(request, env);
      if (url.pathname === "/api/ranking" && request.method === "GET") return await manejarRanking(url, env);
    } catch (err) {
      // D1 caído o catálogo vacío: único caso sin juego (no se puede degradar sin filtrar la palabra)
      console.error(err);
      return json({ error: "mantenimiento" }, 503);
    }
    return new Response("Esta casilla está en gris (404)", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function json(datos: unknown, status = 200): Response {
  return Response.json(datos, { status, headers: { "cache-control": "no-store" } });
}

async function contextoDelDia(env: Env): Promise<{ fecha: string; numero: number; entrada: Entrada }> {
  const fecha = diaDeHoy(Date.now());
  const entrada = await palabraDelDia(env.DB, fecha, env.FECHA_LANZAMIENTO);
  if (!entrada) throw new Error("catálogo vacío: ejecuta npm run seed");
  return { fecha, numero: numeroDelDia(fecha, env.FECHA_LANZAMIENTO), entrada };
}

async function vistaPartida(env: Env, fecha: string, entrada: Entrada, partida: Partida) {
  const fallos = contarFallos(partida, entrada.palabra);
  const cfg = { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL };
  const pistas = await obtenerPistas(env.KV, cfg, fecha, entrada, pistasDesbloqueadas(fallos));
  // La palabra solo viaja al cliente cuando la partida ha terminado
  const final = partida.estado === "jugando" ? {} : { palabra: entrada.palabra, definicion: entrada.definicion };
  return { intentos: colorear(partida, entrada.palabra), estado: partida.estado, pistas, ...final };
}

async function manejarHoy(url: URL, env: Env): Promise<Response> {
  const jugador = url.searchParams.get("jugador");
  if (!esUuid(jugador)) return json({ error: "jugador" }, 400);
  const { fecha, numero, entrada } = await contextoDelDia(env);
  const [partida, alias] = await Promise.all([leerPartida(env.DB, jugador, fecha), leerAlias(env.DB, jugador)]);
  return json({
    numero,
    alias,
    longitud: entrada.palabra.length,
    categoria: entrada.categoria,
    partida: partida ? await vistaPartida(env, fecha, entrada, partida) : null,
  });
}

async function manejarIntento(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const rl = await checkRateLimit(env.KV, ip, 30, 60);
  if (!rl.allowed) return json({ error: "nazgul", segundos: rl.retryAfter }, 429);

  const body = (await request.json().catch(() => null)) as { jugador?: unknown; intento?: unknown } | null;
  if (!esUuid(body?.jugador)) return json({ error: "jugador" }, 400);
  if (typeof body.intento !== "string") return json({ error: "invalido" }, 400);

  const { fecha, numero, entrada } = await contextoDelDia(env);
  const r = await registrarIntento(env.DB, {
    jugadorId: body.jugador,
    fecha,
    solucion: entrada.palabra,
    intento: body.intento,
    ahoraMs: Date.now(),
  });
  if (!r.ok) return json({ error: r.error, numero }, r.error === "invalido" ? 400 : 409);

  const vista = await vistaPartida(env, fecha, entrada, r.partida);
  return json({ numero, colores: vista.intentos[vista.intentos.length - 1].colores, ...vista });
}

async function manejarAlias(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { jugador?: unknown; alias?: unknown } | null;
  if (!esUuid(body?.jugador)) return json({ error: "jugador" }, 400);
  const alias = validarAlias(body.alias);
  if (!alias) return json({ error: "alias" }, 400);
  await guardarAlias(env.DB, body.jugador, alias, Date.now());
  return json({ alias });
}

async function manejarRanking(url: URL, env: Env): Promise<Response> {
  const tipo = url.searchParams.get("tipo");
  const fecha = diaDeHoy(Date.now());
  if (tipo === "hoy") return json({ tipo, filas: await rankingHoy(env.DB, fecha) });
  if (tipo === "rachas") return json({ tipo, filas: await rankingRachas(env.DB, fecha) });
  return json({ error: "tipo" }, 400);
}
