/**
 * La ventana de grilla.
 *
 * Dibuja dos paneles enfrentados -- el contenedor o mercader a la izquierda, el
 * personaje a la derecha -- y deja arrastrar objetos entre ambos. Este modulo no
 * mueve ni un solo item por su cuenta: cada transferencia sale por la API de
 * Item Piles, que es quien sabe de permisos, monedas, precios y sockets.
 */

import {
  MODULE_ID, FLAGS, IP_ITEM_FLAGS, IP_ITEM_DATA, IP_PILE_DATA,
  MIN_CELL, MIN_COLS, COMPACT_CELL, api, warn
} from "./constants.js";
import { itemFootprint, primeFootprints } from "./footprints.js";
import { layoutItems, occupantAt } from "./grid.js";
import { ItemDetailApp } from "./item-detail.js";

const OPEN_APPS = new Map();

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character]);

const getProperty = (object, path) => foundry.utils.getProperty(object, path);

const setting = (key) => game.settings.get(MODULE_ID, key);

/**
 * Lee un ajuste de la pila. Se prefiere el accesor de Item Piles porque tambien
 * resuelve el caso de la configuracion guardada en el TokenDocument en vez de en
 * el actor, y porque rellena sus valores por defecto.
 */
function pileFlag(actor, key) {
  try {
    const data = api()?.getActorFlagData?.(actor);
    if (data && key in data) return data[key];
  } catch (error) {
    warn(`No se pudo leer el ajuste "${key}" de la pila`, error);
  }
  return getProperty(actor, `${IP_PILE_DATA}.${key}`);
}

/** Resuelve `"default" | "yes" | "no"` contra el valor de mundo. */
function resolveTriState(actor, flag, worldDefault) {
  const value = actor?.getFlag(MODULE_ID, flag) ?? "default";
  if (value === "yes") return true;
  if (value === "no") return false;
  return worldDefault;
}

export function pileUsesGrid(actor) {
  const API = api();
  if (!API || !actor) return false;
  if (API.isItemPileVault?.(actor)) return false; // Item Piles ya le da grilla.

  const settingByType = {
    merchant: "gridForMerchants",
    container: "gridForContainers"
  };
  const key = settingByType[pileFlag(actor, "type")] ?? "gridForPiles";
  return resolveTriState(actor, FLAGS.USE_GRID, Boolean(setting(key)));
}

function pileIsStrict(actor) {
  return resolveTriState(actor, FLAGS.STRICT, Boolean(setting("strictByDefault")));
}

/**
 * Tamano de la grilla. No se heredan las columnas y filas de Item Piles: son
 * ajustes de vault y su accesor siempre devuelve 10x5 por defecto, con lo que
 * los ajustes de mundo no llegarian a aplicarse nunca.
 */
function gridSizeFor(actor, fallbackCols, fallbackRows) {
  const cols = Number(actor?.getFlag(MODULE_ID, FLAGS.COLS)) || fallbackCols;
  const rows = Number(actor?.getFlag(MODULE_ID, FLAGS.ROWS)) || fallbackRows;
  return { cols: Math.max(2, cols), rows: Math.max(2, rows) };
}

function currencyLine(actor) {
  try {
    const API = api();
    let currencies = API.getActorCurrencies(actor, { getAll: false }) ?? [];

    // Sin monedas la linea desapareceria, y un jugador sin blanca pensaria que
    // el modulo dejo de mostrar su dinero. Mejor ensenar un cero explicito.
    if (!currencies.length) {
      const todas = API.getActorCurrencies(actor, { getAll: true, secondary: false }) ?? [];
      currencies = todas.slice(0, 1);
    }
    if (!currencies.length) return "";
    return currencies.map((currency) => {
      const abbreviation = String(currency.abbreviation ?? "");
      const text = abbreviation.includes("{#}")
        ? abbreviation.replace("{#}", currency.quantity)
        : `${currency.quantity} ${currency.name ?? ""}`;
      const icon = currency.img ? `<img src="${esc(currency.img)}" alt="">` : "";
      return `<span class="vgp-coin" title="${esc(currency.name)}">${icon}${esc(text.trim())}</span>`;
    }).join("");
  } catch (error) {
    warn("No se pudieron leer las monedas", error);
    return "";
  }
}

function priceStringFor(item, seller, buyer) {
  try {
    const priceData = api().getPricesForItem(item, { seller, buyer }) ?? [];
    const primary = priceData.find((entry) => entry.primary) ?? priceData[0];
    if (!primary) return "";
    if (primary.free) return game.i18n.localize("VGP.Free");
    return primary.priceString ?? "";
  } catch {
    return "";
  }
}

/** Convierte la descripcion enriquecida de Item Piles en una linea de texto. */
function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

/* -------------------------------------------- */
/*  Taxonomia de objetos                        */
/* -------------------------------------------- */

/**
 * Grupos canonicos. Se usan los mismos en todos los sistemas para que las
 * pestanas digan "Armaduras" y no "equipment", y para que una tienda se lea
 * igual en D&D 5e que en Pathfinder 2e.
 */
export const GROUPS = Object.freeze({
  WEAPON: "weapon",
  ARMOR: "armor",
  AMMO: "ammo",
  CONSUMABLE: "consumable",
  EQUIPMENT: "equipment",
  CONTAINER: "container",
  TOOL: "tool",
  TREASURE: "treasure",
  MISC: "misc"
});

const GROUP_ORDER = [
  GROUPS.WEAPON, GROUPS.ARMOR, GROUPS.AMMO, GROUPS.CONSUMABLE,
  GROUPS.EQUIPMENT, GROUPS.TOOL, GROUPS.CONTAINER, GROUPS.TREASURE, GROUPS.MISC
];

const GROUP_ICONS = {
  [GROUPS.WEAPON]: "fas fa-khanda",
  [GROUPS.ARMOR]: "fas fa-shield-halved",
  [GROUPS.AMMO]: "fas fa-bullseye",
  [GROUPS.CONSUMABLE]: "fas fa-flask",
  [GROUPS.EQUIPMENT]: "fas fa-hat-cowboy",
  [GROUPS.CONTAINER]: "fas fa-box-open",
  [GROUPS.TOOL]: "fas fa-screwdriver-wrench",
  [GROUPS.TREASURE]: "fas fa-gem",
  [GROUPS.MISC]: "fas fa-cube"
};

/** Subtipos de `equipment` que en D&D 5e son en realidad armadura o escudo. */
const DND5E_ARMOR_TYPES = new Set(["light", "medium", "heavy", "shield", "natural"]);

/**
 * PF2e: tipos fisicos segun `template.json` del sistema. `ammo` es un tipo
 * propio desde PF2e 6, pero las versiones anteriores lo guardaban como
 * `consumable` de categoria "ammo", asi que se contemplan los dos.
 */
function groupForPf2e(item) {
  const type = item?.type;
  const category = String(getProperty(item, "system.category") ?? "").toLowerCase();

  switch (type) {
    case "weapon": return GROUPS.WEAPON;
    case "armor": return GROUPS.ARMOR;
    case "shield": return GROUPS.ARMOR;
    case "ammo": return GROUPS.AMMO;
    case "consumable": return category === "ammo" ? GROUPS.AMMO : GROUPS.CONSUMABLE;
    case "backpack": return GROUPS.CONTAINER;
    case "treasure": return GROUPS.TREASURE;
    case "kit": return GROUPS.EQUIPMENT;
    case "equipment": return GROUPS.EQUIPMENT;
    case "book": return GROUPS.MISC;
    default: return null;
  }
}

