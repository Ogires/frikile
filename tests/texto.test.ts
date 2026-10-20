import { describe, expect, it } from "vitest";
import { esIntentoValido, normalizar } from "../src/texto";

describe("normalizar", () => {
  it("mayúsculas y sin tildes", () => {
    expect(normalizar("  pokémon ")).toBe("POKEMON");
    expect(normalizar("pingüino")).toBe("PINGUINO");
  });
  it("la Ñ es letra propia", () => {
    expect(normalizar("ñandú")).toBe("ÑANDU");
  });
});

describe("esIntentoValido", () => {
  it("exige longitud exacta y solo letras A-Z/Ñ", () => {
    expect(esIntentoValido("GROGU", 5)).toBe(true);
    expect(esIntentoValido("ÑANDU", 5)).toBe(true);
    expect(esIntentoValido("GROG", 5)).toBe(false);
    expect(esIntentoValido("GR0GU", 5)).toBe(false);
    expect(esIntentoValido("GRO U", 5)).toBe(false);
  });
});
