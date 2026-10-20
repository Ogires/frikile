// Frikile — cliente vanilla. El servidor es autoritativo: aquí solo se pinta lo que dice la API.
const $ = (sel) => document.querySelector(sel);
const MAX_INTENTOS = 6;
const FILAS_TECLADO = ["QWERTYUIOP", "ASDFGHJKLÑ", "⏎ZXCVBNM⌫"];
const PRIORIDAD = { gris: 1, amarillo: 2, verde: 3 };
const EMOJI = { verde: "🟩", amarillo: "🟨", gris: "⬛" };
const NOMBRE_COLOR = { verde: "en su sitio", amarillo: "en otra posición", gris: "no está" };
const ALIAS_VALIDO = /^[\p{L}\p{N}_]{3,16}$/u;
const GIRO_MS = 300; // retraso entre casillas al revelar

const estado = {
  jugador: null,
  numero: null,
  longitud: 5,
  categoria: "",
  intentos: [], // [{ palabra, colores }]
  fin: "jugando",
  pistas: [],
  palabra: null,
  definicion: null,
  actual: "",
  enviando: false,
  bloqueoHasta: 0,
};

// ───── Storage tolerante (modo privado / bloqueado → valores de sesión) ─────
const memoria = {};
function leer(clave) {
  try { return localStorage.getItem(clave); } catch { return memoria[clave] ?? null; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { memoria[clave] = valor; }
}
function borrar(clave) {
  try { localStorage.removeItem(clave); } catch { delete memoria[clave]; }
}

function nuevoUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function obtenerJugador() {
  let id = leer("frikile:jugador");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = nuevoUuid();
    guardar("frikile:jugador", id);
  }
  return id;
}

function regenerarJugador() {
  borrar("frikile:jugador");
  borrar("frikile:alias");
  estado.jugador = obtenerJugador();
}

function aliasActual() {
  return leer("frikile:alias") || `Padawan-${estado.jugador.slice(0, 4).toUpperCase()}`;
}

// ───── Toasts ─────
function toast(texto, tipo = "", ms = 2200) {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  $("#toasts").append(el);
  if (ms > 0) {
    setTimeout(() => {
      el.classList.add("fuera");
      setTimeout(() => el.remove(), 300);
    }, ms);
  }
  return el;
}

// ───── Construcción de tablero y teclado ─────
function construirTablero() {
  const tablero = $("#tablero");
  tablero.replaceChildren();
  document.documentElement.style.setProperty("--cols", estado.longitud);
  for (let f = 0; f < MAX_INTENTOS; f++) {
    const fila = document.createElement("div");
    fila.className = "fila";
    fila.setAttribute("role", "row");
    for (let c = 0; c < estado.longitud; c++) {
      const casilla = document.createElement("div");
      casilla.className = "casilla";
      casilla.setAttribute("role", "gridcell");
      fila.append(casilla);
    }
    tablero.append(fila);
  }
}

function construirTeclado() {
  const teclado = $("#teclado");
  teclado.replaceChildren();
  for (const fila of FILAS_TECLADO) {
    const div = document.createElement("div");
    div.className = "teclado-fila";
    for (const letra of fila) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tecla";
      if (letra === "⏎") {
        b.textContent = "ENVIAR";
        b.dataset.accion = "enviar";
        b.classList.add("ancha");
      } else if (letra === "⌫") {
        b.textContent = "⌫";
        b.dataset.accion = "borrar";
        b.classList.add("ancha");
        b.setAttribute("aria-label", "Borrar");
      } else {
        b.textContent = letra;
        b.dataset.letra = letra;
      }
      div.append(b);
    }
    teclado.append(div);
  }
}

function filaEl(i) {
  return $("#tablero").children[i];
}

function pintarFila(i, palabra, colores) {
  const fila = filaEl(i);
  if (!fila) return;
  [...fila.children].forEach((casilla, c) => {
    const letra = palabra[c] ?? "";
    casilla.textContent = letra;
    if (colores) {
      casilla.dataset.color = colores[c];
      casilla.removeAttribute("data-estado");
      casilla.setAttribute("aria-label", `${letra}, ${NOMBRE_COLOR[colores[c]]}`);
    } else {
      casilla.removeAttribute("data-color");
      if (letra) casilla.dataset.estado = "lleno";
      else casilla.removeAttribute("data-estado");
      casilla.removeAttribute("aria-label");
    }
  });
}

