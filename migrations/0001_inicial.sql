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
