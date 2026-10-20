import { describe, expect, it } from "vitest";
import { diaDeHoy, diasEntre, fechaAnterior, numeroDelDia } from "../src/fechas";

describe("diaDeHoy (Europe/Madrid)", () => {
  it("medianoche en horario de verano (UTC+2)", () => {
    expect(diaDeHoy(Date.UTC(2026, 9, 24, 21, 59))).toBe("2026-10-24");
    expect(diaDeHoy(Date.UTC(2026, 9, 24, 22, 30))).toBe("2026-10-25");
  });
  it("cambio de hora de octubre (pasa a UTC+1)", () => {
    expect(diaDeHoy(Date.UTC(2026, 9, 25, 22, 30))).toBe("2026-10-25");
    expect(diaDeHoy(Date.UTC(2026, 9, 25, 23, 30))).toBe("2026-10-26");
  });
  it("cambio de hora de marzo (pasa a UTC+2)", () => {
    expect(diaDeHoy(Date.UTC(2026, 2, 28, 23, 30))).toBe("2026-03-29");
    expect(diaDeHoy(Date.UTC(2026, 2, 29, 21, 30))).toBe("2026-03-29");
    expect(diaDeHoy(Date.UTC(2026, 2, 29, 22, 30))).toBe("2026-03-30");
  });
});

describe("aritmética de fechas", () => {
  it("fechaAnterior cruza meses y años", () => {
    expect(fechaAnterior("2026-03-01")).toBe("2026-02-28");
    expect(fechaAnterior("2026-01-01")).toBe("2025-12-31");
  });
  it("diasEntre y numeroDelDia", () => {
    expect(diasEntre("2026-10-20", "2026-11-01")).toBe(12);
    expect(numeroDelDia("2026-10-20", "2026-10-20")).toBe(1);
    expect(numeroDelDia("2026-11-01", "2026-10-20")).toBe(13);
  });
});
