import { layoutItems, findFreeCell, createOccupancy, fits } from "../scripts/grid.js";

let failures = 0;
const check = (name, condition, extra = "") => {
  if (condition) console.log("  ok   " + name);
  else { failures++; console.log("  FAIL " + name + " " + extra); }
};

// Ninguna casilla puede estar cubierta por dos objetos a la vez.
function noOverlap(result) {
  const seen = new Map();
  for (const t of result.tiles) {
    for (let dy = 0; dy < t.h; dy++) {
      for (let dx = 0; dx < t.w; dx++) {
        const key = `${t.x + dx},${t.y + dy}`;
        if (seen.has(key)) return `solapan ${t.id} y ${seen.get(key)} en ${key}`;
        seen.set(key, t.id);
      }
    }
  }
  return null;
}
const inBounds = (r) => r.tiles.every((t) => t.x >= 0 && t.y >= 0 && t.x + t.w <= r.cols && t.y + t.h <= r.rows);

console.log("\n1. Grilla vacia");
const empty = layoutItems([], { cols: 10, rows: 6 });
check("sin casillas", empty.tiles.length === 0);

console.log("\n2. Mezcla de tamanos, sin posiciones guardadas");
const mixed = [
  { id: "a", w: 2, h: 3 }, { id: "b", w: 1, h: 1 }, { id: "c", w: 2, h: 2 },
  { id: "d", w: 3, h: 1 }, { id: "e", w: 1, h: 2 }, { id: "f", w: 1, h: 1 },
  { id: "g", w: 4, h: 2 }
];
const packed = layoutItems(mixed, { cols: 10, rows: 6 });
check("coloca todo", packed.tiles.length === mixed.length, `${packed.tiles.length}/${mixed.length}`);
check("sin solapes", noOverlap(packed) === null, noOverlap(packed) ?? "");
check("dentro de limites", inBounds(packed));

console.log("\n3. Modo estricto: lo que no cabe se reporta");
const tooMany = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, w: 2, h: 2 }));
const strict = layoutItems(tooMany, { cols: 4, rows: 4, strict: true });
check("solo caben 4", strict.tiles.length === 4, String(strict.tiles.length));
check("8 desbordan", strict.overflow.length === 8, String(strict.overflow.length));
check("no crece", strict.rows === 4, String(strict.rows));

console.log("\n4. Modo laxo: la grilla crece, nunca rechaza");
const loose = layoutItems(tooMany, { cols: 4, rows: 4, strict: false });
check("coloca las 12", loose.tiles.length === 12, String(loose.tiles.length));
check("sin desbordes", loose.overflow.length === 0);
check("crecio", loose.rows > 4, String(loose.rows));
check("sin solapes", noOverlap(loose) === null, noOverlap(loose) ?? "");

console.log("\n5. Respeta posiciones guardadas");
const saved = { a: { x: 5, y: 2 }, c: { x: 0, y: 0 } };
const anchored = layoutItems(mixed, { cols: 10, rows: 6, saved });
const a = anchored.tiles.find((t) => t.id === "a");
const c = anchored.tiles.find((t) => t.id === "c");
check("a se queda en 5,2", a.x === 5 && a.y === 2, JSON.stringify(a));
check("c se queda en 0,0", c.x === 0 && c.y === 0, JSON.stringify(c));
check("sin solapes", noOverlap(anchored) === null, noOverlap(anchored) ?? "");

console.log("\n6. Posiciones guardadas que chocan entre si: la segunda se recoloca");
const clashing = layoutItems(
  [{ id: "p", w: 2, h: 2 }, { id: "q", w: 2, h: 2 }],
  { cols: 6, rows: 6, saved: { p: { x: 1, y: 1 }, q: { x: 2, y: 2 } } }
);
check("ambas colocadas", clashing.tiles.length === 2);
check("sin solapes", noOverlap(clashing) === null, noOverlap(clashing) ?? "");
check("p mantiene su sitio", clashing.tiles.find((t) => t.id === "p").x === 1);

console.log("\n7. Posicion guardada fuera de la grilla");
const outside = layoutItems([{ id: "z", w: 2, h: 2 }], { cols: 4, rows: 4, saved: { z: { x: 9, y: 9 } } });
check("recolocada dentro", inBounds(outside), JSON.stringify(outside.tiles));

console.log("\n8. Objeto mas ancho que la grilla en modo estricto");
const huge = layoutItems([{ id: "big", w: 6, h: 1 }], { cols: 4, rows: 4, strict: true });
check("desborda en vez de romper", huge.overflow.length === 1 && huge.tiles.length === 0);

console.log("\n9. findFreeCell basico");
const occ = createOccupancy(3, 3);
check("primera casilla", JSON.stringify(findFreeCell(occ, 3, 3, 1, 1)) === '{"x":0,"y":0}');
check("no cabe 4x1", findFreeCell(occ, 3, 3, 4, 1) === null);
check("fits rechaza fuera de rango", fits(occ, 3, 3, 2, 2, 2, 2) === false);

console.log(failures ? `\n${failures} FALLOS` : "\nTodo correcto");
process.exit(failures ? 1 : 0);
