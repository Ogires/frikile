import type { Env } from "./env";

export default {
  async fetch(): Promise<Response> {
    return new Response("Esta casilla está en gris (404)", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