/** D&D 5e: la armadura vive dentro de `equipment` y la municion dentro de `consumable`. */
function groupForDnd5e(item) {
  const type = item?.type;
  const subtype = String(
    getProperty(item, "system.type.value") ?? getProperty(item, "system.armor.type") ?? ""
  ).toLowerCase();

  switch (type) {
    case "weapon": return GROUPS.WEAPON;
    case "equipment": return DND5E_ARMOR_TYPES.has(subtype) ? GROUPS.ARMOR : GROUPS.EQUIPMENT;
    case "consumable": return subtype === "ammo" ? GROUPS.AMMO : GROUPS.CONSUMABLE;
    case "container": return GROUPS.CONTAINER;
    case "backpack": return GROUPS.CONTAINER;
    case "tool": return GROUPS.TOOL;
    case "loot": return subtype === "treasure" ? GROUPS.TREASURE : GROUPS.MISC;
    default: return null;
  }
}

/**
 * Reserva para cualquier otro sistema: se reparten por nombre de tipo, y lo que
 * no se reconozca cae en Misceláneo. Nunca se oculta nada: un objeto sin
 * categoria conocida sigue apareciendo en el contenedor.
 */
function groupGeneric(item) {
  const type = String(item?.type ?? "").toLowerCase();
  if (type.includes("weapon")) return GROUPS.WEAPON;
  if (type.includes("armor") || type.includes("shield")) return GROUPS.ARMOR;
  if (type.includes("ammo")) return GROUPS.AMMO;
  if (type.includes("consumable") || type.includes("potion")) return GROUPS.CONSUMABLE;
  if (type.includes("container") || type.includes("backpack")) return GROUPS.CONTAINER;
  if (type.includes("tool") || type.includes("kit")) return GROUPS.TOOL;
  if (type.includes("treasure") || type.includes("currency")) return GROUPS.TREASURE;
  if (type.includes("equipment") || type.includes("gear")) return GROUPS.EQUIPMENT;
  return GROUPS.MISC;
}

/**
 * Grupo de un objeto. La categoria personalizada de Item Piles gana siempre:
 * si el GM se molesto en escribirla, es la que quiere ver.
 */
export function categoryOf(item) {
  const custom = getProperty(item, `${IP_ITEM_DATA}.customCategory`);
  if (custom) return `custom:${custom}`;

  const bySystem = { pf2e: groupForPf2e, dnd5e: groupForDnd5e }[game.system?.id];
  return (bySystem ? bySystem(item) : null) ?? groupGeneric(item);
}

export function categoryLabel(value) {
  if (value.startsWith("custom:")) return value.slice(7);
  const key = `VGP.Group.${value}`;
  const label = game.i18n.localize(key);
  if (label !== key) return label;

  // Un sistema exotico puede traer un tipo que no tengamos traducido; se usa
  // entonces la etiqueta del propio sistema antes que enseñar la clave cruda.
  const systemLabel = CONFIG?.Item?.typeLabels?.[value];
  return systemLabel ? game.i18n.localize(systemLabel) : value;
}

export function categoryIcon(value) {
  return value.startsWith("custom:") ? "fas fa-star" : (GROUP_ICONS[value] ?? GROUP_ICONS[GROUPS.MISC]);
}

/**
 * Pestanas presentes en un inventario, en orden de juego (armas, armaduras,
 * municion...) y con las categorias personalizadas al final.
 */
export function categoriesOf(items) {
  const seen = new Map();
  for (const item of items) {
    const value = categoryOf(item);
    if (!seen.has(value)) seen.set(value, [value, categoryLabel(value), categoryIcon(value)]);
  }
  const rank = (value) => {
    const index = GROUP_ORDER.indexOf(value);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...seen.values()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[1].localeCompare(b[1]));
}

/* -------------------------------------------- */
/*  Rareza                                      */
/* -------------------------------------------- */

/**
 * Rarezas conocidas, en el orden de escalada habitual. La clave es el valor en
 * minusculas -- que es como llegan de los dos sistemas -- y el valor es el
 * nombre canonico que usan las clases CSS.
 */
const RARITIES = new Map([
  ["uncommon", "uncommon"],
  ["rare", "rare"],
  ["veryrare", "veryRare"],
  ["legendary", "legendary"],
  ["artifact", "artifact"],
  ["unique", "unique"]
]);

/**
 * Rareza del objeto, normalizada. D&D 5e la guarda en `system.rarity` como
 * "veryRare"; PF2e la lleva de rasgo en `system.traits.rarity`. "common" no
 * devuelve nada: marcar lo corriente no aporta informacion.
 */
export function rarityOf(item) {
  const raw = String(
    getProperty(item, "system.rarity") ?? getProperty(item, "system.traits.rarity") ?? ""
  ).replace(/[\s_-]+/g, "").toLowerCase();
  return raw ? (RARITIES.get(raw) ?? null) : null;
}

function matchesFilters(item, { query, category }) {
  if (category && category !== "all" && categoryOf(item) !== category) return false;
  if (!query) return true;
  return String(item?.name ?? "").toLowerCase().includes(query.toLowerCase());
}

function costOf(item) {
  try {
    return Number(api().getCostOfItem(item)) || 0;
  } catch {
    return 0;
  }
}

function sortItems(items, mode) {
  const sorted = [...items];
  switch (mode) {
    case "name":
      return sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    case "priceAsc":
      return sorted.sort((a, b) => costOf(a) - costOf(b));
    case "priceDesc":
      return sorted.sort((a, b) => costOf(b) - costOf(a));
    case "type":
      return sorted.sort((a, b) => categoryLabel(categoryOf(a)).localeCompare(categoryLabel(categoryOf(b)))
        || String(a.name).localeCompare(String(b.name)));
    default:
      return sorted; // "manual": manda la posicion guardada.
  }
}

/**
 * Conecta los botones de lupa del dialogo de ajustes con el selector de
 * archivos de Foundry, para que el GM elija el decorado sin escribir rutas.
 */
function bindImagePickers(root) {
  if (!root?.querySelectorAll) return;
  const FilePicker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FilePicker) return;

  for (const button of root.querySelectorAll(".vgp-browse")) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const input = root.querySelector(`[name="${button.dataset.target}"]`);
      if (!input) return;
      new FilePicker({
        type: button.dataset.kind === "audio" ? "audio" : "image",
        current: input.value,
        callback: (path) => { input.value = path; }
      }).browse();
    });
  }
}

/**
 * Ruta servible desde la raiz del servidor. `getRoute` respeta el prefijo de
 * ruta si el mundo se sirve bajo uno, cosa que una ruta relativa no haria.
 */
function routeFor(path) {
  try {
    return foundry.utils.getRoute(path);
  } catch {
    return path;
  }
}

/** Rutas que el navegador no puede pedirle a Foundry por mucho que existan. */
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/|file:)/;

const WARNED = new Set();

/**
 * Comprueba que una imagen se pueda servir.
 *
 * Foundry solo publica lo que hay dentro de su carpeta de datos, asi que una
 * ruta del disco -- "C:\Users\...\fondo.png" -- nunca cargara por mucho que el
 * archivo exista. Antes esto fallaba en silencio y el fondo simplemente no
 * aparecia; ahora se avisa una vez y se explica que hay que hacer.
 */
function usablePath(path, kind) {
  const value = String(path ?? "").trim();
  if (!value) return "";

  if (ABSOLUTE_PATH.test(value)) {
    const key = `${kind}:${value}`;
    if (!WARNED.has(key) && game.user.isGM) {
      WARNED.add(key);
      ui.notifications.error(game.i18n.format("VGP.Warn.AbsolutePath", { path: value }), { permanent: true });
      warn(`Ruta fuera de la carpeta de datos de Foundry: ${value}`);
    }
    return "";
  }

  // Las barras invertidas sobreviven a un copiar y pegar de Windows.
  return value.replaceAll("\\", "/");
}

