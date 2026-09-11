// La parte pura de la migracion: que se copia y que no. El recorrido por
// actores, tokens y ajustes necesita un Foundry real.
const { legacyFlags, decodeSetting, shouldCopySetting } = await import("../scripts/migration.js");

let failures = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}  -> ${JSON.stringify(got)}${ok ? "" : " (esperado " + JSON.stringify(want) + ")"}`);
};

const layout = { layout: { a1: { x: 0, y: 0 } }, shopName: "Bram" };

console.log("\n1. Flags del id viejo");
check("se copian", legacyFlags({ flags: { "velvet-grid-piles": layout } }), layout);
check("sin flags viejos", legacyFlags({ flags: { "item-piles": {} } }), null);
check("sin flags", legacyFlags({}), null);
check("objeto vacio no cuenta", legacyFlags({ flags: { "velvet-grid-piles": {} } }), null);
check("no pisa lo nuevo",
  legacyFlags({ flags: { "velvet-grid-piles": layout, "velvet-shopping-experience": { shopName: "Otra" } } }),
  null);

console.log("\n2. Ajustes");
check("texto JSON", decodeSetting('"ruta/fondo.png"'), "ruta/fondo.png");
check("numero", decodeSetting("76"), 76);
check("booleano", decodeSetting("false"), false);
check("ya decodificado", decodeSetting(0.5), 0.5);
check("texto suelto", decodeSetting("no es json"), "no es json");
check("fondo vacio viejo no tapa el nuevo", shouldCopySetting("backgroundImage", ""), false);
check("fondo elegido si", shouldCopySetting("backgroundImage", "worlds/x/fondo.webp"), true);
check("otros vacios si", shouldCopySetting("shopName", ""), true);

console.log(failures ? `\n${failures} FALLOS` : "\nTodo correcto");
process.exit(failures ? 1 : 0);
