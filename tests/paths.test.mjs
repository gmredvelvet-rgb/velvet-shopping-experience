// Foundry solo sirve lo que hay dentro de su carpeta de datos. Una ruta del
// disco duro nunca cargara, por mucho que el archivo exista: antes eso fallaba
// en silencio y el fondo simplemente no aparecia.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

const avisos = [];
globalThis.foundry = { utils: { getProperty, randomID: () => "x", debounce: (f) => f, getRoute: (p) => "/" + p.replace(/^\/+/, "") } };
globalThis.Application = class { constructor(o = {}) { this.options = o; } };
globalThis.CONFIG = { Item: { typeLabels: {} } };
globalThis.ui = { notifications: { error: (m) => avisos.push(m), warn() {} } };

const SETTINGS = { cellSize: 76, portraitSize: 168, pileCols: 10, pileRows: 6, backgroundImage: "" };
globalThis.game = {
  system: { id: "dnd5e" },
  user: { isGM: true },
  settings: { get: (m, k) => SETTINGS[k] },
  i18n: { localize: (k) => k, format: (k, d) => `${k}:${d.path}` },
  itempiles: { API: {} }
};

const { GridPileApp } = await import("../scripts/app.js");

let fallos = 0;
const check = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`  ${bien ? "ok  " : "FAIL"} ${nombre} -> ${JSON.stringify(real)}${bien ? "" : " (esperado " + JSON.stringify(esperado) + ")"}`);
};

/** Crea una pila con ese fondo y devuelve lo que el modulo acaba usando. */
function fondo(ruta) {
  const pile = {
    uuid: "Actor.p", name: "Tienda", flags: { "velvet-shopping-experience": { background: ruta } },
    getFlag: (scope, key) => (scope === "velvet-shopping-experience" ? { background: ruta }[key] : undefined),
    items: { get: () => undefined }
  };
  return new GridPileApp(pile, null, { id: "t" }).background;
}

console.log("");
console.log("Rutas del disco: se rechazan y se avisa");
check("Windows con barra invertida", fondo("C:\\Users\\cesar\\Downloads\\fodno.png"), "");
check("Windows con barra normal", fondo("C:/Users/cesar/Downloads/fodno.png"), "");
check("minuscula y otra unidad", fondo("d:\\arte\\fondo.png"), "");
check("URL de archivo", fondo("file:///C:/arte/fondo.png"), "");
check("recurso de red", fondo("\\\\servidor\\arte\\fondo.png"), "");
check("recurso de red con barras", fondo("//servidor/arte/fondo.png"), "");

console.log("");
console.log(`  ${avisos.length >= 6 ? "ok  " : "FAIL"} se avisa al GM en cada caso (${avisos.length} avisos)`);
if (avisos.length < 6) fallos++;
const explica = avisos.every((m) => m.startsWith("VSE.Warn.AbsolutePath"));
console.log(`  ${explica ? "ok  " : "FAIL"} el aviso explica el motivo`);
if (!explica) fallos++;

console.log("");
console.log("Rutas de la carpeta de datos: se aceptan");
check("carpeta suelta", fondo("vse-backgrounds/fodno.png"), "vse-backgrounds/fodno.png");
check("dentro de un mundo", fondo("worlds/mi-mundo/tienda.webp"), "worlds/mi-mundo/tienda.webp");
check("dentro de un modulo", fondo("modules/x/assets/a.png"), "modules/x/assets/a.png");
check("con espacios", fondo("arte de tiendas/herreria.png"), "arte de tiendas/herreria.png");
check("barras invertidas de un copiar y pegar", fondo("worlds\\mundo\\f.png"), "worlds/mundo/f.png");
check("vacio", fondo(""), "");

console.log("");
console.log("El ajuste de mundo se usa cuando la tienda no tiene fondo propio");
SETTINGS.backgroundImage = "vse-backgrounds/general.webp";
check("hereda del mundo", fondo(""), "vse-backgrounds/general.webp");
SETTINGS.backgroundImage = "C:\\ruta\\mala.png";
check("y tambien se valida", fondo(""), "");

console.log("");

// El fondo se aplica con setProperty, no dentro del atributo style: un
// `url("...")` ahi dentro cierra el atributo con sus propias comillas y anula
// la variable entera. La prueba anterior solo miraba si el texto aparecia, y
// pasaba con el marcado roto.
console.log("");
console.log("El marcado no puede llevar la url dentro del atributo style");
{
  const pile = {
    uuid: "Actor.p", name: "Tienda", img: "t.webp",
    getFlag: (scope, key) => (scope === "velvet-shopping-experience"
      ? { background: "vse-backgrounds/fodno.png" }[key]
      : undefined),
    items: { get: () => undefined }
  };
  game.itempiles.API = {
    getActorItems: () => [],
    getActorCurrencies: () => [],
    getActorFlagData: () => ({ type: "merchant" }),
    isItemPileMerchant: () => true,
    isItemPileVault: () => false,
    getItemQuantity: () => 1
  };
  Object.assign(SETTINGS, {
    actorCols: 10, actorRows: 6, bulkyItems: true, strictByDefault: false,
    showLabels: true, gridForMerchants: true
  });

  const app = new GridPileApp(pile, null, { id: "t" });
  const html = await app._renderHTML();

  const atributos = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  const sinUrl = atributos.every((valor) => !valor.includes("url("));
  if (!sinUrl) fallos++;
  console.log(`  ${sinUrl ? "ok  " : "FAIL"} ningun style="" contiene url()`);

  // Cada atributo debe cerrar donde le toca: si una comilla partiera el
  // marcado, el troceado dejaria valores con basura de HTML dentro.
  const bienFormado = atributos.every((valor) => !valor.includes("<") && !valor.includes(">"));
  if (!bienFormado) fallos++;
  console.log(`  ${bienFormado ? "ok  " : "FAIL"} los atributos style cierran bien`);

  // Y la ruta sigue llegando, pero por la via correcta.
  // El decorado es una <img> real, con ruta absoluta desde la raiz.
  const capa = html.match(/<img class="vse-scene-layer" src="([^"]+)"/);
  const ok2 = capa?.[1] === "/vse-backgrounds/fodno.png";
  if (!ok2) fallos++;
  console.log(`  ${ok2 ? "ok  " : "FAIL"} capa de imagen en el DOM -> ${capa?.[1]}`);

  const absoluta = capa?.[1]?.startsWith("/");
  if (!absoluta) fallos++;
  console.log(`  ${absoluta ? "ok  " : "FAIL"} la ruta pasa por getRoute`);

  const conClase = html.includes("has-scene");
  if (!conClase) fallos++;
  console.log(`  ${conClase ? "ok  " : "FAIL"} la clase has-scene se pone`);
}

console.log("");
console.log(fallos ? fallos + " FALLOS" : "Las rutas se validan bien");
process.exit(fallos ? 1 : 0);
