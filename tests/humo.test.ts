import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

describe("humo", () => {
  it("el catálogo de ejemplo está cargado en D1", async () => {
    const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM palabras").first<{ n: number }>();
    expect(fila?.n).toBe(20);
  });
});
