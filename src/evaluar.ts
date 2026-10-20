export type Color = "verde" | "amarillo" | "gris";

// Dos pasadas: primero verdes; luego amarillos solo mientras queden ocurrencias libres
export function evaluar(intento: string, solucion: string): Color[] {
  const colores: Color[] = Array.from({ length: intento.length }, () => "gris");
  const restantes = new Map<string, number>();
  for (let i = 0; i < solucion.length; i++) {
    if (intento[i] === solucion[i]) colores[i] = "verde";
    else restantes.set(solucion[i], (restantes.get(solucion[i]) ?? 0) + 1);
  }
  for (let i = 0; i < intento.length; i++) {
    if (colores[i] === "verde") continue;
    const libres = restantes.get(intento[i]) ?? 0;
    if (libres > 0) {
      colores[i] = "amarillo";
      restantes.set(intento[i], libres - 1);
    }
  }
  return colores;
}