function marcarFilaActiva() {
  [...$("#tablero").children].forEach((f, i) =>
    f.classList.toggle("activa", estado.fin === "jugando" && i === estado.intentos.length)
  );
}

function pintarTeclado() {
  const mejor = {};
  for (const { palabra, colores } of estado.intentos) {
    [...palabra].forEach((l, i) => {
      if ((PRIORIDAD[colores[i]] ?? 0) > (PRIORIDAD[mejor[l]] ?? 0)) mejor[l] = colores[i];
    });
  }
  for (const b of document.querySelectorAll(".tecla[data-letra]")) {
    const c = mejor[b.dataset.letra];
    if (c) {
      b.dataset.color = c;
      b.setAttribute("aria-label", `${b.dataset.letra}, ${NOMBRE_COLOR[c]}`);
    } else {
      b.removeAttribute("data-color");
      b.removeAttribute("aria-label");
    }
  }
}

function pintarPistas() {
  const panel = $("#oraculo");
  const lista = $("#pistas");
  if (!estado.pistas.length) {
    panel.hidden = true;
    return;
  }
  if (lista.children.length !== estado.pistas.length) {
    lista.replaceChildren(
      ...estado.pistas.map((p) => {
        const li = document.createElement("li");
        li.textContent = p;
        return li;
      })
    );
  }
  panel.hidden = false;
}

function pintarTodo() {
  $("#numero").textContent = estado.numero ?? "--";
  $("#categoria").textContent = `> ${estado.categoria} · ${estado.longitud} letras`;
  construirTablero();
  estado.intentos.forEach((x, i) => pintarFila(i, x.palabra, x.colores));
  if (estado.fin === "jugando") pintarFila(estado.intentos.length, estado.actual);
  marcarFilaActiva();
  pintarTeclado();
  pintarPistas();
}

// ───── Animaciones ─────
function revelarFila(i, palabra, colores) {
  return new Promise((resolve) => {
    const casillas = [...filaEl(i).children];
    casillas.forEach((casilla, c) => {
      setTimeout(() => {
        casilla.classList.add("gira");
        setTimeout(() => {
          casilla.textContent = palabra[c];
          casilla.dataset.color = colores[c];
          casilla.removeAttribute("data-estado");
          casilla.setAttribute("aria-label", `${palabra[c]}, ${NOMBRE_COLOR[colores[c]]}`);
        }, 250);
        setTimeout(() => casilla.classList.remove("gira"), 520);
      }, c * GIRO_MS);
    });
    setTimeout(resolve, (casillas.length - 1) * GIRO_MS + 560);
  });
}

function celebrar(i) {
  [...filaEl(i).children].forEach((casilla, c) => {
    setTimeout(() => {
      casilla.classList.add("salta");
      setTimeout(() => casilla.classList.remove("salta"), 520);
    }, c * 90);
  });
}

function temblar(i) {
  const fila = filaEl(i);
  if (!fila) return;
  fila.classList.remove("tiembla");
  void fila.offsetWidth; // reinicia la animación
  fila.classList.add("tiembla");
  setTimeout(() => fila.classList.remove("tiembla"), 500);
}

// ───── API ─────
async function api(ruta, opciones) {
  const r = await fetch(ruta, opciones);
  let datos = null;
  try { datos = await r.json(); } catch { /* 404 de texto o cuerpo vacío */ }
  return { status: r.status, datos: datos ?? {} };
}

