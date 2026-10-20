import { fechaAnterior } from "./fechas";

export interface Racha {
  racha_actual: number;
  racha_max: number;
  ultima_fecha_ganada: string | null;
}

export function calcularRacha(prev: Racha, fecha: string, gano: boolean): Racha {
  if (!gano) return { ...prev, racha_actual: 0 };
  const actual = prev.ultima_fecha_ganada === fechaAnterior(fecha) ? prev.racha_actual + 1 : 1;
  return { racha_actual: actual, racha_max: Math.max(prev.racha_max, actual), ultima_fecha_ganada: fecha };
}

// Sin cron: faltar un día no escribe nada, la racha "muere" al leerla
export function rachaEfectiva(r: Racha, hoy: string): number {
  const viva = r.ultima_fecha_ganada === hoy || r.ultima_fecha_ganada === fechaAnterior(hoy);
  return viva ? r.racha_actual : 0;
}
