// scripts/seed.mjs — carga incremental del catálogo en D1. Nunca borra ni reordena lo ya jugado.
// Uso: node scripts/seed.mjs [--local|--remote] [--yes] [ruta=data/palabras.json]
import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { validarCatalogo } from "./validar-catalogo.mjs";

const args = process.argv.slice(2);
const remoto = args.includes("--remote");
const flag = remoto ? "--remote" : "--local";
const ruta = args.find((a) => !a.startsWith("--")) ?? "data/palabras.json";
const SQL = ".wrangler/seed.sql";

const wrangler = (resto) =>
  execSync(`npx wrangler d1 execute frikile ${flag} ${resto}`, {
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

function barajar(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const catalogo = JSON.parse(readFileSync(ruta, "utf8"));
const errores = validarCatalogo(catalogo);
if (errores.length) {
  console.error(`❌ ${ruta} tiene ${errores.length} errores:\n  ${errores.join("\n  ")}`);
  process.exit(1);
}

if (remoto && !args.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question("⚠️  Vas a escribir en la D1 REMOTA (producción). Escribe «si» para continuar: ");
  rl.close();
  if (r.trim().toLowerCase() !== "si") {
    console.log("Cancelado.");
    process.exit(1);
  }
}

// La salida --json es un array de resultados: [{ results: [...], success, meta }]
const salida = wrangler(`--json --command "SELECT palabra, orden FROM palabras"`);
const existentes = JSON.parse(salida.slice(salida.indexOf("[")))[0]?.results ?? [];
const yaEstan = new Set(existentes.map((f) => f.palabra));
let siguiente = existentes.reduce((m, f) => Math.max(m, f.orden), -1) + 1;

const nuevas = barajar(catalogo.filter((e) => !yaEstan.has(e.palabra)));
if (nuevas.length) {
  const filas = nuevas.map(
    (e) =>
      `INSERT INTO palabras (palabra, categoria, definicion, pista_reserva, orden) VALUES (${sql(e.palabra)}, ${sql(
        e.categoria,
      )}, ${sql(e.definicion)}, ${sql(e.pista_reserva)}, ${siguiente++});`,
  );
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(SQL, filas.join("\n") + "\n", "utf8");
  wrangler(`--file=${SQL} --yes`);
}

const total = existentes.length + nuevas.length;
console.log(`✅ ${nuevas.length} nuevas, ${existentes.length} existentes, total ${total}`);
