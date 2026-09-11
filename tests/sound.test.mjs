// Los sonidos de la tienda: cada uno en su momento, y nunca emitidos a la mesa.

const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

const reproducidos = [];
globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => "x",
    debounce: (f) => f,
    deepClone: (o) => structuredClone(o),
    getRoute: (p) => "/" + String(p).replace(/^\/+/, "")
  },
  audio: {
    AudioHelper: {
      play(data, socketOptions) {
        reproducidos.push({ ...data, socketOptions });
        return null;
      }
    }
  },
  applications: { api: {} }
};
globalThis.Application = class { constructor(o = {}) { this.options = o; } async close() { return this; } };
globalThis.CONFIG = { Item: { typeLabels: {} } };
globalThis.ui = { notifications: { warn() {}, error() {} } };

const SETTINGS = {
  cellSize: 76, portraitSize: 168, pileCols: 10, pileRows: 6, actorCols: 10, actorRows: 6,
  bulkyItems: true, strictByDefault: false, showLabels: true, backgroundImage: "",
  gridForMerchants: true, soundVolume: 0.8
};

const SONIDOS = {
  soundWelcome: "sounds/tienda/hola.ogg",
  soundFarewell: "sounds/tienda/adios.ogg",
  soundBuy: "sounds/tienda/moneda.ogg",
  soundSell: "sounds/tienda/venta.ogg"
};

globalThis.game = {
  system: { id: "dnd5e" },
  user: { isGM: false, character: null },
  actors: [],
  settings: {
    get: (mod, key) => (mod === "core" ? 1 : SETTINGS[key])
  },
  i18n: { localize: (k) => k, format: (k) => k },
  itempiles: { API: {} }
};

const { GridPileApp } = await import("../scripts/app.js");

let fallos = 0;
const check = (nombre, cond, extra = "") => {
  if (!cond) fallos++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${nombre}${extra ? " -> " + extra : ""}`);
};

function tienda(sonidos = SONIDOS) {
  return {
    uuid: "Actor.tienda", name: "Tienda", img: "t.webp",
    getFlag: (scope, key) => (scope === "velvet-shopping-experience" ? sonidos[key] : undefined),
    items: { get: () => undefined }
  };
}

const app = new GridPileApp(tienda(), null, { id: "t" });

console.log("");
console.log("Cada sonido en su momento");
reproducidos.length = 0;
app._onFirstRender({}, {});
check("bienvenida al abrir", reproducidos.at(-1)?.src === "/sounds/tienda/hola.ogg",
  reproducidos.at(-1)?.src);

reproducidos.length = 0;
await app.close();
check("despedida al cerrar", reproducidos.at(-1)?.src === "/sounds/tienda/adios.ogg",
  reproducidos.at(-1)?.src);

reproducidos.length = 0;
app._playSound("soundBuy");
check("compra", reproducidos.at(-1)?.src === "/sounds/tienda/moneda.ogg");
app._playSound("soundSell");
check("venta", reproducidos.at(-1)?.src === "/sounds/tienda/venta.ogg");

console.log("");
console.log("Nunca se emite al resto de la mesa");
const todosLocales = reproducidos.every((s) => s.socketOptions === false);
check("socketOptions siempre false", todosLocales,
  JSON.stringify(reproducidos.map((s) => s.socketOptions)));
check("canal de interfaz", reproducidos.every((s) => s.channel === "interface"));
check("no se repite en bucle", reproducidos.every((s) => s.loop === false));

console.log("");
console.log("Volumen");
reproducidos.length = 0;
SETTINGS.soundVolume = 0.5;
app._playSound("soundBuy");
check("respeta el ajuste", reproducidos.at(-1)?.volume === 0.5, String(reproducidos.at(-1)?.volume));

reproducidos.length = 0;
SETTINGS.soundVolume = 0;
app._playSound("soundBuy");
check("a cero no suena nada", reproducidos.length === 0, String(reproducidos.length));
SETTINGS.soundVolume = 0.8;

console.log("");
console.log("Sin sonido configurado no pasa nada");
reproducidos.length = 0;
const muda = new GridPileApp(tienda({}), null, { id: "t2" });
muda._onFirstRender({}, {});
muda._playSound("soundBuy");
check("silencio", reproducidos.length === 0, String(reproducidos.length));

console.log("");
console.log("Una ruta del disco duro no se intenta reproducir");
reproducidos.length = 0;
const mala = new GridPileApp(tienda({ soundBuy: "C:\\sonidos\\moneda.ogg" }), null, { id: "t3" });
mala._playSound("soundBuy");
check("rechazada", reproducidos.length === 0, String(reproducidos.length));

console.log("");
console.log(fallos ? fallos + " FALLOS" : "Los sonidos se comportan");
process.exit(fallos ? 1 : 0);
