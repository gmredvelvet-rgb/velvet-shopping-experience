// Stubs minimos de Foundry: footprints.js solo usa getProperty y game.system.id.
globalThis.foundry = { utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o) } };
globalThis.game = { system: { id: "dnd5e" } };

const { itemFootprint, normalizeSize, sizeFromImageDimensions } =
  await import("../scripts/footprints.js");

let failures = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}  -> ${JSON.stringify(got)}${ok ? "" : " (esperado " + JSON.stringify(want) + ")"}`);
};

console.log("\n1. Prioridad de flags");
check("flag propio manda",
  itemFootprint({ type: "loot", flags: { "velvet-grid-piles": { size: { w: 2, h: 3 } }, "item-piles": { item: { width: 1, height: 1 } } } }),
  { w: 2, h: 3 });
check("flags de item-piles (vault, bajo .item)",
  itemFootprint({ type: "loot", flags: { "item-piles": { item: { width: 2, height: 2 } } } }),
  { w: 2, h: 2 });
check("item-piles 1x1 no bloquea la heuristica",
  itemFootprint({ type: "loot", system: { weight: { value: 20 } }, flags: { "item-piles": { item: { width: 1, height: 1 } } } }),
  { w: 2, h: 3 });
check("flag de Stoneshard en pixeles",
  itemFootprint({ type: "loot", flags: { "stoneshard-items-dnd5e-by-fatmorbus": { inventorySize: { pxw: 216, pxh: 108 } } } }),
  { w: 2, h: 1 });
check("flag guardado como texto JSON",
  itemFootprint({ type: "loot", flags: { "stoneshard-sheet-by-fatmorbus": { inventorySize: '{"w":3,"h":2}' } } }),
  { w: 3, h: 2 });

console.log("\n2. Heuristica de D&D 5e por peso");
check("ligero", itemFootprint({ type: "loot", system: { weight: { value: 1 } } }), { w: 1, h: 1 });
check("medio", itemFootprint({ type: "loot", system: { weight: { value: 5 } } }), { w: 1, h: 2 });
check("pesado", itemFootprint({ type: "loot", system: { weight: { value: 25 } } }), { w: 2, h: 3 });
check("armadura pesada se ensancha",
  itemFootprint({ type: "equipment", system: { weight: { value: 1 }, type: { value: "heavy" } } }),
  { w: 2, h: 2 });
check("arma a dos manos",
  itemFootprint({ type: "weapon", system: { weight: { value: 1 }, properties: ["two"] } }),
  { w: 2, h: 2 });
check("properties como Set",
  itemFootprint({ type: "weapon", system: { weight: { value: 1 }, properties: new Set(["two"]) } }),
  { w: 2, h: 2 });
check("mochila", itemFootprint({ type: "container", system: { weight: { value: 1 } } }), { w: 2, h: 2 });

console.log("\n3. Heuristica sin activar");
check("todo 1x1", itemFootprint({ type: "loot", system: { weight: { value: 99 } } }, false), { w: 1, h: 1 });

console.log("\n4. Heuristica de PF2e por Bulk");
game.system.id = "pf2e";
check("bulk L", itemFootprint({ type: "loot", system: { bulk: { value: 0.1 } } }), { w: 1, h: 1 });
check("bulk 1", itemFootprint({ type: "loot", system: { bulk: { value: 1 } } }), { w: 2, h: 2 });
check("bulk 4", itemFootprint({ type: "loot", system: { bulk: { value: 4 } } }), { w: 3, h: 3 });
check("bulk como texto 'L'", itemFootprint({ type: "loot", system: { bulk: "L" } }), { w: 1, h: 1 });
check("rasgo two-hand de PF2e",
  itemFootprint({ type: "weapon", system: { bulk: { value: 0.1 }, traits: { value: ["two-hand-d10"] } } }),
  { w: 2, h: 2 });
game.system.id = "dnd5e";

console.log("\n5. Medida por imagen");
check("multiplo exacto", sizeFromImageDimensions(324, 216), { w: 3, h: 2 });
check("no multiplo -> null", sizeFromImageDimensions(512, 512), null);
check("tope de 6 casillas", normalizeSize({ w: 99, h: 2 }), { w: 6, h: 2 });
check("basura -> null", normalizeSize("no soy json"), null);

console.log(failures ? `\n${failures} FALLOS` : "\nTodo correcto");
process.exit(failures ? 1 : 0);
