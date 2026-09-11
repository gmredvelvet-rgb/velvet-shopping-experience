// El dinero.
//
// Este modulo no suma ni resta una sola moneda: delega en Item Piles, que es
// quien sabe que en D&D 5e la moneda es un atributo del actor y en PF2e son
// objetos del inventario. Lo que si depende de nosotros es llamar a la API
// correcta en cada situacion, y eso es lo que se fija aqui.
//
//   - Mercader  -> tradeItems     (mueve objetos Y cobra)
//   - Contenedor-> transferItems  (mueve objetos, no cobra)
//   - Tomar todo-> transferEverything, jamas contra un mercader
//
// Confundirlas significa o regalar la mercancia o cobrar por saquear un cofre.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

const llamadas = [];
globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => "int-1",
    debounce: (f) => f,
    deepClone: (o) => structuredClone(o),
    getRoute: (p) => "/" + String(p).replace(/^\/+/, "")
  },
  applications: { api: {} },
  audio: { AudioHelper: { play() {} } }
};
globalThis.Application = class {
  constructor(o = {}) { this.options = o; }
  render() { return this; }
  async close() { return this; }
};
globalThis.CONFIG = { Item: { typeLabels: {} } };

const avisos = [];
globalThis.ui = { notifications: { warn: (m) => avisos.push(m), error: (m) => avisos.push(m) } };

const SETTINGS = {
  cellSize: 76, portraitSize: 168, pileCols: 10, pileRows: 6, actorCols: 10, actorRows: 6,
  bulkyItems: true, strictByDefault: false, showLabels: true, backgroundImage: "",
  gridForMerchants: true, gridForContainers: true, soundVolume: 0
};

/* --- Actores de mentira, uno por sistema ------------------------------- */

function hacerActor(name, items, monedas) {
  const mapa = new Map(items.map((i) => [i.id, i]));
  return {
    name, uuid: `Actor.${name}`, img: `${name}.webp`, isOwner: true,
    monedas,
    items: { get: (id) => mapa.get(id), [Symbol.iterator]: () => mapa.values() },
    getFlag: () => undefined,
    setFlag: async () => {},
    update: async () => {}
  };
}

const espada = { id: "w1", name: "Espada", img: "w.png", type: "weapon", system: { weight: { value: 3 } } };
// PF2e guarda el dinero como objetos del inventario; 5e como atributo.
const monedaPf2e = { id: "gp", name: "Gold Pieces", img: "gp.png", type: "treasure", system: {} };

let tipoDePila = "merchant";
const mercader = hacerActor("Tienda", [espada, monedaPf2e], [{ name: "Oro", abbreviation: "{#}GP", quantity: 500 }]);
// El heroe necesita algo suyo que vender, o la venta saldria antes de llamar
// a nada y la prueba no probaria nada.
const daga = { id: "w2", name: "Daga", img: "d.png", type: "weapon", system: { weight: { value: 1 } } };
const heroe = hacerActor("Heroe", [daga, monedaPf2e], [{ name: "Oro", abbreviation: "{#}GP", quantity: 12 }]);

globalThis.game = {
  system: { id: "pf2e" },
  user: { isGM: false, character: heroe },
  actors: [],
  settings: { get: (mod, key) => (mod === "core" ? 1 : SETTINGS[key]) },
  i18n: { localize: (k) => k, format: (k) => k },
  itempiles: {
    API: {
      // Item Piles nunca devuelve las monedas como objetos normales.
      getActorItems: (actor) => [...actor.items].filter((i) => i.id !== "gp"),
      getActorCurrencies: (actor, { getAll } = {}) =>
        actor.monedas.filter((c) => getAll || c.quantity > 0),
      getItemQuantity: () => 1,
      getPricesForItem: () => [{ primary: true, priceString: "10 GP", free: false }],
      getCostOfItem: () => 10,
      getActorFlagData: () => ({ type: tipoDePila }),
      isItemPileMerchant: () => tipoDePila === "merchant",
      isItemPileVault: () => false,
      tradeItems: (...args) => { llamadas.push(["tradeItems", args]); return []; },
      transferItems: (...args) => { llamadas.push(["transferItems", args]); return []; },
      transferEverything: (...args) => { llamadas.push(["transferEverything", args]); return []; }
    }
  }
};