/** Reconstruye la ocupacion a partir de las casillas ya calculadas. */
function layoutOccupancy(side) {
  const occupancy = new Array(side.cols * side.rows).fill(null);
  for (const tile of side.tiles) {
    for (let dy = 0; dy < tile.h; dy++) {
      for (let dx = 0; dx < tile.w; dx++) {
        const index = (tile.y + dy) * side.cols + (tile.x + dx);
        if (index >= 0 && index < occupancy.length) occupancy[index] = tile.id;
      }
    }
  }
  return occupancy;
}

/**
 * Normaliza lo que llega desde Item Piles a un Actor o a `null`.
 *
 * Su hook entrega `false` -- no `null` -- cuando no hay personaje inspector, y
 * `?.` solo corta con `null` y `undefined`, asi que `false?.getFlag()` explota.
 * Ademas `fromUuidSync` puede devolver un TokenDocument en lugar de un Actor.
 */
export function toActor(candidate) {
  if (!candidate) return null;
  if (candidate.documentName === "Actor") return candidate;
  if (candidate.actor) return candidate.actor; // Token o TokenDocument
  return typeof candidate.getFlag === "function" ? candidate : null;
}

/**
 * A quien le entra el botin si nadie lo dice. El GM se queda sin destinatario a
 * proposito: es duenno de todos los actores del mundo y adivinar significaria
 * meterle el botin al primer PNJ de la lista.
 */
export function defaultRecipient(pile = null) {
  const notThePile = (actor) => actor && actor !== pile && actor.uuid !== pile?.uuid;

  // Tener seleccionado el token del mercader no significa querer venderte a ti
  // mismo: si el candidato es la propia pila, no sirve.
  const controlled = canvas?.tokens?.controlled?.[0]?.actor;
  if (controlled?.isOwner && notThePile(controlled)) return controlled;
  if (game.user.character?.isOwner && notThePile(game.user.character)) return game.user.character;
  if (game.user.isGM) return null;
  return game.actors.find((actor) => actor.isOwner && actor.hasPlayerOwner && notThePile(actor)) ?? null;
}

/* -------------------------------------------- */

const ApplicationV2 = foundry.applications?.api?.ApplicationV2;

export class GridPileApp extends (ApplicationV2 ?? Application) {
  static DEFAULT_OPTIONS = {
    classes: ["vgp-window"],
    window: {
      title: "VGP.Title",
      icon: "fas fa-grip",
      resizable: true,
      // En la barra de titulo, con etiqueta: el engranaje del divisor es
      // diminuto y nadie encuentra ahi los ajustes del decorado.
      controls: [{
        icon: "fas fa-image",
        label: "VGP.Configure",
        action: "vgpConfigure",
        visible: () => game.user.isGM
      }]
    },
    actions: {
      vgpConfigure(event) {
        event.preventDefault();
        return this._configure();
      }
    },
    position: { width: 940, height: 620 }
  };

  constructor(pile, recipient, options = {}) {
    super(options);
    this.pile = toActor(pile);
    this.recipient = toActor(recipient);
    this.interactionId = foundry.utils.randomID();
    this._scroll = {};
    this._shiftHeld = false;
  }

  get title() {
    return this.shopName || this.pile?.name || game.i18n.localize("VGP.Title");
  }

  get isMerchant() { return Boolean(api()?.isItemPileMerchant?.(this.pile)); }

  /* ---------------------------------------- */
  /*  Ciclo de vida                           */
  /* ---------------------------------------- */

  /**
   * @param {Actor} pile                  La pila, contenedor o mercader.
   * @param {Actor|null} recipient        Quien recibe los objetos.
   * @param {object} [options]
   * @param {Function} [options.onError]  Se llama si el render falla. El hook lo
   *                                      usa para devolverle el mando a Item
   *                                      Piles: si nuestra ventana no sale,
   *                                      nadie se queda sin poder abrir el cofre.
   */
  static show(pile, recipient, { onError } = {}) {
    const key = pile.uuid;
    const existing = OPEN_APPS.get(key);
    if (existing?.rendered) {
      const normalized = toActor(recipient);
      if (normalized && normalized.uuid !== pile.uuid) existing.recipient = normalized;
      existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    const chosen = toActor(recipient);
    const recipientActor = (chosen && chosen.uuid !== pile.uuid) ? chosen : defaultRecipient(pile);
    const app = new GridPileApp(pile, recipientActor, {
      id: `${MODULE_ID}-${String(key).replaceAll(".", "-")}`
    });
    OPEN_APPS.set(key, app);

    // `render` es asincrono: sin este catch un fallo seria una promesa rechazada
    // silenciosa y la ventana no aparecera nunca.
    Promise.resolve(app.render({ force: true })).catch((error) => {
      OPEN_APPS.delete(key);
      app.close?.().catch(() => {});
      onError?.(error);
    });
    return app;
  }

  static get openApps() { return OPEN_APPS; }

  /** Redibuja las ventanas abiertas afectadas por un actor concreto. */
  static refreshFor(actor) {
    if (!actor) return;
    // Por uuid y no por identidad: el actor sintetico de un token puede llegar
    // como un objeto distinto, y entonces el saldo se quedaria sin actualizar.
    const uuid = actor.uuid;
    for (const app of OPEN_APPS.values()) {
      if (!app.rendered) continue;
      if (app.pile?.uuid === uuid || app.recipient?.uuid === uuid) app.render();
    }
  }

  static setShift(held) {
    for (const app of OPEN_APPS.values()) app._shiftHeld = held;
  }

  /** Primer pintado: es cuando el mercader te saluda, no en cada redibujado. */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._playSound(FLAGS.SOUND_WELCOME);
  }

  async close(options) {
    this._resizeObserver?.disconnect();
    this._playSound(FLAGS.SOUND_FAREWELL);
    OPEN_APPS.delete(this.pile?.uuid);
    return super.close(options);
  }

  /* ---------------------------------------- */
  /*  Datos                                   */
  /* ---------------------------------------- */

  /** Estado de busqueda, categoria y orden de un panel. */
  _filtersFor(key) {
    this._filters ??= {
      source: { query: "", category: "all", sort: "manual" },
      target: { query: "", category: "all", sort: "manual" }
    };
    return this._filters[key];
  }

  /** Objetos visibles de un actor, ya filtrados, ordenados y colocados. */
  async _sideData(actor, { isPile }) {
    const API = api();
    const key = isPile ? "source" : "target";
    const filters = this._filtersFor(key);
    const bulky = setting("bulkyItems");
    const strict = isPile ? pileIsStrict(this.pile) : false;

    let items = actor ? (API.getActorItems(actor) ?? []) : [];
    if (isPile && this.isMerchant && !game.user.isGM) {
      items = items.filter((item) => !getProperty(item, IP_ITEM_FLAGS.HIDDEN));
    }

    // Las pestanas se construyen con lo que hay de verdad en el inventario, no
    // con todos los tipos del sistema: una tienda de armas no necesita mostrar
    // una pestana de pociones vacia.
    const categories = categoriesOf(items);
    const visible = items.filter((item) => matchesFilters(item, filters));

    await primeFootprints(visible);

    const entries = sortItems(visible, filters.sort).map((item) => {
      const { w, h } = itemFootprint(item, bulky);
      return { id: item.id, item, w, h };
    });

    const fallbackCols = isPile ? setting("pileCols") : setting("actorCols");
    const fallbackRows = isPile ? setting("pileRows") : setting("actorRows");
    const configured = gridSizeFor(isPile ? this.pile : null, fallbackCols, fallbackRows);
    const cols = this._effectiveCols(key, configured.cols);
    const rows = configured.rows;

    // Un orden explicito manda sobre las posiciones guardadas: si el jugador
    // pide "por precio", quiere verlo por precio, no su propia colocacion.
    const saved = filters.sort === "manual"
      ? ((actor ? actor.getFlag(MODULE_ID, FLAGS.LAYOUT) : null) ?? {})
      : {};

    const layout = layoutItems(entries, {
      cols, rows, saved, strict,
      preserveOrder: filters.sort !== "manual"
    });

    return {
      actor,
      isPile,
      key,
      filters,
      categories,
      editable: Boolean(actor?.isOwner),
      total: items.length,
      cols: layout.cols,
      rows: layout.rows,
      configuredCols: configured.cols,
      tiles: layout.tiles,
      overflow: layout.overflow,
      currencies: actor ? currencyLine(actor) : ""
    };
  }

