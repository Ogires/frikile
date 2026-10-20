// scripts/catalogo.mjs — propone entradas nuevas con Groq para revisión humana (no toca la D1).
// Uso: node scripts/catalogo.mjs [n=30] [categoria]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { normalizarPalabra, validarCatalogo } from "./validar-catalogo.mjs";

// GROQ_URL sobreescribible solo para probar el script contra un mock local
const GROQ_URL = process.env.GROQ_URL ?? "https://api.groq.com/openai/v1/chat/completions";
const RUTA = existsSync("data/palabras.json") ? "data/palabras.json" : "data/palabras.ejemplo.json";

const [nArg, ...resto] = process.argv.slice(2);
const n = Math.max(1, Math.min(60, Number.parseInt(nArg ?? "30", 10) || 30));
const categoriaPedida = resto.join(" ").trim();

function leerKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (!existsSync(".dev.vars")) return undefined;
  for (const linea of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*GROQ_API_KEY\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const apiKey = leerKey();
  if (!apiKey) {
    console.error("❌ Falta GROQ_API_KEY (variable de entorno o línea en .dev.vars)");
    return 1;
  }
  const model = readFileSync("wrangler.jsonc", "utf8").match(/"GROQ_MODEL":\s*"([^"]+)"/)?.[1];
  if (!model) {
    console.error("❌ No encuentro GROQ_MODEL en wrangler.jsonc");
    return 1;
  }

  const catalogo = JSON.parse(readFileSync(RUTA, "utf8"));
  const existentes = new Set(catalogo.map((e) => e.palabra));
  const categorias = [...new Set(catalogo.map((e) => e.categoria))];
  const ejemplos = catalogo.slice(0, 4);

  const SYSTEM = `Eres el guionista de Frikile, un Wordle diario de palabras frikis en español.
Propones entradas de catálogo. Reglas:
- "palabra": 5 a 8 letras, una sola palabra, MAYÚSCULAS, sin tildes ni espacios ni números (la Ñ vale).
- Conocida por un friki medio español (cine, series, videojuegos, fantasía, ciencia ficción, anime, programación).
- Nada ofensivo ni polémico.
- "categoria": EXACTAMENTE una de: ${categorias.map((c) => JSON.stringify(c)).join(", ")}.
- "definicion": sarcástica y graciosa, en español de España, máximo 110 caracteres.
- "pista_reserva": críptica, máximo 110 caracteres, SIN la palabra ni sus 4 primeras letras.
Responde SOLO con un array JSON de objetos {"palabra","categoria","definicion","pista_reserva"}.`;

  const USER = `Propón ${n} entradas nuevas${categoriaPedida ? ` de la categoría ${JSON.stringify(categoriaPedida)}` : ""}.
Ejemplos del tono:
${JSON.stringify(ejemplos, null, 1)}
NO repitas ninguna de estas palabras: ${[...existentes].join(", ")}`;

  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER },
      ],
      temperature: 0.9,
      max_tokens: 4000,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    console.error(`❌ Groq respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return 1;
  }
  const contenido = (await r.json()).choices?.[0]?.message?.content ?? "";
  let crudas;
  try {
    crudas = JSON.parse(contenido.match(/\[[\s\S]*\]/)?.[0] ?? "null");
  } catch {
    crudas = null;
  }
  if (!Array.isArray(crudas)) {
    console.error("❌ La respuesta no contiene un array JSON válido");
    return 1;
  }

  const validas = [];
  const descartes = [];
  for (const c of crudas) {
    const e = {
      palabra: normalizarPalabra(c?.palabra ?? ""),
      categoria: String(c?.categoria ?? "").trim(),
      definicion: String(c?.definicion ?? "").trim(),
      pista_reserva: String(c?.pista_reserva ?? "").trim(),
    };
    const errores = validarCatalogo([e]);
    if (!categorias.includes(e.categoria)) errores.push(`categoría desconocida "${e.categoria}"`);
    if (existentes.has(e.palabra)) errores.push("repetida (ya está en el catálogo o en este lote)");
    if (e.definicion.length > 110) errores.push("definición de más de 110 caracteres");
    if (errores.length) {
      descartes.push(`${e.palabra || "?"}: ${errores.join("; ").replace(/^#1 \([^)]*\): /, "")}`);
      continue;
    }
    existentes.add(e.palabra);
    validas.push(e);
  }

  const salida = `data/propuestas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(salida, JSON.stringify(validas, null, 2) + "\n", "utf8");
  console.log(`✅ ${validas.length} válidas, ${descartes.length} descartadas → ${salida}`);
  for (const d of descartes) console.log(`   ✗ ${d}`);
  console.log("Revísalas a mano y copia las buenas a data/palabras.json; luego npm run seed -- --local");
  return 0;
}

process.exitCode = await main();
