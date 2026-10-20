# Diseño: Frikile
**Fecha:** 2026-10-20 · **Estado:** aprobado (decisiones validadas: palabra diaria · alias + UUID anónimo · longitud variable 5-8 sin diccionario · validación en servidor · IA = pistas cacheadas 1×día + script de catálogo)
**Contexto:** Tercera app de "la factoría": la primera con **persistencia real (D1)** y usuarios recurrentes. Plantilla: el [diseño de Excusotron](https://github.com/Ogires/excusotron/blob/main/docs/plans/2026-10-19-excusotron-design.md).

## 1. Visión

Wordle en español con **palabras frikis** (GROGU, CHOCOBO, TARDIS, HOBBIT...). Una palabra diaria igual para todos, con la categoría como pista visible, 6 intentos, pistas progresivas escritas por un "Oráculo Friki" (IA) y un **ranking diario + ranking de rachas**. Al terminar: definición sarcástica de la palabra y grid 🟩🟨⬛ para compartir en LinkedIn.

## 2. Alcance

**MV1 (un finde 🟡)**
- Palabra diaria (Europe/Madrid), longitud 5-8, 6 intentos, cualquier combinación de letras vale como intento.
- Teclado virtual ES con Ñ; tablero N×6; partida recuperable al recargar (estado en servidor).
- Identidad: UUID en `localStorage` + alias editable (por defecto `Padawan-XXXX`).
- Validación 100 % en servidor: la palabra no viaja al cliente hasta acabar.
- Pistas del Oráculo: 1.ª tras 3 fallos, 2.ª tras 5. Generadas por Groq **una vez al día**, cacheadas en KV, con fallback manual.
- Ranking del día (intentos ↑, tiempo ↑) y top rachas.
- Compartir: grid de emojis + `frikile.webninja.fyi`. `og:image` 1200×627.
- Script dev `npm run catalogo`: Groq propone entradas de catálogo para revisión humana.

**MV2 (no ahora)**
- Roast post-partida con IA (rate limit por IP + pool de reserva).
- Modo práctica ilimitado (no puntúa).
- Estadísticas personales (histograma de intentos).
- Stats globales del día ("el 34 % lo sacó en 4").

**Fuera de alcance:** login/OAuth, diccionario de palabras válidas, multijugador en tiempo real, i18n.

## 3. Arquitectura

Un único Cloudflare Worker con `assets` (patrón de la factoría), en `frikile.webninja.fyi` (+ `workers_dev: true`).

```
┌──────────────────── Browser ────────────────────┐
│ index.html + app.js + styles.css (vanilla)      │
│ · tablero N×6 (N = 5..8) + teclado ES con Ñ     │
│ · localStorage: jugadorId (UUID) + alias        │
│ · modal final: definición, grid 🟩🟨⬛, ranking  │
└───────┬──────────────────────────────▲──────────┘
        │ fetch JSON /api/*            │
┌───────▼──────────────────────────────┴──────────┐
│ Cloudflare Worker                               │
│ · hoy.ts      fecha Europe/Madrid → nº de día   │
│ · evaluar.ts  colores (2 pasadas, duplicados)   │
│ · partida.ts  estado y reglas (6 intentos)      │
│ · pistas.ts   Groq 1×día → KV, fallback manual  │
│ · ranking.ts  top del día + top rachas          │
│ · rate-limit.ts (copiado de Excusotron)         │
└──┬──────────────┬─────────────────┬─────────────┘
   │ D1 (DB)      │ KV              │ Groq (vars.GROQ_MODEL)
   palabras       pistas:{fecha}    solo 1 llamada/día
   partidas       rl:{ip}
   jugadores
```

**Decisiones clave:**
- **Servidor autoritativo** (descartados: validación en cliente → ranking trucable desde la consola; compromiso criptográfico → para colorear hay que conocer la palabra, se filtra igual).
- **Catálogo privado**: el repo es público, así que el catálogo real (`data/palabras.json`) está en `.gitignore` y se carga en D1 con `npm run seed` (baraja una vez y asigna `orden`). El repo trae `data/palabras.ejemplo.json` (~20 entradas) para tests y clones. Palabra del día = `orden = díasDesdeLanzamiento % total`. Determinista, sin cron.
- **IA fuera del camino crítico**: la palabra y los colores nunca dependen de Groq. La IA solo escribe pistas (cacheadas y compartidas por todos: coste ≈ 1 llamada/día) y ayuda a generar el catálogo en desarrollo (revisión humana obligatoria).
- **Normalización**: mayúsculas, sin tildes (Á→A, Ü→U), **Ñ es letra propia**. Solo palabras de una pieza, `^[A-ZÑ]{5,8}$`.
- **Vanilla JS sin build** en el frontend; TypeScript estricto en el Worker.

## 4. API

| Endpoint | Entrada | Respuesta |
|---|---|---|
| `GET /api/hoy?jugador=` | UUID | `{ numero, longitud, categoria, partida }` — `partida`: `{ intentos: [{palabra, colores}], estado, pistas }` o `null`; si terminó, `palabra` + `definicion` |
| `POST /api/intento` | `{ jugador, intento }` | `{ numero, colores, estado: "jugando"\|"ganada"\|"perdida", pistas: string[] }` + `{ palabra, definicion }` si terminó |
| `POST /api/alias` | `{ jugador, alias }` | `{ alias }` — 3-16 caracteres `[\p{L}\p{N}_]`, no único |
| `GET /api/ranking?tipo=hoy\|rachas` | — | top 20: hoy por `n_intentos, duracion_ms`; rachas por `racha_actual, racha_max` (solo rachas vivas) |

**Reglas de servidor:** 6 intentos máximo; longitud validada; pistas solo en las respuestas cuando están desbloqueadas (fallos ≥3 → 1, ≥5 → 2); tiempo medido en servidor (primer → último intento); rate limit por IP en `/api/intento` (30/min). Riesgo asumido y documentado en el README: con UUIDs desechables se puede descubrir la palabra jugando varias veces; cerrarlo exige login.

**Flujo de pistas:** al desbloquear una pista se lee `pistas:{fecha}` en KV; si falta, se llama a Groq (`reasoning_effort: low`, `max_tokens: 1200`, JSON con 2 pistas), se valida que ninguna contiene la palabra ni su raíz (primeras 4 letras normalizadas) y se guarda con TTL 48 h. Si Groq falla o la pista revela la palabra → `pista_reserva` del catálogo (se usa para ambas pistas: la 1.ª = categoría ampliada en la reserva, ver §5). Promesas post-respuesta con `ctx.waitUntil`.

## 5. Modelo de datos (D1, migración `0001_inicial.sql`)

```sql
CREATE TABLE palabras (
  id            INTEGER PRIMARY KEY,
  palabra       TEXT NOT NULL UNIQUE,      -- normalizada: GROGU
  categoria     TEXT NOT NULL,             -- "🎬 Cine"
  definicion    TEXT NOT NULL,             -- la gracia del final
  pista_reserva TEXT NOT NULL,             -- fallback si Groq falla
  orden         INTEGER NOT NULL UNIQUE    -- asignado por npm run seed
);

CREATE TABLE jugadores (
  id                  TEXT PRIMARY KEY,    -- UUID del navegador
  alias               TEXT NOT NULL,       -- por defecto "Padawan-7F3A"
  racha_actual        INTEGER NOT NULL DEFAULT 0,
  racha_max           INTEGER NOT NULL DEFAULT 0,
  ultima_fecha_ganada TEXT,                -- 'YYYY-MM-DD'
  creado_ms           INTEGER NOT NULL
);

CREATE TABLE partidas (
  jugador_id  TEXT NOT NULL REFERENCES jugadores(id),
  fecha       TEXT NOT NULL,               -- día Europe/Madrid
  intentos    TEXT NOT NULL DEFAULT '[]',  -- JSON ["CHOCOLA","CHOCOBO"]
  estado      TEXT NOT NULL DEFAULT 'jugando',
  n_intentos  INTEGER NOT NULL DEFAULT 0,  -- desnormalizado para ranking
  inicio_ms   INTEGER NOT NULL,
  duracion_ms INTEGER,                     -- solo al terminar
  PRIMARY KEY (jugador_id, fecha)
);
CREATE INDEX idx_ranking_dia ON partidas(fecha, estado, n_intentos, duracion_ms);
```

- Se guardan las palabras intentadas, no los colores: `evaluar()` es pura y los recalcula (una sola fuente de verdad).
- Pista 1 de reserva = `pista_reserva`; pista 2 de reserva = "Empieza por «X» y acaba por «Y»" (derivada, sin campo extra).
- Coste: ≤ 6 UPDATE de partida + 1 de jugador por jugador/día ≈ 7 escrituras (free tier 100k/día).
- **KV:** `pistas:{fecha}` (JSON, TTL 48 h) · `rl:{ip}` (TTL 60 s).

**Rachas sin cron:** al ganar el día F → si `ultima_fecha_ganada = F−1` racha+1, si no racha=1; `racha_max = max`. Al perder → 0. Racha **efectiva** al leer: `racha_actual` si `ultima_fecha_ganada ∈ {hoy, ayer}`, si no 0. El ranking filtra `WHERE ultima_fecha_ganada >= ayer`.

**Concurrencia:** UPDATE con condición optimista `WHERE jugador_id=? AND fecha=? AND n_intentos=?`; 0 filas → 409 y el cliente recarga `/api/hoy`.

## 6. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Longitud/caracteres inválidos | 400 → la fila tiembla, *"Eso no existe ni en klingon"* |
| Partida ya terminada | 409 → modal final |
| Conflicto de concurrencia | 409 → recarga `/api/hoy` silenciosa |
| Rate limit | 429 → *"Los Nazgûl vigilan esta IP. Vuelve en 60 s"* + countdown |
| Groq caído/sin cuota/pista revela la palabra | `pista_reserva`, sin aviso |
| Cambio de día a mitad de partida | `numero` en cada respuesta; si cambia → *"Nuevo Frikile disponible"* y recarga |
| D1 caído | 503 → *"El Oráculo está en mantenimiento"* (único caso sin juego, asumido) |
| UUID malformado | 400 → el cliente regenera UUID |

## 7. Estrategia de tests (TDD)

- **Unitarios puros:** `normalizar` (tildes, Ñ, mayúsculas) · `evaluar` (duplicados: `OOOOOOO` vs `CHOCOBO` = 3 verdes, resto gris) · `diaDeHoy` (medianoche Madrid, cambios de hora marzo/octubre) · `calcularRacha` (consecutivo, hueco, derrota) · `pistaRevela` (palabra o raíz dentro).
- **Integración con D1 + KV reales** (`@cloudflare/vitest-plugin`, migraciones aplicadas en setup): partida ganada/perdida/7.º intento rechazado, recuperación en `/api/hoy`, ranking con desempates, conflicto 409, pistas cacheadas y fallback con Groq mockeado parcheando `globalThis.fetch` con fábrica de Response (lección 1).
- **Verificación en producción** tras deploy (lección 5): partida real en `frikile.webninja.fyi` + `wrangler d1 execute --remote` para ver las filas.

## 8. Despliegue y CI/CD

- Repo público `github.com/Ogires/frikile`. README con GIF, diagrama, "arquitectura de 0 €" y sección anti-trampas.
- `wrangler.jsonc`: `assets`, D1 (`DB`), KV (`KV`), `vars.GROQ_MODEL`, `vars.FECHA_LANZAMIENTO`, `routes` custom_domain + `workers_dev: true`.
- Secret `GROQ_API_KEY` vía `wrangler secret put`. Migraciones: `wrangler d1 migrations apply frikile --remote`. Catálogo: `npm run seed` (local, nunca en CI).
- GitHub Actions: job test + job deploy solo desde main con `npx wrangler deploy` (mismo workflow que Excusotron).

## 9. Criterios de éxito

- Respuesta de `/api/intento` P95 < 300 ms (sin IA en el camino; con pista sin cachear < 5 s una vez al día).
- Coste 0 €: ≤ 1 llamada Groq/día en producción.
- Imposible ver la palabra del día en el JS, el repo o la red antes de terminar.
- README + demo que se explican solos en 30 segundos.