  /* ---------------------------------------- */
  /*  Ajuste al ancho disponible               */
  /* ---------------------------------------- */

  /**
   * Columnas que caben de verdad en el panel.
   *
   * La grilla nunca debe desbordarse a lo ancho: si lo hace, el navegador corta
   * por los dos lados y quedan objetos inalcanzables. Asi que se recorta el
   * numero de columnas hasta que la casilla no baje del minimo legible, y a
   * partir de ahi la grilla solo crece hacia abajo.
   */
  _effectiveCols(key, configured) {
    const width = this._widths?.[key];
    if (!width) return configured;
    const fit = Math.floor(width / MIN_CELL);
    return Math.max(MIN_COLS, Math.min(configured, fit));
  }

  /**
   * Lado de casilla para un panel ya medido, en pixeles enteros.
   *
   * `MIN_CELL` gobierna cuantas columnas se permiten, pero no el tamano final:
   * en un panel muy estrecho, con el minimo de columnas ya puesto, la casilla
   * tiene que encoger por debajo de ese minimo. Caber es obligatorio; el tamano
   * comodo es solo una preferencia.
   */
  _cellSizeFor(key, cols) {
    const preferred = setting("cellSize");
    const width = this._widths?.[key];
    if (!width || !cols) return preferred;
    return Math.max(1, Math.min(preferred, Math.floor(width / cols)));
  }

  /**
   * Mide los paneles y estira la casilla para llenar el ancho exacto. Solo se
   * vuelve a dibujar si cambia el numero de columnas; el resto son estilos.
   */
  _fitGrids(root) {
    const scope = root ?? this.element;
    if (!scope) return;
    this._widths ??= {};
    let needsRender = false;

    for (const wrap of scope.querySelectorAll(".vgp-grid-wrap")) {
      const key = wrap.dataset.side;
      const styles = getComputedStyle(wrap);
      const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const width = Math.max(0, wrap.clientWidth - padding);
      if (!width) continue;

      const previous = this._widths[key];
      this._widths[key] = width;

      const grid = wrap.querySelector(".vgp-grid");
      if (!grid) continue;

      const drawnCols = Number(grid.dataset.cols) || 1;
      const configured = this._sides?.[key]?.configuredCols ?? drawnCols;
      if (previous !== width && this._effectiveCols(key, configured) !== drawnCols) {
        needsRender = true;
        continue;
      }
      const cell = this._cellSizeFor(key, drawnCols);
      grid.style.setProperty("--vgp-cell", `${cell}px`);
      // Con la casilla pequena la etiqueta se comeria el icono: mejor solo arte.
      grid.classList.toggle("is-compact", cell < COMPACT_CELL);
    }

    if (needsRender) this._scheduleRender();
  }

  _scheduleRender() {
    this._debouncedRender ??= foundry.utils.debounce(() => this.render(), 120);
    this._debouncedRender();
  }

  /** Redimensionar la ventana debe recolocar la grilla, no cortarla. */
  _watchResize(root) {
    this._resizeObserver?.disconnect();
    if (typeof ResizeObserver !== "function") return;
    this._resizeObserver = new ResizeObserver(() => this._fitGrids());
    for (const wrap of root.querySelectorAll(".vgp-grid-wrap")) this._resizeObserver.observe(wrap);
  }

  /* ---------------------------------------- */
  /*  Render                                  */
  /* ---------------------------------------- */

  async _renderHTML() {
    const source = await this._sideData(this.pile, { isPile: true });
    const target = await this._sideData(this.recipient, { isPile: false });
    this._sides = { source, target };
    return this._markup(source, target);
  }

  _replaceHTML(result, element) {
    this._rememberScroll(element);
    element.innerHTML = result;
    this._bind(element);
    this._restoreScroll(element);
    this._restoreFocus(element);
    this._fitGrids(element);
    this._watchResize(element);
    return element;
  }

  // ApplicationV1 de respaldo, por si se abre en un Foundry sin V2.
  async _renderInner() {
    const html = await this._renderHTML();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    this._bind(wrapper);
    return $(wrapper);
  }

  _rememberScroll(element) {
    for (const wrap of element.querySelectorAll(".vgp-grid-wrap")) {
      this._scroll[wrap.dataset.side] = wrap.scrollTop;
    }
  }

  _restoreScroll(element) {
    for (const wrap of element.querySelectorAll(".vgp-grid-wrap")) {
      const saved = this._scroll[wrap.dataset.side];
      if (saved) wrap.scrollTop = saved;
    }
  }

  /** Escribir en el buscador redibuja; sin esto se perderia el foco a cada letra. */
  _restoreFocus(element) {
    const focus = this._focus;
    // Se consume: si no, cualquier redibujado posterior -- una compra, un
    // objeto que cambia -- volveria a robarle el foco al buscador.
    this._focus = null;
    if (!focus) return;

    const input = element.querySelector(`.vgp-search[data-side="${focus.side}"]`);
    if (!input) return;
    input.focus();
    const caret = focus.caret ?? input.value.length;
    input.setSelectionRange(caret, caret);
  }

  /**
   * Reproduce uno de los sonidos de la tienda.
   *
   * Solo aqui: `AudioHelper.play` con `socketOptions` en false no emite por
   * websocket, asi que lo oye quien esta usando la tienda y nadie mas. Una mesa
   * entera escuchando la campanilla de cada compra ajena seria insoportable.
   */
  _playSound(flag) {
    const raw = this.pile?.getFlag(MODULE_ID, flag);
    const src = usablePath(raw, "sound");
    if (!src) return;

    const volume = Number(setting("soundVolume"));
    if (!(volume > 0)) return;

    try {
      foundry.audio.AudioHelper.play({
        src: routeFor(src),
        volume: volume * (game.settings.get("core", "globalInterfaceVolume") ?? 1),
        autoplay: true,
        loop: false,
        channel: "interface"
      }, false); // false = no se emite a los demas clientes.
    } catch (error) {
      warn(`No se pudo reproducir "${src}"`, error);
    }
  }

  /** Rotulo de la tienda. Vacio deja el nombre del actor. */
  get shopName() {
    return String(this.pile?.getFlag(MODULE_ID, FLAGS.SHOP_NAME) ?? "").trim();
  }

  /** Quien atiende. Vacio deja el rol ("Mercader", "Contenedor"). */
  get vendorName() {
    return String(this.pile?.getFlag(MODULE_ID, FLAGS.VENDOR_NAME) ?? "").trim();
  }

  /**
   * Decorado de esta tienda. El fondo propio de la pila manda sobre el del
   * mundo: es lo que permite que la herreria y la botica no se parezcan.
   */
  get background() {
    const raw = this.pile?.getFlag(MODULE_ID, FLAGS.BACKGROUND) || setting("backgroundImage") || "";
    return usablePath(raw, "background");
  }

  _markup(source, target) {
    const cell = setting("cellSize");
    const background = this.background;
    const portrait = setting("portraitSize");
    // Solo numeros en el atributo. La ruta de la imagen se aplica despues con
    // setProperty: un `url("...")` dentro de style="..." cierra el atributo con
    // sus propias comillas y anula la variable entera.
    const style = [
      `--vgp-cell:${cell}px`,
      `--vgp-portrait:${portrait}px`,
      `--vgp-portrait-max:${Math.round(portrait * 1.6)}px`
    ].join(";");

    // Una <img> de verdad, no una variable CSS con url() dentro: el `src` de un
    // atributo HTML se resuelve contra el documento y no depende de donde se
    // haya declarado una custom property ni de la base de la hoja de estilos.
    const scene = background
      ? `<img class="vgp-scene-layer" src="${esc(routeFor(background))}" alt="">`
      : "";

    return `
      <div class="vgp-root${background ? " has-scene" : ""}" style="${style}">
        ${scene}
        ${this._panelMarkup(source)}
        <div class="vgp-divider">
          <i class="fas fa-right-left"></i>
          ${this._dividerButtons()}
        </div>
        ${this._panelMarkup(target)}
      </div>`;
  }