function postJson(ruta, cuerpo) {
  return api(ruta, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

function mantenimiento(activo) {
  $("#mantenimiento").hidden = !activo;
  $("#app").inert = activo;
}

function aplicarPartida(p) {
  estado.intentos = p?.intentos ?? [];
  estado.fin = p?.estado ?? "jugando";
  estado.pistas = p?.pistas ?? [];
  estado.palabra = p?.palabra ?? null;
  estado.definicion = p?.definicion ?? null;
}

async function cargar({ silencioso = false } = {}) {
  try {
    const { status, datos } = await api(`/api/hoy?jugador=${encodeURIComponent(estado.jugador)}`);
    if (status === 400 && datos.error === "jugador") {
      regenerarJugador();
      return cargar({ silencioso });
    }
    if (status !== 200) throw new Error(`hoy ${status}`);
    mantenimiento(false);
    const cambioDeDia = estado.numero !== null && estado.numero !== datos.numero;
    if (cambioDeDia || estado.longitud !== datos.longitud) estado.actual = "";
    estado.numero = datos.numero;
    estado.longitud = datos.longitud;
    estado.categoria = datos.categoria;
    // El alias vive en D1: si se borró el localStorage, se recupera de ahí
    if (datos.alias) guardar("frikile:alias", datos.alias);
    aplicarPartida(datos.partida);
    estado.actual = estado.actual.slice(0, estado.longitud);
    pintarTodo();
    if (estado.fin !== "jugando" && !silencioso) setTimeout(abrirFinal, 400);
  } catch (err) {
    console.warn("Frikile: sin conexión con el Oráculo", err);
    mantenimiento(true);
  }
}

function nuevoDia() {
  toast("Nuevo Frikile disponible", "aviso", 1800);
  estado.bloqueoHasta = Date.now() + 5000;
  setTimeout(() => location.reload(), 1600);
}

async function enviar() {
  if (!puedeJugar()) return;
  const fila = estado.intentos.length;
  if (estado.actual.length !== estado.longitud) {
    temblar(fila);
    toast(`Faltan letras: son ${estado.longitud}`);
    return;
  }
  estado.enviando = true;
  $("#teclado").classList.add("bloqueado");
  try {
    const { status, datos } = await postJson("/api/intento", { jugador: estado.jugador, intento: estado.actual });

    if (datos.numero !== undefined && estado.numero !== null && datos.numero !== estado.numero) return nuevoDia();

    if (status === 200) {
      const palabra = datos.intentos.at(-1).palabra;
      await revelarFila(fila, palabra, datos.colores);
      estado.actual = "";
      aplicarPartida(datos);
      pintarTeclado();
      pintarPistas();
      marcarFilaActiva();
      if (estado.fin === "jugando") {
        pintarFila(estado.intentos.length, "");
        const fallos = estado.intentos.length;
        if (estado.pistas.length && (fallos === 3 || fallos === 5)) toast("🔮 El Oráculo ha hablado", "aviso");
      } else {
        if (estado.fin === "ganada") {
          celebrar(fila);
          toast(["¡Crítico!", "¡Épico!", "¡Legendario!", "¡Bien jugado!", "¡Por los pelos!", "¡Uf!"][fila] ?? "¡Bien!", "", 1800);
        } else {
          toast(estado.palabra ?? "Game over", "error", 2500);
        }
        setTimeout(abrirFinal, 1500);
      }
      return;
    }
    if (status === 400 && datos.error === "invalido") {
      temblar(fila);
      toast("Eso no existe ni en klingon", "error");
      return;
    }
    if (status === 400 && datos.error === "jugador") {
      regenerarJugador();
      estado.actual = "";
      return cargar();
    }
    if (status === 409) {
      if (datos.error === "terminada") return cargar();
      return cargar({ silencioso: true });
    }
    if (status === 429) return nazgul(datos.segundos ?? 60);
    throw new Error(`intento ${status}`);
  } catch (err) {
    console.warn("Frikile: el intento no llegó", err);
    mantenimiento(true);
  } finally {
    estado.enviando = false;
    if (Date.now() >= estado.bloqueoHasta) $("#teclado").classList.remove("bloqueado");
  }
}

function nazgul(segundos) {
  const fin = Date.now() + segundos * 1000;
  estado.bloqueoHasta = Math.max(estado.bloqueoHasta, fin);
  $("#teclado").classList.add("bloqueado");
  const el = toast("", "error", 0);
  const tic = () => {
    const resta = Math.ceil((fin - Date.now()) / 1000);
    if (resta <= 0) {
      clearInterval(t);
      el.remove();
      if (Date.now() >= estado.bloqueoHasta) $("#teclado").classList.remove("bloqueado");
      return;
    }
    el.textContent = `Los Nazgûl vigilan esta IP. Vuelve en ${resta}s`;
  };
  const t = setInterval(tic, 250);
  tic();
}

// ───── Entrada ─────
function puedeJugar() {
  return (
    estado.numero !== null &&
    estado.fin === "jugando" &&
    !estado.enviando &&
    Date.now() >= estado.bloqueoHasta &&
    !document.querySelector("dialog[open]")
  );
}

function teclear(letra) {
  if (!puedeJugar() || estado.actual.length >= estado.longitud) return;
  estado.actual += letra;
  pintarFila(estado.intentos.length, estado.actual);
}

function borrarLetra() {
  if (!puedeJugar() || !estado.actual) return;
  estado.actual = estado.actual.slice(0, -1);
  pintarFila(estado.intentos.length, estado.actual);
}

function normalizarTecla(k) {
  if (k.length !== 1) return null;
  const up = k.toUpperCase();
  if (up === "Ñ") return "Ñ";
  const base = up.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /^[A-Z]$/.test(base) ? base : null;
}

$("#teclado").addEventListener("click", (e) => {
  const b = e.target.closest(".tecla");
  if (!b) return;
  if (b.dataset.accion === "enviar") enviar();
  else if (b.dataset.accion === "borrar") borrarLetra();
  else teclear(b.dataset.letra);
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, textarea, dialog")) return;
  if (e.key === "Enter") {
    e.preventDefault();
    enviar();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    borrarLetra();
  } else {
    const l = normalizarTecla(e.key);
    if (l) teclear(l);
    else return;
  }
  const b = e.key === "Enter"
    ? document.querySelector('[data-accion="enviar"]')
    : e.key === "Backspace"
      ? document.querySelector('[data-accion="borrar"]')
      : document.querySelector(`[data-letra="${normalizarTecla(e.key)}"]`);
  if (b) {
    b.classList.add("pulsada");
    setTimeout(() => b.classList.remove("pulsada"), 90);
  }
});

// ───── Modales ─────
function abrir(dialogo) {
  for (const d of document.querySelectorAll("dialog[open]")) if (d !== dialogo) d.close();
  if (!dialogo.open) dialogo.showModal();
  // Foco en el título: lectores de pantalla lo anuncian y no aparece un anillo de foco en la ✕
  dialogo.querySelector("h2")?.focus({ preventScroll: true });
}

for (const d of document.querySelectorAll("dialog")) {
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
  });
}

