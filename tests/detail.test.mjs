// La ficha del objeto: debe leer lo que cada sistema tiene y callar lo que no.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
globalThis.foundry = {
  utils: { getProperty, randomID: () => "x", debounce: (f) => f },
  applications: { api: {}, ux: { TextEditor: { implementation: { enrichHTML: async (h) => h + "<!--enriquecido-->" } } } }
};
globalThis.Application = class { constructor(o = {}) { this.options = o; } render() { return this; } };
globalThis.CONFIG = {
  Item: { typeLabels: {} },
  PF2E: { weaponTraits: { "deadly-d10": "Mortal d10", agile: "Agil" } },
  DND5E: { itemProperties: { fin: { label: "Sutil" } } }
};
globalThis.ui = { notifications: { warn() {}, error() {} } };
globalThis.game = {
  system: { id: "pf2e" },
  user: { isGM: true },
  settings: { get: () => 76 },
  i18n: { localize: (k) => k, format: (k) => k },
  itempiles: { API: { getItemQuantity: (i) => i.system?.quantity ?? 1 } }
};

const { ItemDetailApp } = await import("../scripts/item-detail.js");

let fallos = 0;
const check = (nombre, cond, extra = "") => {
  if (!cond) fallos++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${nombre}${extra ? " -> " + extra : ""}`);
};

async function ficha(item, contexto = {}) {
  const app = new ItemDetailApp(item, contexto, { id: "d" });
  return app._renderHTML();
}

console.log("");
console.log("PF2e: nivel, volumen y rasgos");
const espadaPf2e = {
  id: "a", uuid: "Item.a", name: "Espada larga +1", img: "x.webp", type: "weapon",
  system: {
    level: { value: 3 }, bulk: { value: 1 }, quantity: 2,
    traits: { value: ["deadly-d10", "agile"], rarity: "uncommon" },
    description: { value: "<p>Una hoja bien cuidada.</p>" }
  }
};
const htmlPf2e = await ficha(espadaPf2e, { price: "35 gp", category: "Armas", rarity: "uncommon", footprint: { w: 1, h: 2 } });
check("nombre", htmlPf2e.includes("Espada larga +1"));
check("precio visible", htmlPf2e.includes("35 gp"));
check("nivel", htmlPf2e.includes("VSE.Detail.Level"));
check("volumen", htmlPf2e.includes("VSE.Detail.Bulk"));
check("no ensena peso de 5e", !htmlPf2e.includes("VSE.Detail.Weight"));
check("cantidad", htmlPf2e.includes("VSE.Detail.Quantity"));
check("huella en la grilla", htmlPf2e.includes("1 x 2"));
check("rasgos traducidos", htmlPf2e.includes("Mortal d10") && htmlPf2e.includes("Agil"));
check("descripcion enriquecida", htmlPf2e.includes("enriquecido"));
check("marca de rareza", htmlPf2e.includes("is-uncommon"));

console.log("");
console.log("D&D 5e: peso y propiedades");
game.system.id = "dnd5e";
const dagaDnd = {
  id: "b", uuid: "Item.b", name: "Daga", img: "y.webp", type: "weapon",
  system: {
    weight: { value: 1 }, quantity: 1, rarity: "rare",
    properties: ["fin"],
    description: { value: "<p>Ligera y afilada.</p>" }
  }
};
const htmlDnd = await ficha(dagaDnd, { price: "2 GP", category: "Armas", rarity: "rare" });
check("peso", htmlDnd.includes("VSE.Detail.Weight"));
check("sin nivel de PF2e", !htmlDnd.includes("VSE.Detail.Level"));
check("propiedad traducida", htmlDnd.includes("Sutil"));
check("cantidad 1 no se ensena", !htmlDnd.includes("VSE.Detail.Quantity"));

console.log("");
console.log("Objeto pelado: sin datos, sin filas vacias");
const pelado = { id: "c", uuid: "Item.c", name: "Piedra", img: "z.webp", type: "loot", system: {} };
const htmlPelado = await ficha(pelado, {});
check("no aparece 'undefined'", !htmlPelado.includes("undefined"));
check("aviso de sin descripcion", htmlPelado.includes("VSE.Detail.NoDescription"));
check("sin bloque de precio", !htmlPelado.includes("vse-detail-price"));
check("sin rasgos", !htmlPelado.includes("vse-detail-tags"));
check("boton de ficha siempre", htmlPelado.includes("VSE.Detail.OpenSheet"));

console.log("");
console.log("Boton de compra solo si hay con quien comerciar");
const conCompra = await ficha(pelado, { canBuy: true, buyLabel: "Comprar" });
check("con destinatario", conCompra.includes("data-vse-detail=\"take\""));
check("sin destinatario", !htmlPelado.includes("data-vse-detail=\"take\""));

console.log("");
console.log("Descripcion como texto plano tambien vale");
const otro = { id: "d", uuid: "Item.d", name: "Nota", img: "n.webp", type: "loot", system: { description: "Texto suelto" } };
check("acepta descripcion sin objeto", (await ficha(otro, {})).includes("Texto suelto"));

console.log("");
console.log(fallos ? fallos + " FALLOS" : "La ficha se comporta");
process.exit(fallos ? 1 : 0);