  _dividerButtons() {
    const takeAll = this.recipient && !this.isMerchant ? `
      <button type="button" class="vgp-mini" data-vgp-action="take-all"
              title="${esc(game.i18n.localize("VGP.TakeAll"))}">
        <i class="fas fa-hand-holding"></i>
      </button>` : "";
    const configure = game.user.isGM ? `
      <button type="button" class="vgp-mini" data-vgp-action="configure"
              title="${esc(game.i18n.localize("VGP.Configure"))}">
        <i class="fas fa-sliders"></i>
      </button>` : "";
    return takeAll + configure;
  }

  /** Cabecera de escena: retrato grande, identidad y cita, como un mostrador. */
  _sceneMarkup(side) {
    const isSource = side.key === "source";
    const actor = side.actor;
    const portrait = isSource
      ? (usablePath(this.pile?.getFlag(MODULE_ID, FLAGS.PORTRAIT), "portrait")
        || pileFlag(this.pile, "merchantImage")
        || actor?.img)
      : actor?.img;

    const defaultRole = isSource
      ? game.i18n.localize(this.isMerchant ? "VGP.Merchant" : "VGP.Container")
      : game.i18n.localize("VGP.Yours");
    const role = isSource ? (this.vendorName || defaultRole) : defaultRole;

    const quote = isSource ? plainText(pileFlag(this.pile, "description")) : "";
    const defaultName = actor?.name ?? game.i18n.localize("VGP.NoCharacter");
    const name = isSource ? (this.shopName || defaultName) : defaultName;

    return `
      <header class="vgp-scene-head">
        <div class="vgp-portrait">
          ${portrait ? `<img src="${esc(portrait)}" alt="">` : `<i class="fas fa-user-slash"></i>`}
        </div>
        <div class="vgp-ident">
          <h2>${esc(name)}</h2>
          <span class="vgp-role">${esc(role)}</span>
          ${quote ? `<p class="vgp-quote">&ldquo;${esc(quote)}&rdquo;</p>` : ""}
        </div>
        <div class="vgp-currencies">${side.currencies}</div>
      </header>`;
  }

  /** Pestanas de categoria, construidas con los tipos presentes. */
  _tabsMarkup(side) {
    if (side.categories.length <= 1) return "";
    const tabs = [["all", game.i18n.localize("VGP.All"), "fas fa-border-all"], ...side.categories];
    return `
      <nav class="vgp-tabs">
        ${tabs.map(([value, label, icon]) => `
          <button type="button" class="vgp-tab${side.filters.category === value ? " is-active" : ""}"
                  data-vgp-filter="category" data-side="${side.key}" data-value="${esc(value)}">
            <i class="${esc(icon ?? categoryIcon(value))}"></i>
            <span>${esc(label)}</span>
          </button>`).join("")}
      </nav>`;
  }

  _toolbarMarkup(side) {
    const sorts = [
      ["manual", "VGP.Sort.Manual"],
      ["type", "VGP.Sort.Type"],
      ["name", "VGP.Sort.Name"],
      ["priceAsc", "VGP.Sort.PriceAsc"],
      ["priceDesc", "VGP.Sort.PriceDesc"]
    ];
    return `
      <div class="vgp-toolbar">
        <label class="vgp-search-wrap">
          <i class="fas fa-magnifying-glass"></i>
          <input type="search" class="vgp-search" data-side="${side.key}"
                 value="${esc(side.filters.query)}"
                 placeholder="${esc(game.i18n.localize("VGP.Search"))}">
        </label>
        <select class="vgp-sort" data-vgp-filter="sort" data-side="${side.key}">
          ${sorts.map(([value, key]) => `
            <option value="${value}" ${side.filters.sort === value ? "selected" : ""}>
              ${esc(game.i18n.localize(key))}
            </option>`).join("")}
        </select>
      </div>`;
  }

  _panelMarkup(side) {
    const overflow = side.overflow.length
      ? `<span class="vgp-overflow">${esc(game.i18n.format("VGP.Overflow", { count: side.overflow.length }))}</span>`
      : "";

    const picker = side.key === "target" ? `
      <button type="button" class="vgp-mini vgp-picker" data-vgp-action="pick-actor">
        <i class="fas fa-user"></i> ${esc(game.i18n.localize("VGP.PickCharacter"))}
      </button>` : "";

    const empty = side.tiles.length ? "" : `
      <p class="vgp-empty">${esc(game.i18n.localize(
        side.total ? "VGP.NoMatches" : "VGP.Empty"
      ))}</p>`;

    return `
      <section class="vgp-panel" data-side="${side.key}">
        ${this._sceneMarkup(side)}
        <div class="vgp-frame">
          ${this._tabsMarkup(side)}
          ${this._toolbarMarkup(side)}
          <div class="vgp-grid-wrap" data-side="${side.key}">
            <div class="vgp-grid" data-side="${side.key}" data-cols="${side.cols}" data-rows="${side.rows}"
                 data-uuid="${esc(side.actor?.uuid ?? "")}"
                 style="--cols:${side.cols};--rows:${side.rows}">
              ${side.tiles.map((tile) => this._tileMarkup(tile, side.key)).join("")}
            </div>
            ${empty}
          </div>
        </div>
        <footer class="vgp-panel-foot">
          ${overflow}
          ${picker}
        </footer>
      </section>`;
  }

  _tileMarkup(tile, key) {
    const item = tile.item;
    const quantity = api().getItemQuantity?.(item) ?? 1;
    const notForSale = Boolean(getProperty(item, IP_ITEM_FLAGS.NOT_FOR_SALE));
    const hiddenItem = Boolean(getProperty(item, IP_ITEM_FLAGS.HIDDEN));

    // El mercader siempre es la contraparte: vende en su panel, compra en el tuyo.
    // Sin personaje elegido se sigue mostrando el precio de venta: saber cuanto
    // cuesta algo no deberia depender de haber elegido comprador.
    let price = "";
    if (this.isMerchant) {
      const seller = key === "source" ? this.pile : this.recipient;
      const buyer = key === "source" ? this.recipient : this.pile;
      if (seller) price = priceStringFor(item, seller, buyer ?? undefined);
    }

    const rarity = rarityOf(item);
    const classes = ["vgp-tile"];
    if (notForSale) classes.push("is-locked");
    if (hiddenItem) classes.push("is-hidden-item");
    if (rarity) classes.push(`is-${rarity.toLowerCase()}`);

    const tooltip = quantity > 1 ? `${item.name} &times;${quantity}` : item.name;
    const label = setting("showLabels") ? `
      <span class="vgp-label">
        <span class="vgp-name">${esc(item.name)}</span>
        ${price ? `<span class="vgp-price">${esc(price)}</span>` : ""}
      </span>` : (price ? `<span class="vgp-price is-floating">${esc(price)}</span>` : "");

    return `
      <div class="${classes.join(" ")}" draggable="true"
           data-item-id="${esc(item.id)}" data-side="${key}"
           data-w="${tile.w}" data-h="${tile.h}"
           style="--x:${tile.x};--y:${tile.y};--w:${tile.w};--h:${tile.h}"
           data-tooltip="${esc(tooltip)}">
        <span class="vgp-tile-art"><img src="${esc(item.img)}" alt="" draggable="false"></span>
        ${quantity > 1 ? `<span class="vgp-qty">${quantity}</span>` : ""}
        ${notForSale ? `<i class="fas fa-lock vgp-lock"></i>` : ""}
        ${label}
      </div>`;
  }

