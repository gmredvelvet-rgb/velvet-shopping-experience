/**
 * Punto de entrada.
 *
 * El unico enganche real con Item Piles es su hook `preRenderInterface`: si
 * devolvemos `false`, Item Piles no abre su ventana y abrimos la nuestra. No hay
 * monkey-patching en ninguna parte, asi que una actualizacion suya no rompe esto
 * mientras el hook siga existiendo.
 */

import { MODULE_ID, warn } from "./constants.js";
import { GridPileApp, defaultRecipient, pileUsesGrid, toActor } from "./app.js";
import { itemFootprint, normalizeSize } from "./footprints.js";

const PRE_RENDER_INTERFACE = "item-piles-preRenderInterface";

/* -------------------------------------------- */
/*  Ajustes                                     */
/* -------------------------------------------- */

function registerSettings() {
  const rerender = () => {
    for (const app of GridPileApp.openApps.values()) if (app.rendered) app.render();
  };

  const toggle = (key, def, scope = "world") => game.settings.register(MODULE_ID, key, {
    name: `VGP.Settings.${key}.Name`,
    hint: `VGP.Settings.${key}.Hint`,
    scope,
    config: true,
    type: Boolean,
    default: def,
    onChange: rerender
  });

  const number = (key, def, { min, max, step = 1, scope = "world" }) => game.settings.register(MODULE_ID, key, {
    name: `VGP.Settings.${key}.Name`,
    hint: `VGP.Settings.${key}.Hint`,
    scope,
    config: true,
    type: Number,
    range: { min, max, step },
    default: def,
    onChange: rerender
  });

  game.settings.register(MODULE_ID, "backgroundImage", {
    name: "VGP.Settings.backgroundImage.Name",
    hint: "VGP.Settings.backgroundImage.Hint",
    scope: "world",
    config: true,
    type: String,
    default: `modules/${MODULE_ID}/assets/backgrounds/defaultbg.png`,
    filePicker: "image",
    onChange: rerender
  });

  toggle("gridForContainers", true);
  toggle("gridForMerchants", true);
  toggle("gridForPiles", true);
  toggle("strictByDefault", false);
  toggle("bulkyItems", true);
  toggle("showLabels", true);

  number("cellSize", 76, { min: 40, max: 140, scope: "client" });
  number("portraitSize", 168, { min: 80, max: 320, scope: "world" });

  game.settings.register(MODULE_ID, "soundVolume", {
    name: "VGP.Settings.soundVolume.Name",
    hint: "VGP.Settings.soundVolume.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8
  });
  number("pileCols", 10, { min: 2, max: 30 });
  number("pileRows", 6, { min: 2, max: 30 });
  number("actorCols", 10, { min: 2, max: 30 });
  number("actorRows", 6, { min: 2, max: 30 });
}

/* -------------------------------------------- */
/*  Interceptor                                 */
/* -------------------------------------------- */

/** Pilas que, por esta vez, debe abrir Item Piles con su propia interfaz. */
const bypass = new Set();

/**
 * La rejilla no pudo dibujarse. Se avisa en alto y se reabre la pila con la
 * interfaz de Item Piles, marcandola para que el hook la deje pasar. Nunca hay
 * que quedarse sin poder abrir un cofre por culpa de este modulo.
 */
function fallbackToNative(target, inspectingTarget, error) {
  console.error(`${MODULE_ID} | La rejilla fallo al abrirse; se cede a Item Piles.`, error);
  ui.notifications.error(`Velvet Grid Piles: ${error?.message ?? error}`, { permanent: true });
  bypass.add(target.uuid);
  try {
    game.itempiles.API.renderItemPileInterface(target, { inspectingTarget: toActor(inspectingTarget) });
  } catch (nested) {
    bypass.delete(target.uuid);
    warn("Tampoco se pudo abrir la interfaz de Item Piles", nested);
  }
}

function interceptItemPiles() {
  const hookName = game.itempiles?.hooks?.PRE_RENDER_INTERFACE ?? PRE_RENDER_INTERFACE;

  Hooks.on(hookName, (target, inspectingTarget) => {
    if (bypass.delete(target?.uuid)) return; // Reapertura pedida por el fallback.

    let usesGrid = false;
    try {
      usesGrid = pileUsesGrid(target);
    } catch (error) {
      warn("No se pudo decidir si esta pila usa rejilla; se cede a Item Piles", error);
      return undefined; // `undefined` deja pasar a Item Piles.
    }
    if (!usesGrid) return undefined;

    try {
      // `toActor` es obligatorio: el hook entrega `false`, no `null`, cuando no
      // hay personaje inspector, y `??` no lo atrapa.
      GridPileApp.show(target, toActor(inspectingTarget) ?? defaultRecipient(target), {
        onError: (error) => fallbackToNative(target, inspectingTarget, error)
      });
      return false;
    } catch (error) {
      // Fallo sincrono: Item Piles todavia no ha sido cancelado, asi que basta
      // con dejarle continuar su curso normal.
      console.error(`${MODULE_ID} | No se pudo construir la ventana de rejilla.`, error);
      ui.notifications.error(`Velvet Grid Piles: ${error?.message ?? error}`, { permanent: true });
      return undefined;
    }
  });
}

