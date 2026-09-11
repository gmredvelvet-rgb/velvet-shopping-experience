// La grilla nunca puede ser mas ancha que su panel: si lo es, el navegador la
// recorta por los dos lados y quedan objetos inalcanzables, que es justo lo que
// se veia en las capturas.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
globalThis.foundry = { utils: { getProperty, randomID: () => "x", debounce: (f) => f, deepClone: (o) => structuredClone(o) } };
globalThis.Application = class { constructor(o = {}) { this.options = o; } };
globalThis.CONFIG = { Item: { typeLabels: {} } };
globalThis.ui = { notifications: { warn() {}, error() {} } };

const SETTINGS = { cellSize: 76, pileCols: 10, pileRows: 6, actorCols: 10, actorRows: 6 };
globalThis.game = {
  system: { id: "dnd5e" },
  user: { isGM: false },
  settings: { get: (m, k) => SETTINGS[k] },
  i18n: { localize: (k) => k, format: (k) => k },
  itempiles: { API: {} }
};

const { GridPileApp } = await import("../scripts/app.js");
const { MIN_CELL, MIN_COLS } = await import("../scripts/constants.js");

let fallos = 0;
const check = (nombre, cond, extra = "") => {
  if (!cond) fallos++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${nombre}${extra ? " -> " + extra : ""}`);
};

const app = new GridPileApp({ uuid: "Actor.x", name: "Cofre" }, null, { id: "t" });

console.log("");
console.log("Columnas y casilla segun el ancho real del panel");

const anchos = [1200, 760, 600, 420, 300, 200, 120];
for (const ancho of anchos) {
  app._widths = { source: ancho };
  const cols = app._effectiveCols("source", SETTINGS.pileCols);
  const cell = app._cellSizeFor("source", cols);
  const usado = cols * cell;

  check(`ancho ${ancho}px -> ${cols} col x ${cell}px = ${usado}px`, usado <= ancho,
    usado > ancho ? `DESBORDA por ${usado - ancho}px` : "");
  // Con el minimo de columnas ya puesto, la casilla puede encoger por debajo
  // del minimo comodo: caber importa mas que verse grande.
  check(`  casilla legible (>= ${MIN_CELL}) o panel al limite`,
    cell >= MIN_CELL || cols === MIN_COLS, String(cell));
  check(`  nunca menos de ${MIN_COLS} columnas`, cols >= MIN_COLS, String(cols));
  check(`  no se pasa de lo configurado`, cols <= SETTINGS.pileCols, String(cols));
  check(`  no agranda la casilla mas de lo pedido`, cell <= SETTINGS.cellSize, String(cell));
}

console.log("");
console.log("Sin medir todavia se usa lo configurado");
app._widths = {};
check("primer render", app._effectiveCols("source", 10) === 10);

console.log("");
console.log(fallos ? fallos + " FALLOS" : "La grilla nunca desborda");
process.exit(fallos ? 1 : 0);