$("#btn-ayuda").addEventListener("click", () => abrir($("#modal-ayuda")));
$("#btn-ranking").addEventListener("click", () => {
  const d = $("#modal-ranking");
  abrir(d);
  cargarRanking(d.querySelector("[data-ranking]"), "hoy");
});
$("#btn-reintentar").addEventListener("click", () => cargar());

function textoCompartir() {
  const emoji = estado.categoria.split(/\s/)[0] || "🤓";
  const marcador = estado.fin === "ganada" ? estado.intentos.length : "X";
  const grid = estado.intentos.map((x) => x.colores.map((c) => EMOJI[c]).join("")).join("\n");
  return `Frikile #${estado.numero} ${marcador}/${MAX_INTENTOS} ${emoji}\n${grid}\nfrikile.webninja.fyi`;
}

function abrirFinal() {
  const d = $("#modal-final");
  const gano = estado.fin === "ganada";
  const titulo = $("#final-titulo");
  titulo.textContent = gano ? "¡VICTORIA!" : "GAME OVER";
  titulo.className = `final-titulo ${gano ? "ganada" : "perdida"}`;
  $("#final-sub").textContent = gano
    ? `Frikile #${estado.numero} en ${estado.intentos.length}/${MAX_INTENTOS}`
    : `Frikile #${estado.numero} · la Fuerza no te acompañó hoy`;
  $("#palabra-final").textContent = estado.palabra ?? "";
  $("#definicion").textContent = estado.definicion ?? "";
  $("#compartir-preview").textContent = textoCompartir();
  const input = $("#input-alias");
  input.value = aliasActual();
  input.removeAttribute("aria-invalid");
  abrir(d);
  arrancarCuentaAtras();
  cargarRanking(d.querySelector("[data-ranking]"), "hoy");
}

$("#btn-compartir").addEventListener("click", async (e) => {
  const texto = textoCompartir();
  const boton = e.currentTarget;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = "> ¡COPIADO!";
    toast("Resultado copiado al portapapeles");
  } catch {
    toast("No he podido copiar: selecciona el texto a mano", "error");
  }
  setTimeout(() => (boton.textContent = "> COMPARTIR"), 1800);
});

