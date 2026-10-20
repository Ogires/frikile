const DIA_MS = 86_400_000;
const FORMATO = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 'YYYY-MM-DD' del día en España: la palabra cambia a medianoche peninsular
export function diaDeHoy(ahoraMs: number): string {
  const p = Object.fromEntries(FORMATO.formatToParts(new Date(ahoraMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function aUtc(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA_MS);
}

export function fechaAnterior(fecha: string): string {
  return new Date(aUtc(fecha) - DIA_MS).toISOString().slice(0, 10);
}

export function numeroDelDia(fecha: string, lanzamiento: string): number {
  return diasEntre(lanzamiento, fecha) + 1;
}
