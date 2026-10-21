export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  RL: RateLimit;
  GROQ_API_KEY?: string;
  GROQ_MODEL: string;
  FECHA_LANZAMIENTO: string;
}
