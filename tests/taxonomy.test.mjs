// Auditoria de la taxonomia: todos los tipos fisicos de PF2e y D&D 5e deben
// caer en un grupo con nombre, y ninguno debe quedarse sin pestana.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
globalThis.foundry = { utils: { getProperty, randomID: () => "x", debounce: (f) => f } };
globalThis.Application = class { constructor(o = {}) { this.options = o; } };
globalThis.game = {
  system: { id: "pf2e" },
  user: { isGM: false },
  settings: { get: () => 76 },
  i18n: {
    localize: (k) => ({
      "VGP.Group.weapon": "Armas", "VGP.Group.armor": "Armaduras", "VGP.Group.ammo": "Municion",
      "VGP.Group.consumable": "Consumibles", "VGP.Group.equipment": "Equipo",
      "VGP.Group.container": "Contenedores", "VGP.Group.tool": "Herramientas",
      "VGP.Group.treasure": "Tesoro", "VGP.Group.misc": "Miscelaneo"
    }[k] ?? k)
  },
  itempiles: { API: {} }
};
globalThis.CONFIG = { Item: { typeLabels: {} } };

const { categoryOf, categoryLabel, categoriesOf, rarityOf, GROUPS } =
  await import("../scripts/app.js");

let fallos = 0;
const check = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`  ${bien ? "ok  " : "FAIL"} ${nombre} -> ${real}${bien ? "" : " (esperado " + esperado + ")"}`);
};

const it = (type, system = {}) => ({ type, system, flags: {} });

console.log("");
console.log("PF2e - tipos fisicos reales del template.json del sistema");
game.system.id = "pf2e";
check("weapon", categoryOf(it("weapon")), GROUPS.WEAPON);
check("armor", categoryOf(it("armor", { category: "medium" })), GROUPS.ARMOR);
check("shield (tipo propio)", categoryOf(it("shield")), GROUPS.ARMOR);
check("ammo (tipo propio PF2e 6)", categoryOf(it("ammo")), GROUPS.AMMO);
check("consumable/ammo (PF2e antiguo)", categoryOf(it("consumable", { category: "ammo" })), GROUPS.AMMO);
check("consumable/potion", categoryOf(it("consumable", { category: "potion" })), GROUPS.CONSUMABLE);
check("consumable/scroll", categoryOf(it("consumable", { category: "scroll" })), GROUPS.CONSUMABLE);
check("consumable/talisman", categoryOf(it("consumable", { category: "talisman" })), GROUPS.CONSUMABLE);
check("backpack", categoryOf(it("backpack")), GROUPS.CONTAINER);
check("treasure", categoryOf(it("treasure")), GROUPS.TREASURE);
check("equipment", categoryOf(it("equipment")), GROUPS.EQUIPMENT);
check("kit", categoryOf(it("kit")), GROUPS.EQUIPMENT);
check("book", categoryOf(it("book")), GROUPS.MISC);

console.log("");
console.log("D&D 5e - la armadura vive en equipment y la municion en consumable");
game.system.id = "dnd5e";
check("weapon", categoryOf(it("weapon")), GROUPS.WEAPON);
check("equipment/light", categoryOf(it("equipment", { type: { value: "light" } })), GROUPS.ARMOR);
check("equipment/heavy", categoryOf(it("equipment", { type: { value: "heavy" } })), GROUPS.ARMOR);
check("equipment/shield", categoryOf(it("equipment", { type: { value: "shield" } })), GROUPS.ARMOR);
check("equipment/trinket", categoryOf(it("equipment", { type: { value: "trinket" } })), GROUPS.EQUIPMENT);
check("consumable/ammo", categoryOf(it("consumable", { type: { value: "ammo" } })), GROUPS.AMMO);
check("consumable/potion", categoryOf(it("consumable", { type: { value: "potion" } })), GROUPS.CONSUMABLE);
check("consumable/scroll", categoryOf(it("consumable", { type: { value: "scroll" } })), GROUPS.CONSUMABLE);
check("consumable/food", categoryOf(it("consumable", { type: { value: "food" } })), GROUPS.CONSUMABLE);
check("tool", categoryOf(it("tool")), GROUPS.TOOL);
check("container", categoryOf(it("container")), GROUPS.CONTAINER);
check("backpack (heredado)", categoryOf(it("backpack")), GROUPS.CONTAINER);
check("loot/treasure", categoryOf(it("loot", { type: { value: "treasure" } })), GROUPS.TREASURE);
check("loot", categoryOf(it("loot")), GROUPS.MISC);
check("facility (no fisico)", categoryOf(it("facility")), GROUPS.MISC);

console.log("");
console.log("Sistema desconocido: nada se pierde");
game.system.id = "unSistemaRaro";
check("armaCualquiera", categoryOf(it("meleeWeapon")), GROUPS.WEAPON);
check("tipo inventado", categoryOf(it("chorizo")), GROUPS.MISC);

console.log("");
console.log("Categoria personalizada de Item Piles: manda sobre todo");
const conCategoria = { type: "weapon", system: {}, flags: { "item-piles": { item: { customCategory: "Reliquias" } } } };
check("valor", categoryOf(conCategoria), "custom:Reliquias");
check("etiqueta", categoryLabel(categoryOf(conCategoria)), "Reliquias");

console.log("");
console.log("Etiquetas y orden de las pestanas");
game.system.id = "dnd5e";
const inventario = [
  it("loot"), it("consumable", { type: { value: "ammo" } }), it("weapon"),
  it("equipment", { type: { value: "heavy" } }), it("tool"),
  { type: "weapon", system: {}, flags: { "item-piles": { item: { customCategory: "Reliquias" } } } }
];
const pestanas = categoriesOf(inventario);
const etiquetas = pestanas.map(([, label]) => label);
check("orden de juego", etiquetas.join(" | "), "Armas | Armaduras | Municion | Herramientas | Miscelaneo | Reliquias");
check("todas con icono", String(pestanas.every(([, , icono]) => Boolean(icono))), "true");

console.log("");
console.log("Rareza normalizada en ambos sistemas");
check("5e veryRare", rarityOf({ system: { rarity: "veryRare" } }), "veryRare");
check("5e legendary", rarityOf({ system: { rarity: "legendary" } }), "legendary");
check("5e 'very rare' con espacio", rarityOf({ system: { rarity: "very rare" } }), "veryRare");
check("5e common no marca", String(rarityOf({ system: { rarity: "common" } })), "null");
check("PF2e unique", rarityOf({ system: { traits: { rarity: "unique" } } }), "unique");
check("PF2e uncommon", rarityOf({ system: { traits: { rarity: "uncommon" } } }), "uncommon");
check("sin rareza", String(rarityOf({ system: {} })), "null");

console.log("");
console.log(fallos ? fallos + " FALLOS" : "Taxonomia correcta");
process.exit(fallos ? 1 : 0);