  /* ---------------------------------------- */
  /*  Eventos                                 */
  /* ---------------------------------------- */

  _bind(root) {
    for (const button of root.querySelectorAll("[data-vgp-action]")) {
      button.addEventListener("click", (event) => this._onAction(event, button.dataset.vgpAction));
    }

    for (const tile of root.querySelectorAll(".vgp-tile")) {
      tile.addEventListener("dragstart", (event) => {
        this._dragged = true;
        this._onDragStart(event, tile);
      });
      tile.addEventListener("dragend", () => {
        // Soltar fuera de una grilla no dispara `drop`, asi que sin esto el
        // arrastre abandonado seguia vivo: el siguiente objeto que entrase en
        // la ventana se tomaria por aquel y se moveria el que no era.
        this._dragging = null;
        this._clearGhosts(root);
      });
      // Un arrastre empieza con un mousedown igual que un clic: sin esta marca,
      // soltar un objeto abriria ademas su ficha.
      tile.addEventListener("mousedown", () => { this._dragged = false; });
      tile.addEventListener("click", (event) => {
        if (this._dragged) return;
        this._onInspect(event, tile);
      });
      tile.addEventListener("contextmenu", (event) => this._onInspect(event, tile));
    }

    for (const control of root.querySelectorAll("[data-vgp-filter]")) {
      const event = control.tagName === "SELECT" ? "change" : "click";
      control.addEventListener(event, () => {
        const filters = this._filtersFor(control.dataset.side);
        filters[control.dataset.vgpFilter] = control.dataset.value ?? control.value;
        this._focus = null;
        this.render();
      });
    }

    for (const search of root.querySelectorAll(".vgp-search")) {
      search.addEventListener("input", () => {
        const side = search.dataset.side;
        this._filtersFor(side).query = search.value;
        // El foco se recupera tras el redibujado; sin esto se perderia por letra.
        this._focus = { side, caret: search.selectionStart };
        this._scheduleRender();
      });
    }

    for (const grid of root.querySelectorAll(".vgp-grid")) {
      grid.addEventListener("dragover", (event) => this._onDragOver(event, grid));
      grid.addEventListener("dragleave", (event) => {
        if (!grid.contains(event.relatedTarget)) this._clearGhosts(grid);
      });
      grid.addEventListener("drop", (event) => this._onDrop(event, grid));
    }
  }

  _cellAt(event, grid) {
    const rect = grid.getBoundingClientRect();
    const cols = Number(grid.dataset.cols) || 1;
    // El lado real sale del ancho pintado: el ajuste es solo una preferencia.
    const cell = rect.width / cols;
    const rows = Number(grid.dataset.rows) || 1;
    const x = Math.floor((event.clientX - rect.left) / cell);
    const y = Math.floor((event.clientY - rect.top) / cell);
    return {
      x: Math.max(0, Math.min(cols - 1, x)),
      y: Math.max(0, Math.min(rows - 1, y))
    };
  }

  _onDragStart(event, tile) {
    const payload = {
      module: MODULE_ID,
      side: tile.dataset.side,
      itemId: tile.dataset.itemId,
      w: Number(tile.dataset.w) || 1,
      h: Number(tile.dataset.h) || 1
    };
    this._dragging = payload;
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    tile.classList.add("is-dragging");
  }