/** Mantiene las ventanas abiertas al dia sin suscribirse a los stores de Svelte. */
function watchDocuments() {
  // Una compra dispara varias actualizaciones seguidas; con el debounce se
  // redibuja una vez al final en vez de una por documento tocado.
  const refresh = foundry.utils.debounce((actor) => GridPileApp.refreshFor(actor), 120);
  const refreshFromItem = (item) => {
    if (item?.parent instanceof Actor) refresh(item.parent);
  };
  Hooks.on("createItem", refreshFromItem);
  Hooks.on("updateItem", refreshFromItem);
  Hooks.on("deleteItem", refreshFromItem);
  Hooks.on("updateActor", (actor) => refresh(actor));
  Hooks.on("deleteActor", (actor) => {
    // Por uuid, igual que el refresco: comparar objetos dejaba abierta la
    // ventana de una tienda ya borrada cuando el actor venia de un token.
    for (const app of GridPileApp.openApps.values()) {
      if (app.pile?.uuid === actor?.uuid) app.close();
    }
  });
}

function watchShiftKey() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Shift") GridPileApp.setShift(true);
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift") GridPileApp.setShift(false);
  });
  window.addEventListener("blur", () => GridPileApp.setShift(false));
}

/* -------------------------------------------- */
/*  API publica                                 */
/* -------------------------------------------- */

/**
 * Fija a mano la huella de un objeto. Escribe tambien los flags de Item Piles
 * para que el mismo objeto ocupe lo mismo dentro de un vault.
 */
async function setItemSize(item, width, height) {
  const size = normalizeSize({ w: width, h: height });
  if (!size) throw new Error("setItemSize | Tamano invalido.");
  return item.update({
    [`flags.${MODULE_ID}.size`]: size,
    "flags.item-piles.item.width": size.w,
    "flags.item-piles.item.height": size.h
  });
}

/**
 * Diagnostico para pegar en la consola cuando algo no abre. Dice si el modulo
 * decide interceptar esta pila y, si lo hace, intenta el render capturando el
 * error real en vez de dejarlo en una promesa rechazada.
 */
async function diagnose(actor) {
  const target = actor ?? canvas?.tokens?.controlled?.[0]?.actor;
  const report = {
    itemPiles: game.modules.get("item-piles")?.version ?? "ausente",
    hookRegistrado: Boolean(Hooks.events?.[PRE_RENDER_INTERFACE]?.length),
    objetivo: target?.name ?? "ninguno (selecciona un token primero)"
  };

  if (target) {
    try {
      report.tipoDePila = game.itempiles.API.getActorFlagData(target)?.type;
      report.usaRejilla = pileUsesGrid(target);
    } catch (error) {
      report.errorAlDecidir = error.message;
    }

    // El fondo se comprueba pidiendolo de verdad al servidor: asi se distingue
    // "la ruta esta mal" de "la imagen no llega".
    try {
      const app = new GridPileApp(target, null, { id: `${MODULE_ID}-sonda` });
      const fondo = app.background;
      report.fondo = fondo || "(ninguno)";
      if (fondo) {
        const url = foundry.utils.getRoute(fondo);
        report.fondoUrl = url;
        const respuesta = await fetch(url, { method: "HEAD" });
        report.fondoCarga = respuesta.ok ? "si" : `NO (${respuesta.status})`;
      }
    } catch (error) {
      report.fondoError = error.message;
    }

    if (report.usaRejilla) {
      try {
        const app = new GridPileApp(target, defaultRecipient(target), { id: `${MODULE_ID}-diagnostico` });
        const html = await app._renderHTML();
        report.render = `correcto (${html.length} caracteres)`;
      } catch (error) {
        report.render = `FALLO: ${error.message}`;
        report.stack = error.stack;
      }
    }
  }

  console.log(`${MODULE_ID} | diagnostico`, report);
  return report;
}

function exposeAPI() {
  game.velvetGridPiles = {
    GridPileApp,
    diagnose,
    open: (pile, recipient) => GridPileApp.show(pile, recipient ?? defaultRecipient(pile)),
    footprintOf: (item) => itemFootprint(item, game.settings.get(MODULE_ID, "bulkyItems")),
    setItemSize,
    /** Borra las posiciones guardadas de un actor y deja que se recoloque solo. */
    resetLayout: (actor) => actor.unsetFlag(MODULE_ID, "layout")
  };
}

/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  if (!game.modules.get("item-piles")?.active) {
    return ui.notifications.error(game.i18n.localize("VGP.Warn.NoItemPiles"));
  }
  interceptItemPiles();
  watchDocuments();
  watchShiftKey();
  exposeAPI();
  console.log(`${MODULE_ID} | Grilla activa sobre Item Piles ${game.modules.get("item-piles").version}`);
});
