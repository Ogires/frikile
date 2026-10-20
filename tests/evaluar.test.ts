import { describe, expect, it } from "vitest";
import { evaluar } from "../src/evaluar";

const V = "verde", A = "amarillo", G = "gris";

describe("evaluar", () => {
  it("acierto total", () => {
    expect(evaluar("CHOCOBO", "CHOCOBO")).toEqual([V, V, V, V, V, V, V]);
  });
  it("letras repetidas: solo cuentan las que existen", () => {
    expect(evaluar("OOOOOOO", "CHOCOBO")).toEqual([G, G, V, G, V, G, V]);
    expect(evaluar("GGGGG", "GROGU")).toEqual([V, G, G, V, G]);
  });
  it("amarillos consumen ocurrencias restantes", () => {
    expect(evaluar("GGOOO", "GROGU")).toEqual([V, A, V, G, G]);
    expect(evaluar("UGRGO", "GROGU")).toEqual([A, A, A, V, A]);
  });
});