  _onDragOver(event, grid) {
    event.preventDefault();
    const payload = this._dragging;
    if (!payload) return;

    const { x, y } = this._cellAt(event, grid);
    const cols = Number(grid.dataset.cols) || 1;
    const rows = Number(grid.dataset.rows) || 1;
    const w = Math.min(payload.w, cols);
    const h = Math.min(payload.h, rows);
    const clampedX = Math.min(x, cols - w);
    const clampedY = Math.min(y, rows - h);

    let ghost = grid.querySelector(".vgp-ghost");
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "vgp-ghost";
      grid.appendChild(ghost);
    }
    ghost.style.setProperty("--x", clampedX);
    ghost.style.setProperty("--y", clampedY);
    ghost.style.setProperty("--w", w);
    ghost.style.setProperty("--h", h);
  }

  _clearGhosts(root) {
    const scope = root?.closest?.(".vgp-root") ?? root;
    for (const ghost of scope.querySelectorAll(".vgp-ghost")) ghost.remove();
    for (const tile of scope.querySelectorAll(".is-dragging")) tile.classList.remove("is-dragging");
  }

  async _onDrop(event, grid) {
    event.preventDefault();
    const targetSide = grid.dataset.side;
    const cell = this._cellAt(event, grid);
    const payload = this._dragging;
    this._clearGhosts(grid);
    this._dragging = null;

    if (!payload) return this._onExternalDrop(event, grid, cell);
    if (payload.module !== MODULE_ID) return;

    if (payload.side === targetSide) return this._moveWithinPanel(payload, targetSide, cell);
    return this._transferBetweenPanels(payload, targetSide, cell);
  }

  /** Reordenar dentro del mismo panel: solo cambia el flag de posicion. */
  async _moveWithinPanel(payload, side, cell) {
    const data = this._sides?.[side];
    if (!data?.editable) {
      return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoPermission"));
    }

    const layout = foundry.utils.deepClone(data.actor.getFlag(MODULE_ID, FLAGS.LAYOUT) ?? {});
    const w = payload.w;
    const h = payload.h;
    const x = Math.max(0, Math.min(data.cols - w, cell.x));
    const y = Math.max(0, Math.min(data.rows - h, cell.y));

    // Si la casilla de destino ya la ocupa otro objeto se intercambian, que es
    // lo que espera cualquiera que haya jugado algo con inventario en rejilla.
    const occupant = occupantAt(layoutOccupancy(data), data.cols, data.rows, x, y);
    if (occupant && occupant !== payload.itemId) {
      const moving = data.tiles.find((tile) => tile.id === payload.itemId);
      const other = data.tiles.find((tile) => tile.id === occupant);
      if (!moving || !other || other.w !== moving.w || other.h !== moving.h) return;
      layout[occupant] = { x: moving.x, y: moving.y };
    }

    layout[payload.itemId] = { x, y };
    await data.actor.setFlag(MODULE_ID, FLAGS.LAYOUT, layout);
    this.render();
  }

  /** Motivo por el que un objeto no puede cruzar de panel, o `null` si puede. */
  _blockedReason(payload, item) {
    if (this.isMerchant && payload.side === "target" && pileFlag(this.pile, "purchaseOnly")) {
      return "VGP.Warn.PurchaseOnly";
    }
    if (payload.side === "source" && getProperty(item, IP_ITEM_FLAGS.NOT_FOR_SALE)) {
      return "VGP.Warn.NotForSale";
    }
    return null;
  }

  /** Cruzar de panel: compra, venta o transferencia segun el tipo de pila. */
  async _transferBetweenPanels(payload, targetSide, cell) {
    const API = api();
    const from = payload.side === "source" ? this.pile : this.recipient;
    const to = payload.side === "source" ? this.recipient : this.pile;
    if (!from || !to) return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoCharacter"));

    const item = from.items.get(payload.itemId);
    if (!item) return;

    const blocked = this._blockedReason(payload, item);
    if (blocked) return ui.notifications.warn(game.i18n.localize(blocked));

    const available = API.getItemQuantity?.(item) ?? 1;
    const quantity = await this._askQuantity(item, available, { isPurchase: this.isMerchant });
    if (!quantity) return;

    let result;
    try {
      if (this.isMerchant) {
        const seller = payload.side === "source" ? this.pile : this.recipient;
        const buyer = payload.side === "source" ? this.recipient : this.pile;
        result = await API.tradeItems(seller, buyer, [{ item, quantity }], {
          interactionId: this.interactionId
        });
      } else {
        result = await API.transferItems(from, to, [{ item, quantity }], {
          interactionId: this.interactionId
        });
      }
    } catch (error) {
      warn(error);
      return ui.notifications.error(error.message ?? String(error));
    }

    // El sonido va despues de la transaccion: si Item Piles la rechaza -- sin
    // monedas, sin permisos -- no debe sonar la caja registradora.
    this._playSound(payload.side === "source" ? FLAGS.SOUND_BUY : FLAGS.SOUND_SELL);

    await this._placeResult(result, to, targetSide, cell, payload);
    this.render();
  }

  /**
   * Tras la transferencia el objeto vive con otro id en el destino. Item Piles
   * devuelve los deltas; con eso lo localizamos y lo dejamos donde se solto.
   */
  async _placeResult(result, actor, targetSide, cell, footprint) {
    if (!actor?.isOwner) return;
    const deltas = Array.isArray(result) ? result : (result?.itemDeltas ?? []);
    const newId = deltas
      .map((delta) => delta?.item?.id ?? delta?.item?._id ?? delta?._id ?? delta?.id)
      .find((id) => id && actor.items.get(id));
    if (!newId) return;

    // Sin celda de destino (llegada desde la ficha) se deja que el empaquetado
    // le busque hueco: no hay un "donde lo solte" que respetar.
    if (!cell) return;

    const data = this._sides?.[targetSide];
    const cols = data?.cols ?? 10;
    const rows = data?.rows ?? 6;
    const layout = foundry.utils.deepClone(actor.getFlag(MODULE_ID, FLAGS.LAYOUT) ?? {});
    layout[newId] = {
      x: Math.max(0, Math.min(cols - footprint.w, cell.x)),
      y: Math.max(0, Math.min(rows - footprint.h, cell.y))
    };
    await actor.setFlag(MODULE_ID, FLAGS.LAYOUT, layout);
  }

  /** Arrastrar un item desde un compendio o una hoja hacia la pila (solo GM). */
  async _onExternalDrop(event, grid, cell) {
    if (!game.user.isGM) return;
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch { return; }
    if (data?.type !== "Item" || !data.uuid) return;

    const side = grid.dataset.side;
    const actor = side === "source" ? this.pile : this.recipient;
    if (!actor) return;

    const item = await fromUuid(data.uuid);
    if (!item || item.parent === actor) return;

    try {
      const result = await api().addItems(actor, [{ item: item.toObject(), quantity: 1 }], {
        interactionId: this.interactionId
      });
      const footprint = itemFootprint(item, setting("bulkyItems"));
      await this._placeResult(result, actor, side, cell, footprint);
    } catch (error) {
      warn(error);
      ui.notifications.error(error.message ?? String(error));
    }
    this.render();
  }

  /**
   * Cuantas unidades mover.
   *
   * En una tienda se compra de una en una: arrastrar un arco no puede vaciarte
   * la bolsa comprando los cuatro del monton. En un cofre pasa lo contrario, lo
   * normal es llevarse el monton entero. Con Shift se pregunta siempre.
   */
  async _askQuantity(item, available, { isPurchase = false } = {}) {
    if (available <= 1) return 1;
    if (!this._shiftHeld) return isPurchase ? 1 : available;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    const content = `
      <p>${esc(game.i18n.format("VGP.HowMany", { name: item.name, max: available }))}</p>
      <input type="number" name="quantity" value="1" min="1" max="${available}" step="1" autofocus>`;

    if (!DialogV2) {
      return new Promise((resolve) => {
        new Dialog({
          title: item.name,
          content,
          buttons: {
            ok: {
              label: game.i18n.localize("VGP.Confirm"),
              callback: (html) => resolve(Number(html.find("[name=quantity]").val()) || 0)
            },
            cancel: { label: game.i18n.localize("Cancel"), callback: () => resolve(0) }
          },
          default: "ok",
          close: () => resolve(0)
        }).render(true);
      });
    }

    const response = await DialogV2.prompt({
      window: { title: item.name },
      content,
      ok: {
        label: game.i18n.localize("VGP.Confirm"),
        callback: (event, button) => Number(button.form.elements.quantity.value) || 0
      },
      rejectClose: false
    });
    return Math.max(0, Math.min(available, Number(response) || 0));
  }

  /** Ficha del objeto: arte grande, precio, datos de juego y descripcion. */
  _onInspect(event, tile) {
    event.preventDefault();
    const side = tile.dataset.side;
    const actor = side === "source" ? this.pile : this.recipient;
    const item = actor?.items.get(tile.dataset.itemId);
    if (!item) return;

    const canInspect = game.user.isGM
      || side === "target"
      || pileFlag(this.pile, "canInspectItems") !== false;
    if (!canInspect) return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoInspect"));

    let price = "";
    if (this.isMerchant) {
      const seller = side === "source" ? this.pile : this.recipient;
      const buyer = side === "source" ? this.recipient : this.pile;
      if (seller) price = priceStringFor(item, seller, buyer ?? undefined);
    }

    const other = side === "source" ? this.recipient : this.pile;
    const takeKey = this.isMerchant
      ? (side === "source" ? "VGP.Detail.Buy" : "VGP.Detail.Sell")
      : (side === "source" ? "VGP.Detail.Take" : "VGP.Detail.Store");

    return ItemDetailApp.show(item, {
      grid: this,
      side,
      price,
      category: categoryLabel(categoryOf(item)),
      rarity: rarityOf(item),
      footprint: itemFootprint(item, setting("bulkyItems")),
      canBuy: Boolean(other),
      buyLabel: game.i18n.localize(takeKey)
    });
  }

  /** Mover un objeto desde su ficha, sin arrastrarlo: se coloca donde quepa. */
  async takeFromDetail(itemId, side) {
    // La ficha sobrevive a su tienda: comprar desde ella con la tienda ya
    // cerrada no debe resucitar la ventana.
    if (!this.rendered) return ui.notifications.warn(game.i18n.localize("VGP.Warn.Closed"));

    const tile = this._sides?.[side]?.tiles?.find((entry) => entry.id === itemId);
    const payload = {
      module: MODULE_ID,
      side,
      itemId,
      w: tile?.w ?? 1,
      h: tile?.h ?? 1
    };
    return this._transferBetweenPanels(payload, side === "source" ? "target" : "source", null);
  }

  async _onAction(event, action) {
    event.preventDefault();
    switch (action) {
      case "take-all":
        if (!this.recipient) return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoCharacter"));
        // `transferEverything` mueve sin cobrar: contra un mercader seria robar.
        // El boton ni se dibuja, pero la accion se protege igual.
        if (this.isMerchant) return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoTakeAllMerchant"));
        await api().transferEverything(this.pile, this.recipient, { interactionId: this.interactionId });
        return this.render();
      case "pick-actor":
        return this._pickRecipient();
      case "configure":
        return this._configure();
      default:
        return undefined;
    }
  }

  async _pickRecipient() {
    const owned = game.actors.filter((actor) => actor.isOwner && actor.uuid !== this.pile?.uuid);
    if (!owned.length) return ui.notifications.warn(game.i18n.localize("VGP.Warn.NoOwnedActors"));

    const options = owned.map((actor) => `<option value="${actor.id}">${esc(actor.name)}</option>`).join("");
    const content = `<select name="actor" style="width:100%">${options}</select>`;
    const DialogV2 = foundry.applications?.api?.DialogV2;

    const chosen = DialogV2
      ? await DialogV2.prompt({
        window: { title: game.i18n.localize("VGP.PickCharacter") },
        content,
        ok: { callback: (event, button) => button.form.elements.actor.value },
        rejectClose: false
      })
      : await new Promise((resolve) => new Dialog({
        title: game.i18n.localize("VGP.PickCharacter"),
        content,
        buttons: { ok: { label: "OK", callback: (html) => resolve(html.find("[name=actor]").val()) } },
        close: () => resolve(null)
      }).render(true));

    if (!chosen) return;
    this.recipient = toActor(game.actors.get(chosen));
    this.render();
  }

  /** Ajustes por pila: decorado, tamano de grilla, capacidad y UI nativa. */
  async _configure() {
    const { cols, rows } = gridSizeFor(this.pile, setting("pileCols"), setting("pileRows"));
    const strict = this.pile.getFlag(MODULE_ID, FLAGS.STRICT) ?? "default";
    const use = this.pile.getFlag(MODULE_ID, FLAGS.USE_GRID) ?? "default";
    const background = this.pile.getFlag(MODULE_ID, FLAGS.BACKGROUND) ?? "";
    const portrait = this.pile.getFlag(MODULE_ID, FLAGS.PORTRAIT) ?? "";

    const option = (value, current, label) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
    const triState = (name, current) => `
      <select name="${name}">
        ${option("default", current, game.i18n.localize("VGP.Config.Default"))}
        ${option("yes", current, game.i18n.localize("VGP.Config.Yes"))}
        ${option("no", current, game.i18n.localize("VGP.Config.No"))}
      </select>`;

    const textField = (name, value, label, hint) => `
      <label class="vgp-field">
        <span>${esc(label)}</span>
        <input type="text" name="${name}" value="${esc(value)}" placeholder="${esc(hint)}">
      </label>`;

    // Campo de archivo con lupa: el GM elige sin escribir rutas a mano.
    const fileField = (name, value, label, kind = "image") => {
      const icon = kind === "audio" ? "fas fa-file-audio" : "fas fa-file-image";
      const hint = kind === "audio" ? "sounds/tienda/bienvenida.ogg" : "worlds/mi-mundo/tienda.webp";
      return `
        <label class="vgp-field">
          <span>${esc(label)}</span>
          <span class="vgp-config-pick">
            <input type="text" name="${name}" value="${esc(value)}" placeholder="${hint}">
            <button type="button" class="vgp-browse" data-target="${name}" data-kind="${kind}"
                    title="${esc(game.i18n.localize("VGP.Config.Browse"))}">
              <i class="${icon}"></i>
            </button>
          </span>
        </label>`;
    };

    const sounds = {
      welcome: this.pile.getFlag(MODULE_ID, FLAGS.SOUND_WELCOME) ?? "",
      farewell: this.pile.getFlag(MODULE_ID, FLAGS.SOUND_FAREWELL) ?? "",
      buy: this.pile.getFlag(MODULE_ID, FLAGS.SOUND_BUY) ?? "",
      sell: this.pile.getFlag(MODULE_ID, FLAGS.SOUND_SELL) ?? ""
    };

    const content = `
      <div class="vgp-config">
        <h3>${esc(game.i18n.localize("VGP.Config.IdentityTitle"))}</h3>
        <p class="vgp-config-note">${esc(game.i18n.localize("VGP.Config.IdentityNote"))}</p>
        ${textField("shopName", this.shopName, game.i18n.localize("VGP.Config.ShopName"), this.pile.name)}
        ${textField("vendorName", this.vendorName, game.i18n.localize("VGP.Config.VendorName"),
          game.i18n.localize(this.isMerchant ? "VGP.Merchant" : "VGP.Container"))}

        <h3>${esc(game.i18n.localize("VGP.Config.SceneryTitle"))}</h3>
        <p class="vgp-config-note">${esc(game.i18n.localize("VGP.Config.SceneryNote"))}</p>
        ${fileField("background", background, game.i18n.localize("VGP.Config.Background"))}
        ${fileField("portrait", portrait, game.i18n.localize("VGP.Config.Portrait"))}

        <h3>${esc(game.i18n.localize("VGP.Config.SoundTitle"))}</h3>
        <p class="vgp-config-note">${esc(game.i18n.localize("VGP.Config.SoundNote"))}</p>
        ${fileField("soundWelcome", sounds.welcome, game.i18n.localize("VGP.Config.SoundWelcome"), "audio")}
        ${fileField("soundFarewell", sounds.farewell, game.i18n.localize("VGP.Config.SoundFarewell"), "audio")}
        ${fileField("soundBuy", sounds.buy, game.i18n.localize("VGP.Config.SoundBuy"), "audio")}
        ${fileField("soundSell", sounds.sell, game.i18n.localize("VGP.Config.SoundSell"), "audio")}

        <h3>${esc(game.i18n.localize("VGP.Config.GridTitle"))}</h3>
        <label class="vgp-field">
          <span>${esc(game.i18n.localize("VGP.Config.Cols"))}</span>
          <input type="number" name="cols" value="${cols}" min="2" max="30">
        </label>
        <label class="vgp-field">
          <span>${esc(game.i18n.localize("VGP.Config.Rows"))}</span>
          <input type="number" name="rows" value="${rows}" min="2" max="30">
        </label>
        <label class="vgp-field">
          <span>${esc(game.i18n.localize("VGP.Config.Strict"))}</span>
          ${triState("strict", strict)}
        </label>
        <label class="vgp-field">
          <span>${esc(game.i18n.localize("VGP.Config.UseGrid"))}</span>
          ${triState("use", use)}
        </label>
      </div>`;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (!DialogV2) return ui.notifications.warn("DialogV2 no disponible en esta version de Foundry.");

    const values = await DialogV2.prompt({
      window: { title: `${this.pile.name} - ${game.i18n.localize("VGP.Configure")}` },
      classes: ["vgp-config-dialog"],
      position: { width: 620 },
      content,
      render: (event, dialog) => bindImagePickers(dialog?.element ?? event?.target),
      ok: {
        label: game.i18n.localize("VGP.Confirm"),
        callback: (event, button) => ({
          shopName: button.form.elements.shopName.value.trim(),
          vendorName: button.form.elements.vendorName.value.trim(),
          background: button.form.elements.background.value.trim(),
          portrait: button.form.elements.portrait.value.trim(),
          soundWelcome: button.form.elements.soundWelcome.value.trim(),
          soundFarewell: button.form.elements.soundFarewell.value.trim(),
          soundBuy: button.form.elements.soundBuy.value.trim(),
          soundSell: button.form.elements.soundSell.value.trim(),
          cols: Number(button.form.elements.cols.value),
          rows: Number(button.form.elements.rows.value),
          strict: button.form.elements.strict.value,
          use: button.form.elements.use.value
        })
      },
      rejectClose: false
    });
    if (!values) return;

    await this.pile.update({
      [`flags.${MODULE_ID}.${FLAGS.SHOP_NAME}`]: values.shopName,
      [`flags.${MODULE_ID}.${FLAGS.VENDOR_NAME}`]: values.vendorName,
      [`flags.${MODULE_ID}.${FLAGS.BACKGROUND}`]: values.background,
      [`flags.${MODULE_ID}.${FLAGS.PORTRAIT}`]: values.portrait,
      [`flags.${MODULE_ID}.${FLAGS.SOUND_WELCOME}`]: values.soundWelcome,
      [`flags.${MODULE_ID}.${FLAGS.SOUND_FAREWELL}`]: values.soundFarewell,
      [`flags.${MODULE_ID}.${FLAGS.SOUND_BUY}`]: values.soundBuy,
      [`flags.${MODULE_ID}.${FLAGS.SOUND_SELL}`]: values.soundSell,
      [`flags.${MODULE_ID}.${FLAGS.COLS}`]: values.cols,
      [`flags.${MODULE_ID}.${FLAGS.ROWS}`]: values.rows,
      [`flags.${MODULE_ID}.${FLAGS.STRICT}`]: values.strict,
      [`flags.${MODULE_ID}.${FLAGS.USE_GRID}`]: values.use
    });

    if (values.use === "no") {
      ui.notifications.info(game.i18n.localize("VGP.Info.NativeNext"));
      return this.close();
    }
    return this.render();
  }
}
