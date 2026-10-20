// tests/setup.ts — migraciones + catálogo de ejemplo (idempotente: el setup corre por fichero)
import { applyD1Migrations, env } from "cloudflare:test";
import ejemplo from "../data/palabras.ejemplo.json";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM palabras").first<{ n: number }>();
if (!fila?.n) {
  await env.DB.batch(
    ejemplo.map((e, i) =>
      env.DB.prepare(
        "INSERT INTO palabras (palabra, categoria, definicion, pista_reserva, orden) VALUES (?, ?, ?, ?, ?)"
      ).bind(e.palabra, e.categoria, e.definicion, e.pista_reserva, i)
    )
  );
}
