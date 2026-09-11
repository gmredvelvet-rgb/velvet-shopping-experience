// Reproduce el render completo de la ventana fuera de Foundry, con stubs.
// Si _renderHTML lanza, aqui se ve el stack exacto.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

globalThis.foundry = {
  utils: {
    getProperty,
    deepClone: (o) => structuredClone(o),
    randomID: () => "abc123",
    debounce: (fn) => fn, getRoute: (p) => "/" + String(p).replace(/^\/+/, "")
  },
  applications: { api: {} } // sin ApplicationV2: se usara el Application de respaldo
};

globalThis.Application = class {
  constructor(options = {}) { this.options = options; }
  render() { return this; }
  close() { return this; }
};

const SETTINGS = {
  cellSize: 76, portraitSize: 168, pileCols: 10, pileRows: 6, actorCols: 10, actorRows: 6,
  bulkyItems: true, strictByDefault: false, showLabels: true, backgroundImage: "",
  gridForContainers: true, gridForMerchants: true, gridForPiles: true
};

globalThis.CONFIG = {
  Item: { typeLabels: { weapon: "Arma", equipment: "Equipo", loot: "Miscelaneo", consumable: "Consumible" } }
};

globalThis.ui = { notifications: { warn: (m) => console.log("  [warn]", m), error: (m) => console.log("  [error]", m) } };

function makeItem(id, name, data = {}) {
  return {
    id, name, img: `worlds/test/${id}.png`, type: data.type ?? "loot",
    system: data.system ?? { weight: { value: 3 } },
    flags: data.flags ?? {},
    toObject() { return { ...this }; }
  };
}

function makeActor(name, items, { isOwner = true, flags = {} } = {}) {
  const map = new Map(items.map((i) => [i.id, i]));
  return {
    name, uuid: `Actor.${name}`, img: `worlds/test/${name}.webp`, isOwner, flags,
    items: { get: (id) => map.get(id), [Symbol.iterator]: () => map.values() },
    getFlag: (scope, key) => flags?.[scope]?.[key],
    setDecor: (clave, valor) => { (flags["velvet-grid-piles"] ??= {})[clave] = valor; },
    setFlag: async () => {},
    update: async () => {}
  };
}

const pileItems = [
  makeItem("i1", "Espada larga", { type: "weapon", system: { weight: { value: 3 }, properties: ["two"] } }),
  makeItem("i2", "Pocion", { system: { weight: { value: 0.5 } } }),
  makeItem("i3", "Armadura", { type: "equipment", system: { weight: { value: 25 }, type: { value: "heavy" } } })
];
const heroItems = [makeItem("h1", "Daga", { type: "weapon", system: { weight: { value: 1 } } })];

const pile = makeActor("Cofre", pileItems, { flags: { "item-piles": { data: { type: "container", enabled: true } } } });
const hero = makeActor("Heroe", heroItems);

globalThis.game = {
  system: { id: "dnd5e" },
  user: { isGM: false, character: hero },
  actors: [],
  settings: {
    get: (mod, key) => {
      if (!(key in SETTINGS)) throw new Error(`ajuste no registrado: ${key}`);
      return SETTINGS[key];
    }
  },
  i18n: {
    localize: (k) => k,
    format: (k, d) => `${k}:${JSON.stringify(d)}`
  },
  itempiles: {
    API: {
      getActorItems: (actor) => [...actor.items],
      getItemQuantity: () => 1,
      getActorCurrencies: () => [{ name: "Oro", img: "gold.png", abbreviation: "{#}GP", quantity: 12 }],
      getPricesForItem: () => [{ primary: true, priceString: "5 GP", free: false }],
      getCostOfItem: (item) => ({ i1: 10, i2: 2, i3: 160, h1: 5 })[item.id] ?? 0,
      getActorFlagData: (a) => a.flags?.["item-piles"]?.data ?? {},
      isItemPileMerchant: (a) => (a.flags?.["item-piles"]?.data?.type) === "merchant",
      isItemPileVault: () => false
    }
  }
};

globalThis.Image = class {
  constructor() { setTimeout(() => this.onerror?.(), 0); }
  set src(v) { this._src = v; }
};

const { GridPileApp } = await import("../scripts/app.js");

