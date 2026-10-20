import { describe, expect, it } from "vitest";
import { calcularRacha, rachaEfectiva } from "../src/rachas";

const nueva = { racha_actual: 0, racha_max: 0, ultima_fecha_ganada: null };

describe("calcularRacha", () => {
  it("primera victoria = 1", () => {
    expect(calcularRacha(nueva, "2026-10-20", true)).toEqual({ racha_actual: 1, racha_max: 1, ultima_fecha_ganada: "2026-10-20" });
  });
  it("días consecutivos suman", () => {
    const r = calcularRacha({ racha_actual: 4, racha_max: 4, ultima_fecha_ganada: "2026-10-19" }, "2026-10-20", true);
    expect(r).toEqual({ racha_actual: 5, racha_max: 5, ultima_fecha_ganada: "2026-10-20" });
  });
  it("un día de hueco reinicia a 1 y conserva el máximo", () => {
    const r = calcularRacha({ racha_actual: 4, racha_max: 7, ultima_fecha_ganada: "2026-10-18" }, "2026-10-20", true);
    expect(r).toEqual({ racha_actual: 1, racha_max: 7, ultima_fecha_ganada: "2026-10-20" });
  });
  it("una derrota deja la racha a 0", () => {
    const r = calcularRacha({ racha_actual: 4, racha_max: 7, ultima_fecha_ganada: "2026-10-19" }, "2026-10-20", false);
    expect(r).toEqual({ racha_actual: 0, racha_max: 7, ultima_fecha_ganada: "2026-10-19" });
  });
});

describe("rachaEfectiva", () => {
  const r = { racha_actual: 3, racha_max: 3, ultima_fecha_ganada: "2026-10-19" };
  it("viva si ganó hoy o ayer", () => {
    expect(rachaEfectiva(r, "2026-10-19")).toBe(3);
    expect(rachaEfectiva(r, "2026-10-20")).toBe(3);
  });
  it("muerta si faltó un día", () => {
    expect(rachaEfectiva(r, "2026-10-21")).toBe(0);
  });
});
