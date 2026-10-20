import { describe, expect, it } from "vitest";
import ejemplo from "../data/palabras.ejemplo.json";
import { normalizarPalabra, validarCatalogo } from "../scripts/validar-catalogo.mjs";
import { normalizar } from "../src/texto";
import { pistaRevela } from "../src/pistas";

const ok = {
  palabra: "GROGU",
  categoria: "🎬 Cine y series",
  definicion: "Bebé verde.",
  pista_reserva: "Pequeño y con la fuerza.",
};

describe("validarCatalogo", () => {
  it("el catálogo de ejemplo no tiene errores", () => {
    expect(validarCatalogo(ejemplo)).toEqual([]);
  });

  it("acepta una entrada correcta", () => {
    expect(validarCatalogo([ok])).toEqual([]);
  });

  it("rechaza algo que no es un array", () => {
    expect(validarCatalogo({} as unknown as never[])).toHaveLength(1);
  });

  it.each(["GROG", "SUPERLARGA", "grogu", "PIKACHÚ", "R2D2X", "HAN SOLO"])("rechaza la palabra %s", (palabra) => {
    const errores = validarCatalogo([{ ...ok, palabra }]);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain(palabra);
  });

  it("acepta la Ñ", () => {
    expect(validarCatalogo([{ ...ok, palabra: "ÑANDUS" }])).toEqual([]);
  });

  it("detecta duplicados", () => {
    const errores = validarCatalogo([ok, { ...ok }]);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/duplicad/i);
  });

  it.each(["categoria", "definicion", "pista_reserva"] as const)("exige %s no vacío", (campo) => {
    expect(validarCatalogo([{ ...ok, [campo]: "  " }])).toHaveLength(1);
    const { [campo]: _, ...sin } = ok;
    expect(validarCatalogo([sin as typeof ok])).toHaveLength(1);
  });

  it("rechaza pistas que revelan la palabra o sus 4 primeras letras (con tildes y minúsculas)", () => {
    expect(validarCatalogo([{ ...ok, pista_reserva: "Es grogu, claro" }])).toHaveLength(1);
    expect(validarCatalogo([{ ...ok, pista_reserva: "Un grog bien frío" }])).toHaveLength(1);
    expect(validarCatalogo([{ ...ok, palabra: "PADAWAN", pista_reserva: "Pádawán" }])).toHaveLength(1);
  });

  it("aplica la misma regla que pistaRevela del Worker", () => {
    for (const e of ejemplo) expect(pistaRevela(e.pista_reserva, e.palabra)).toBe(false);
    expect(pistaRevela("Es grogu", "GROGU")).toBe(true);
  });

  it("devuelve un error por cada problema, indicando la posición (base 1)", () => {
    const errores = validarCatalogo([ok, { ...ok, palabra: "X", definicion: "" }]);
    expect(errores).toHaveLength(2);
    expect(errores.every((e) => e.startsWith("#2"))).toBe(true);
  });
});

describe("normalizarPalabra", () => {
  it("coincide con normalizar del Worker", () => {
    for (const s of ["  pikachú ", "Ñandú", "àéîõü", "Gandalf"]) expect(normalizarPalabra(s)).toBe(normalizar(s));
  });
});