async function attempt(label, pileActor, recipient) {
  process.stdout.write(`\n${label}\n`);
  try {
    const app = new GridPileApp(pileActor, recipient, { id: "test" });
    const html = await app._renderHTML();
    console.log(`  ok    render de ${html.length} caracteres`);
    const tiles = (html.match(/class="vgp-tile/g) ?? []).length;
    console.log(`  ok    ${tiles} casillas dibujadas`);
    return true;
  } catch (error) {
    console.log("  FALLO", error.constructor.name + ":", error.message);
    console.log(String(error.stack).split("\n").slice(1, 4).join("\n"));
    return false;
  }
}

let ok = true;
ok = await attempt("1. Contenedor con destinatario", pile, hero) && ok;
ok = await attempt("2. Contenedor sin destinatario (GM)", pile, null) && ok;

pile.flags["item-piles"].data.type = "merchant";
ok = await attempt("3. Mercader con destinatario", pile, hero) && ok;
ok = await attempt("4. Mercader sin destinatario", pile, null) && ok;

pile.flags["item-piles"].data.type = "pile";
const emptyPile = makeActor("Vacio", [], { flags: { "item-piles": { data: { type: "pile" } } } });
ok = await attempt("5. Pila vacia", emptyPile, hero) && ok;

// Regresion: Item Piles entrega `false`, no `null`, cuando no hay personaje
// inspector. `?.` no corta con `false`, asi que `false.getFlag()` reventaba el
// render entero y dejaba la pila sin abrir nada.
ok = await attempt("6. Destinatario `false` (lo que pasa Item Piles)", pile, false) && ok;

// Y `fromUuidSync` puede devolver un TokenDocument en vez de un Actor.
ok = await attempt("7. Destinatario TokenDocument", pile, { documentName: "Token", actor: hero }) && ok;

const { toActor } = await import("../scripts/app.js");
const casos = [
  ["false", false, null],
  ["null", null, null],
  ["undefined", undefined, null],
  ["TokenDocument", { documentName: "Token", actor: hero }, hero],
  ["Actor", hero, hero]
];
console.log("");
console.log("8. toActor normaliza la entrada");
for (const [nombre, entrada, esperado] of casos) {
  const got = toActor(entrada);
  const bien = got === esperado;
  if (!bien) ok = false;
  console.log(`  ${bien ? "ok  " : "FAIL"} ${nombre} -> ${got === null ? "null" : got.name}`);
}

console.log("");
// La barra de herramientas nueva: pestanas, busqueda y orden.
async function panel(pileActor, recipient, filtros = {}) {
  const app = new GridPileApp(pileActor, recipient, { id: "test" });
  Object.assign(app._filtersFor("source"), filtros);
  const html = await app._renderHTML();
  return { app, html, side: app._sides.source };
}

console.log("");
console.log("9. Pestanas, busqueda y orden");
{
  const base = await panel(pile, hero);
  // Los tipos crudos del sistema se agrupan: la armadura pesada de 5e es un
  // `equipment`, pero en la tienda se lee como Armaduras.
  const nombres = base.side.categories.map(([valor]) => valor).sort();
  const bien = JSON.stringify(nombres) === JSON.stringify(["armor", "misc", "weapon"]);
  if (!bien) ok = false;
  console.log(`  ${bien ? "ok  " : "FAIL"} pestanas segun lo que hay -> ${nombres.join(", ")}`);

  const buscada = await panel(pile, hero, { query: "espada" });
  const unaSola = buscada.side.tiles.length === 1 && buscada.side.tiles[0].item.name === "Espada larga";
  if (!unaSola) ok = false;
  console.log(`  ${unaSola ? "ok  " : "FAIL"} busqueda filtra -> ${buscada.side.tiles.length} casilla(s)`);

  const vacia = await panel(pile, hero, { query: "zzzz" });
  const sinNada = vacia.side.tiles.length === 0 && vacia.html.includes("VGP.NoMatches");
  if (!sinNada) ok = false;
  console.log(`  ${sinNada ? "ok  " : "FAIL"} busqueda sin resultados avisa`);

  const armas = await panel(pile, hero, { category: "weapon" });
  const soloArmas = armas.side.tiles.every((t) => t.item.type === "weapon") && armas.side.tiles.length === 1;
  if (!soloArmas) ok = false;
  console.log(`  ${soloArmas ? "ok  " : "FAIL"} pestana filtra por tipo -> ${armas.side.tiles.length}`);

  // El orden pedido manda sobre el empaquetado por tamano: el primero en orden
  // de lectura debe ser el mas barato.
  const barato = await panel(pile, hero, { sort: "priceAsc" });
  const enOrden = [...barato.side.tiles].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const primeroBarato = enOrden[0]?.item.name === "Pocion";
  if (!primeroBarato) ok = false;
  console.log(`  ${primeroBarato ? "ok  " : "FAIL"} precio ascendente -> primero ${enOrden[0]?.item.name}`);

  const caro = await panel(pile, hero, { sort: "priceDesc" });
  const enOrden2 = [...caro.side.tiles].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const primeroCaro = enOrden2[0]?.item.name === "Armadura";
  if (!primeroCaro) ok = false;
  console.log(`  ${primeroCaro ? "ok  " : "FAIL"} precio descendente -> primero ${enOrden2[0]?.item.name}`);

  const conEtiqueta = base.html.includes("vgp-label") && base.html.includes("Espada larga");
  if (!conEtiqueta) ok = false;
  console.log(`  ${conEtiqueta ? "ok  " : "FAIL"} nombre visible en la casilla`);
}

console.log("");
// Decorado por tienda: cada mercader puede tener su propio fondo y retrato.
console.log("");
console.log("10. Decorado por tienda");
{
  const conDecorado = new GridPileApp(pile, hero, { id: "t" });
  const sinNada = conDecorado.background;
  const bien1 = sinNada === "";
  if (!bien1) ok = false;
  console.log(`  ${bien1 ? "ok  " : "FAIL"} sin fondo configurado -> tema por defecto`);

  SETTINGS.backgroundImage = "worlds/x/mundo.webp";
  const delMundo = new GridPileApp(pile, hero, { id: "t" }).background;
  const bien2 = delMundo === "worlds/x/mundo.webp";
  if (!bien2) ok = false;
  console.log(`  ${bien2 ? "ok  " : "FAIL"} sin fondo propio -> hereda el del mundo`);

  pile.setDecor("background", "worlds/x/herreria.webp");
  const propio = new GridPileApp(pile, hero, { id: "t" }).background;
  const bien3 = propio === "worlds/x/herreria.webp";
  if (!bien3) ok = false;
  console.log(`  ${bien3 ? "ok  " : "FAIL"} el fondo de la tienda manda -> ${propio}`);

  const app = new GridPileApp(pile, hero, { id: "t" });
  const html = await app._renderHTML();

  // La clase va en el marcado, pero la ruta NO: dentro de style="..." las
  // comillas del url() partirian el atributo y anularian la variable.
  const conClase = html.includes("has-scene");
  if (!conClase) ok = false;
  console.log(`  ${conClase ? "ok  " : "FAIL"} la clase has-scene llega al marcado`);

  const sinUrlEnAtributos = [...html.matchAll(/style="([^"]*)"/g)]
    .every(([, valor]) => !valor.includes("url("));
  if (!sinUrlEnAtributos) ok = false;
  console.log(`  ${sinUrlEnAtributos ? "ok  " : "FAIL"} la ruta no viaja en el atributo style`);

  const capa = html.match(/<img class="vgp-scene-layer" src="([^"]+)"/);
  const pintado = capa?.[1] === "/worlds/x/herreria.webp";
  if (!pintado) ok = false;
  console.log(`  ${pintado ? "ok  " : "FAIL"} el decorado se dibuja -> ${capa?.[1]}`);

  // El retrato propio gana a la imagen de mercader de Item Piles.
  pile.setDecor("portrait", "worlds/x/herrero.webp");
  const html2 = await new GridPileApp(pile, hero, { id: "t" })._renderHTML();
  const conRetrato = html2.includes("herrero.webp");
  if (!conRetrato) ok = false;
  console.log(`  ${conRetrato ? "ok  " : "FAIL"} retrato propio de la tienda`);

  const alto = html2.includes("--vgp-portrait:168px");
  if (!alto) ok = false;
  console.log(`  ${alto ? "ok  " : "FAIL"} alto de retrato configurable`);

  SETTINGS.backgroundImage = "";
}

console.log("");
// Regresion: el precio se perdia de dos maneras distintas. Primero por exigir
// un destinatario elegido, y luego porque el modo compacto escondia la etiqueta
// entera en vez de solo el nombre.
console.log("");
console.log("11. El precio no se pierde");
{
  pile.flags["item-piles"].data.type = "merchant";

  const conPersonaje = await new GridPileApp(pile, hero, { id: "t" })._renderHTML();
  const bien1 = conPersonaje.includes("vgp-price") && conPersonaje.includes("5 GP");
  if (!bien1) ok = false;
  console.log(`  ${bien1 ? "ok  " : "FAIL"} con personaje elegido`);

  const sinPersonaje = await new GridPileApp(pile, null, { id: "t" })._renderHTML();
  const bien2 = sinPersonaje.includes("vgp-price") && sinPersonaje.includes("5 GP");
  if (!bien2) ok = false;
  console.log(`  ${bien2 ? "ok  " : "FAIL"} sin personaje elegido`);

  // En un contenedor no hay precio que ensenar, y eso es correcto.
  pile.flags["item-piles"].data.type = "container";
  const contenedor = await new GridPileApp(pile, hero, { id: "t" })._renderHTML();
  const bien3 = !contenedor.includes("vgp-price");
  if (!bien3) ok = false;
  console.log(`  ${bien3 ? "ok  " : "FAIL"} un contenedor no ensena precios`);

  pile.flags["item-piles"].data.type = "merchant";
}

console.log("");
// El rotulo de la tienda y el nombre del vendedor son editables; vacios, se
// usan el nombre del actor y el tipo de pila.
console.log("");
console.log("12. Nombres editables");
{
  pile.flags["item-piles"].data.type = "merchant";

  const porDefecto = await new GridPileApp(pile, hero, { id: "t" })._renderHTML();
  const bien1 = porDefecto.includes("<b>Cofre</b>") === false && porDefecto.includes("Cofre");
  if (!bien1) ok = false;
  console.log(`  ${bien1 ? "ok  " : "FAIL"} sin rotulo usa el nombre del actor`);

  const bien2 = porDefecto.includes("VGP.Merchant");
  if (!bien2) ok = false;
  console.log(`  ${bien2 ? "ok  " : "FAIL"} sin vendedor usa el tipo de pila`);

  pile.setDecor("shopName", "La Espada Mellada");
  pile.setDecor("vendorName", "Bram el Tuerto");
  const app = new GridPileApp(pile, hero, { id: "t" });
  const conNombres = await app._renderHTML();

  const bien3 = conNombres.includes("La Espada Mellada");
  if (!bien3) ok = false;
  console.log(`  ${bien3 ? "ok  " : "FAIL"} rotulo propio`);

  const bien4 = conNombres.includes("Bram el Tuerto") && !conNombres.includes("VGP.Merchant");
  if (!bien4) ok = false;
  console.log(`  ${bien4 ? "ok  " : "FAIL"} vendedor propio sustituye al tipo`);

  const bien5 = app.title === "La Espada Mellada";
  if (!bien5) ok = false;
  console.log(`  ${bien5 ? "ok  " : "FAIL"} la barra de titulo tambien -> ${app.title}`);

  // El panel del personaje no se toca: sigue siendo su nombre.
  const bien6 = conNombres.includes("Heroe") && conNombres.includes("VGP.Yours");
  if (!bien6) ok = false;
  console.log(`  ${bien6 ? "ok  " : "FAIL"} el panel del personaje no cambia`);

  pile.setDecor("shopName", "");
  pile.setDecor("vendorName", "");
  const vuelta = await new GridPileApp(pile, hero, { id: "t" })._renderHTML();
  const bien7 = vuelta.includes("VGP.Merchant") && vuelta.includes("Cofre");
  if (!bien7) ok = false;
  console.log(`  ${bien7 ? "ok  " : "FAIL"} vaciarlos vuelve a lo de antes`);
}

console.log("");
console.log(ok ? "\nRender correcto en todos los casos" : "\nHay fallos de render");
process.exit(ok ? 0 : 1);
