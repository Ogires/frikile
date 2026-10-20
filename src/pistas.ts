// src/pistas.ts
import type { Entrada } from "./catalogo";
import { normalizar } from "./texto";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TTL_IA = 172_800; // 48 h: cubre el día entero sea cual sea la hora de la primera llamada
const TTL_RESERVA = 600; // si Groq falla, se reintenta en 10 min sin martillearlo

const SYSTEM = `Eres el Oráculo Friki de Frikile, un Wordle de palabras frikis en español.
Te doy la palabra secreta y escribes DOS pistas en español, con humor friki.
pista1: críptica y evocadora. pista2: más clara, pero sin regalarla.
PROHIBIDO escribir la palabra, su raíz o una traducción. Máximo 120 caracteres cada una.
Responde SOLO con JSON: {"pista1":"...","pista2":"..."}`;

export interface ConfigGroq {
  apiKey?: string;
  model: string;
}

export function pistasDesbloqueadas(fallos: number): number {
  return fallos >= 5 ? 2 : fallos >= 3 ? 1 : 0;
}

export function pistaRevela(pista: string, palabra: string): boolean {
  const texto = normalizar(pista);
  return texto.includes(palabra) || texto.includes(palabra.slice(0, 4));
}

export function pistasDeReserva(e: Entrada): [string, string] {
  return [e.pista_reserva, `Empieza por «${e.palabra[0]}» y acaba por «${e.palabra.at(-1)}»`];
}

export async function pedirPistasAGroq(cfg: ConfigGroq, e: Entrada): Promise<[string, string] | null> {
  if (!cfg.apiKey) return null;
  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Palabra: ${e.palabra}\nCategoría: ${e.categoria}\nDefinición: ${e.definicion}` },
        ],
        temperature: 0.8,
        max_tokens: 1200,
        // gpt-oss es un modelo de razonamiento: sin esto quema el budget pensando
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const data = await r.json<{ choices?: { message?: { content?: string } }[] }>();
    const json = (data.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const p = JSON.parse(json) as { pista1?: unknown; pista2?: unknown };
    if (typeof p.pista1 !== "string" || typeof p.pista2 !== "string") return null;
    const pistas: [string, string] = [p.pista1.trim(), p.pista2.trim()];
    if (pistas.some((x) => !x || x.length > 160 || pistaRevela(x, e.palabra))) return null;
    return pistas;
  } catch {
    return null;
  }
}

// La palabra es la misma para todos: una llamada a Groq al día sirve a todos los jugadores
export async function obtenerPistas(
  kv: KVNamespace,
  cfg: ConfigGroq,
  fecha: string,
  e: Entrada,
  n: number
): Promise<string[]> {
  if (n <= 0) return [];
  const clave = `pistas:${fecha}`;
  let pistas = await kv.get<[string, string]>(clave, "json");
  if (!pistas) {
    const ia = await pedirPistasAGroq(cfg, e);
    pistas = ia ?? pistasDeReserva(e);
    await kv.put(clave, JSON.stringify(pistas), { expirationTtl: ia ? TTL_IA : TTL_RESERVA });
  }
  return pistas.slice(0, n);
}
