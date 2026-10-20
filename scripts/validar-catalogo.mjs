// scripts/validar-catalogo.mjs — validación del catálogo compartida por seed.mjs, catalogo.mjs y los tests.
// JS plano (sin TS) para que Node lo ejecute sin build; tipos en validar-catalogo.d.mts.

// Copia de normalizar() de src/texto.ts (un test garantiza que siguen iguales)
export function normalizarPalabra(s) {
  return String(s).trim().toUpperCase().normalize("NFD").replace(/Ñ/g, "Ñ").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

// Misma regla que pistaRevela() de src/pistas.ts
function pistaRevela(pista, palabra) {
  const texto = normalizarPalabra(pista);
  return texto.includes(palabra) || texto.includes(palabra.slice(0, 4));
}

const vacio = (v) => typeof v !== "string" || !v.trim();

export function validarCatalogo(entradas) {
  if (!Array.isArray(entradas)) return ["El catálogo debe ser un array JSON"];
  const errores = [];
  const vistas = new Set();
  entradas.forEach((e, i) => {
    const pos = `#${i + 1}`;
    if (!e || typeof e !== "object") {
      errores.push(`${pos}: la entrada no es un objeto`);
      return;
    }
    const palabra = typeof e.palabra === "string" ? e.palabra : "";
    const id = `${pos} (${palabra || "sin palabra"})`;
    if (!/^[A-ZÑ]{5,8}$/.test(palabra) || normalizarPalabra(palabra) !== palabra) {
      errores.push(`${id}: palabra inválida "${palabra}" (5-8 letras A-Z/Ñ, mayúsculas y sin tildes)`);
    } else if (vistas.has(palabra)) {
      errores.push(`${id}: palabra duplicada`);
    }
    vistas.add(palabra);
    for (const campo of ["categoria", "definicion", "pista_reserva"]) {
      if (vacio(e[campo])) errores.push(`${id}: falta ${campo}`);
    }
    if (palabra && !vacio(e.pista_reserva) && pistaRevela(e.pista_reserva, palabra)) {
      errores.push(`${id}: pista_reserva revela la palabra`);
    }
  });
  return errores;
}
