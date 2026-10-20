// tests/helpers.ts
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const fetchReal = globalThis.fetch.bind(globalThis);

export function mockGroq(crear: () => Response): { llamadas: number } {
  const contador = { llamadas: 0 };
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === GROQ_URL) {
      contador.llamadas++;
      return Promise.resolve(crear());
    }
    return fetchReal(input, init);
  }) as typeof fetch;
  return contador;
}

export function restaurarFetch(): void {
  globalThis.fetch = fetchReal;
}

export function respuestaGroq(contenido: string): Response {
  return Response.json({ choices: [{ message: { content: contenido } }] });
}