// Cuenta atrás hasta la medianoche peninsular
const RELOJ_MADRID = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
let temporizador = null;
function segundosHastaMedianoche() {
  const p = Object.fromEntries(RELOJ_MADRID.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return 86400 - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second));
}
function arrancarCuentaAtras() {
  clearInterval(temporizador);
  const tic = () => {
    const s = segundosHastaMedianoche();
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("#cuenta-atras").textContent = `${hh}:${mm}:${ss}`;
    if (s <= 1) {
      clearInterval(temporizador);
      setTimeout(() => location.reload(), 2000);
    }
  };
  tic();
  temporizador = setInterval(tic, 1000);
}

// ───── Alias ─────
$("#form-alias").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#input-alias");
  const alias = input.value.trim();
  if (!ALIAS_VALIDO.test(alias)) {
    input.setAttribute("aria-invalid", "true");
    toast("Alias: 3-16 letras, números o _", "error");
    return;
  }
  try {
    const { status, datos } = await postJson("/api/alias", { jugador: estado.jugador, alias });
    if (status !== 200) throw new Error(`alias ${status}`);
    guardar("frikile:alias", datos.alias);
    input.removeAttribute("aria-invalid");
    toast(`Ahora eres ${datos.alias}`);
    cargarRanking($("#modal-final [data-ranking]"));
  } catch {
    input.setAttribute("aria-invalid", "true");
    toast("El alias no ha colado", "error");
  }
});

// ───── Ranking ─────
function mmss(ms) {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function celda(fila, texto) {
  const td = document.createElement("td");
  td.textContent = texto; // alias de usuarios: SIEMPRE textContent, nunca innerHTML
  fila.append(td);
}

async function cargarRanking(contenedor, tipo) {
  if (!contenedor.firstElementChild) {
    contenedor.append($("#tpl-ranking").content.cloneNode(true));
    contenedor.querySelector(".pestanas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tipo]");
      if (b) cargarRanking(contenedor, b.dataset.tipo);
    });
  }
  tipo ??= contenedor.dataset.tipo ?? "hoy";
  contenedor.dataset.tipo = tipo;
  for (const b of contenedor.querySelectorAll("[data-tipo]")) b.setAttribute("aria-selected", String(b.dataset.tipo === tipo));

  const cabecera = contenedor.querySelector("thead tr");
  const cuerpo = contenedor.querySelector("tbody");
  const vacio = contenedor.querySelector(".vacio");
  const columnas = tipo === "hoy" ? ["#", "Alias", "Int.", "Tiempo"] : ["#", "Alias", "🔥 Racha", "Máx."];
  cabecera.replaceChildren(...columnas.map((c) => Object.assign(document.createElement("th"), { textContent: c })));
  cuerpo.replaceChildren();
  vacio.hidden = false;
  vacio.textContent = "Cargando high scores…";

  try {
    const { status, datos } = await api(`/api/ranking?tipo=${tipo}`);
    if (status !== 200) throw new Error(`ranking ${status}`);
    if (contenedor.dataset.tipo !== tipo) return; // el usuario ya cambió de pestaña
    const yo = aliasActual();
    for (const [i, f] of datos.filas.entries()) {
      const tr = document.createElement("tr");
      if (f.alias === yo) tr.className = "yo";
      celda(tr, String(i + 1));
      celda(tr, f.alias);
      if (tipo === "hoy") {
        celda(tr, `${f.intentos}/6`);
        celda(tr, mmss(f.duracion_ms));
      } else {
        celda(tr, String(f.racha));
        celda(tr, String(f.max));
      }
      cuerpo.append(tr);
    }
    vacio.hidden = datos.filas.length > 0;
    vacio.textContent = tipo === "hoy" ? "Nadie lo ha sacado aún. ¿Serás el primero?" : "Ninguna racha viva. El trono está libre.";
  } catch {
    vacio.textContent = "El marcador está echando la siesta.";
  }
}

// ───── Arranque ─────
estado.jugador = obtenerJugador();
construirTeclado();
construirTablero();
cargar();
if (!leer("frikile:visto")) {
  guardar("frikile:visto", "1");
  setTimeout(() => { if (!document.querySelector("dialog[open]")) abrir($("#modal-ayuda")); }, 900);
}