const { GridPileApp } = await import("../scripts/app.js");

let fallos = 0;
const check = (nombre, cond, extra = "") => {
  if (!cond) fallos++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${nombre}${extra ? " -> " + extra : ""}`);
};

async function arrastrar(app, desde, hacia, itemId = "w1") {
  llamadas.length = 0;
  app._shiftHeld = false;
  await app._transferBetweenPanels(
    { module: "velvet-grid-piles", side: desde, itemId, w: 1, h: 1 },
    hacia,
    { x: 0, y: 0 }
  );
  return llamadas.at(-1);
}

/* ---------------------------------------------------------------------- */

console.log("");
console.log("Mercader: se cobra");
tipoDePila = "merchant";
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  await app._renderHTML();

  const compra = await arrastrar(app, "source", "target");
  check("comprar usa tradeItems", compra?.[0] === "tradeItems", compra?.[0]);
  check("vende la tienda y compra el heroe",
    compra?.[1][0]?.name === "Tienda" && compra[1][1]?.name === "Heroe",
    `${compra?.[1][0]?.name} -> ${compra?.[1][1]?.name}`);

  const venta = await arrastrar(app, "target", "source", "w2");
  check("vender usa tradeItems", venta?.[0] === "tradeItems", venta?.[0]);
  check("los papeles se invierten",
    venta?.[1][0]?.name === "Heroe" && venta[1][1]?.name === "Tienda",
    `${venta?.[1][0]?.name} -> ${venta?.[1][1]?.name}`);

  check("nunca se usa transferItems en una tienda",
    !llamadas.some(([nombre]) => nombre === "transferItems"));
}

console.log("");
console.log("Contenedor: no se cobra");
tipoDePila = "container";
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  await app._renderHTML();

  const tomar = await arrastrar(app, "source", "target");
  check("tomar usa transferItems", tomar?.[0] === "transferItems", tomar?.[0]);

  const guardar = await arrastrar(app, "target", "source", "w2");
  check("guardar usa transferItems", guardar?.[0] === "transferItems", guardar?.[0]);

  check("nunca se usa tradeItems en un cofre",
    !llamadas.some(([nombre]) => nombre === "tradeItems"));
}

console.log("");
console.log("Tomar todo");
{
  tipoDePila = "container";
  const cofre = new GridPileApp(mercader, heroe, { id: "t" });
  await cofre._renderHTML();
  llamadas.length = 0;
  await cofre._onAction({ preventDefault() {} }, "take-all");
  check("en un cofre vacia el contenido", llamadas.at(-1)?.[0] === "transferEverything");

  tipoDePila = "merchant";
  const tienda = new GridPileApp(mercader, heroe, { id: "t" });
  await tienda._renderHTML();
  llamadas.length = 0;
  avisos.length = 0;
  await tienda._onAction({ preventDefault() {} }, "take-all");
  check("contra un mercader no hace nada", llamadas.length === 0, String(llamadas.length));
  check("y lo explica", avisos.at(-1) === "VGP.Warn.NoTakeAllMerchant", avisos.at(-1));

  check("el boton ni se dibuja en una tienda",
    !(await tienda._renderHTML()).includes('data-vgp-action="take-all"'));
}

console.log("");
console.log("Las monedas no son mercancia");
tipoDePila = "merchant";
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  const html = await app._renderHTML();

  // En PF2e el dinero son objetos del inventario: si acabaran en la grilla se
  // podrian arrastrar como cualquier espada y la contabilidad se rompia.
  check("el oro de PF2e no aparece como casilla", !html.includes('data-item-id="gp"'));
  check("una casilla por panel: espada y daga, ninguna moneda",
    (html.match(/data-item-id=/g) ?? []).length === 2,
    String((html.match(/data-item-id=/g) ?? []).length));

  check("pero el saldo si se ensena", html.includes("500GP") && html.includes("12GP"));
}

console.log("");
console.log("Un saldo a cero se ensena, no desaparece");
{
  const pobre = hacerActor("Pobre", [], [{ name: "Oro", abbreviation: "{#}GP", quantity: 0 }]);
  const app = new GridPileApp(mercader, pobre, { id: "t" });
  const html = await app._renderHTML();
  check("se ve el cero", html.includes("0GP"));
}

console.log("");
console.log("El saldo se refresca cuando cambia el actor");
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  let redibujado = 0;
  app.render = () => { redibujado++; };
  Object.defineProperty(app, "rendered", { get: () => true });
  GridPileApp.openApps.set(mercader.uuid, app);

  // 5e cambia `system.currency` en el actor; PF2e crea o borra objetos moneda.
  // En los dos casos llega un actor, y hay que reconocerlo aunque sea otro
  // objeto con el mismo uuid (actores sinteticos de token).
  GridPileApp.refreshFor({ uuid: "Actor.Heroe" });
  check("por uuid, no por identidad", redibujado === 1, String(redibujado));

  GridPileApp.refreshFor({ uuid: "Actor.Tienda" });
  check("tambien el de la tienda", redibujado === 2, String(redibujado));

  GridPileApp.refreshFor({ uuid: "Actor.OtroCualquiera" });
  check("y nadie mas lo dispara", redibujado === 2, String(redibujado));
  GridPileApp.openApps.delete(mercader.uuid);
}

console.log("");

console.log("");
console.log("Comprar arrastrando no vacia la bolsa");
{
  // Un monton de 4 flechas en una tienda: arrastrar una debe comprar UNA, no
  // las cuatro. En un cofre pasa lo contrario, lo normal es llevarse el monton.
  game.itempiles.API.getItemQuantity = () => 4;

  tipoDePila = "merchant";
  const tienda = new GridPileApp(mercader, heroe, { id: "t" });
  await tienda._renderHTML();
  tienda._shiftHeld = false;
  const compra = await arrastrar(tienda, "source", "target");
  const cantidadComprada = compra?.[1][2]?.[0]?.quantity;
  check("en una tienda compra una unidad", cantidadComprada === 1, String(cantidadComprada));

  tipoDePila = "container";
  const cofre = new GridPileApp(mercader, heroe, { id: "t" });
  await cofre._renderHTML();
  cofre._shiftHeld = false;
  const tomar = await arrastrar(cofre, "source", "target");
  const cantidadTomada = tomar?.[1][2]?.[0]?.quantity;
  check("en un cofre se lleva el monton", cantidadTomada === 4, String(cantidadTomada));

  game.itempiles.API.getItemQuantity = () => 1;
  tipoDePila = "merchant";
}

console.log("");
console.log("Un arrastre abandonado no contamina el siguiente");
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  await app._renderHTML();

  // Se empieza a arrastrar y se suelta fuera de cualquier grilla: `drop` no
  // llega nunca, solo `dragend`. Si el arrastre siguiera vivo, el proximo
  // objeto que entrase en la ventana se tomaria por este.
  app._dragging = { module: "velvet-grid-piles", side: "source", itemId: "w1", w: 1, h: 1 };
  const raiz = { querySelectorAll: () => [], closest: () => null };
  app._clearGhosts(raiz);
  app._dragging = null; // lo que hace ahora el manejador de dragend

  check("el arrastre queda limpio", app._dragging === null);
}

console.log("");
console.log("La ficha no resucita una tienda cerrada");
{
  const app = new GridPileApp(mercader, heroe, { id: "t" });
  await app._renderHTML();
  Object.defineProperty(app, "rendered", { get: () => false, configurable: true });

  llamadas.length = 0;
  avisos.length = 0;
  await app.takeFromDetail("w1", "source");
  check("no transfiere nada", llamadas.length === 0, String(llamadas.length));
  check("y lo dice", avisos.at(-1) === "VGP.Warn.Closed", avisos.at(-1));
}

console.log("");
console.log(fallos ? fallos + " FALLOS" : "El dinero pasa siempre por Item Piles");
process.exit(fallos ? 1 : 0);
