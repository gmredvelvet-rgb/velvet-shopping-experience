/**
 * Resolucion de huellas: cuantas casillas ocupa un objeto.
 *
 * Cascada de prioridades, de mas explicita a mas adivinada:
 *   1. `flags.velvet-shopping-experience.size`  -> lo que el GM fijo a mano aqui.
 *   2. `flags.item-piles.width/height` -> lo que ya usan los vaults de Item Piles.
 *   3. Flags de los compendios de Fatmorbus (Stoneshard Items, Food & Drink).
 *   4. Dimensiones del PNG, si son multiplo exacto de 108 px.
 *   5. Heuristica por peso (5e) o por volumen (PF2e).
 *
 * Las cuatro primeras son exactas: un objeto importado nunca cambia de forma
 * porque alguien active la heuristica.
 */

import { MODULE_ID, FLAGS, IP_ITEM_FLAGS, SOURCE_CELL_PX, MAX_FOOTPRINT } from "./constants.js";

const STONESHARD_FLAG_PATHS = Object.freeze([
  "flags.stoneshard-sheet-by-fatmorbus.inventorySize",
  "flags.stoneshard-items-dnd5e-by-fatmorbus.inventorySize",
  "flags.stoneshard-items-shadowdark-by-fatmorbus.inventorySize",
  "flags.dnd5e-food-drink-by-fatmorbus.inventorySize",
  "flags.dnd5e-food-drink-by-fatmorbus.food.inventorySize"
]);

const MEASURABLE_IMAGE = /\.(?:png|webp)(?:[?#].*)?$/i;

/** Cache global de medidas de imagen: `src` -> `{w,h}` o `null`. */
const IMAGE_FOOTPRINTS = new Map();
const IMAGE_LOADS = new Map();

const getProperty = (object, path) => foundry.utils.getProperty(object, path);

function clampCell(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(MAX_FOOTPRINT, number)) : null;
}

/** Acepta `{w,h}`, `{pxw,pxh}` o el JSON en texto que guardan algunos compendios. */
export function normalizeSize(value) {
  if (!value) return null;

  let data = value;
  if (typeof data === "string") {
    try { data = JSON.parse(data); }
    catch { return null; }
  }
  if (typeof data !== "object") return null;

  const w = clampCell(data.w ?? data.width ?? (Number(data.pxw) / SOURCE_CELL_PX));
  const h = clampCell(data.h ?? data.height ?? (Number(data.pxh) / SOURCE_CELL_PX));
  return w && h ? { w, h } : null;
}

/** Huella declarada explicitamente, en cualquiera de los tres dialectos. */
export function declaredSize(item) {
  const own = normalizeSize(getProperty(item, `flags.${MODULE_ID}.${FLAGS.SIZE}`));
  if (own) return own;

  const w = clampCell(getProperty(item, IP_ITEM_FLAGS.WIDTH));
  const h = clampCell(getProperty(item, IP_ITEM_FLAGS.HEIGHT));
  if (w && h && (w > 1 || h > 1)) return { w, h };

  for (const path of STONESHARD_FLAG_PATHS) {
    const size = normalizeSize(getProperty(item, path));
    if (size) return size;
  }
  return null;
}

/** Solo aceptamos lienzos que de verdad sean multiplos de la casilla fuente. */
export function sizeFromImageDimensions(width, height) {
  const rawW = Number(width) / SOURCE_CELL_PX;
  const rawH = Number(height) / SOURCE_CELL_PX;
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH)) return null;
  if (Math.abs(rawW - Math.round(rawW)) > 0.02) return null;
  if (Math.abs(rawH - Math.round(rawH)) > 0.02) return null;
  return normalizeSize({ w: rawW, h: rawH });
}

function loadImageSize(src) {
  if (IMAGE_FOOTPRINTS.has(src)) return Promise.resolve(IMAGE_FOOTPRINTS.get(src));
  if (IMAGE_LOADS.has(src)) return IMAGE_LOADS.get(src);

  const pending = new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (size) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      IMAGE_FOOTPRINTS.set(src, size);
      resolve(size);
    };
    const timeout = setTimeout(() => finish(null), 2500);
    image.onload = () => finish(sizeFromImageDimensions(image.naturalWidth, image.naturalHeight));
    image.onerror = () => finish(null);
    image.src = src;
    if (image.complete && image.naturalWidth > 0) {
      queueMicrotask(() => finish(sizeFromImageDimensions(image.naturalWidth, image.naturalHeight)));
    }
  }).finally(() => IMAGE_LOADS.delete(src));

  IMAGE_LOADS.set(src, pending);
  return pending;
}

/**
 * Mide por adelantado los iconos que aun no tienen huella declarada, para que
 * el primer render ya salga con el tamano correcto y no haya salto visual.
 */
export async function primeFootprints(items) {
  const sources = new Set();
  for (const item of items ?? []) {
    if (declaredSize(item)) continue;
    const src = String(item?.img ?? "").trim();
    // Los iconos del nucleo son todos 512 px: medirlos solo gasta tiempo.
    if (!src || src.startsWith("icons/")) continue;
    if (MEASURABLE_IMAGE.test(src)) sources.add(src);
  }
  if (!sources.size) return;
  await Promise.allSettled([...sources].map((src) => loadImageSize(src)));
}

function measuredSize(item) {
  const src = String(item?.img ?? "").trim();
  return src ? (IMAGE_FOOTPRINTS.get(src) ?? null) : null;
}

/* -------------------------------------------- */
/*  Heuristica por sistema                      */
/* -------------------------------------------- */

const BY_WEIGHT = Object.freeze([
  { upTo: 2, w: 1, h: 1 },
  { upTo: 6, w: 1, h: 2 },
  { upTo: 12, w: 2, h: 2 },
  { upTo: 30, w: 2, h: 3 },
  { upTo: Infinity, w: 3, h: 3 }
]);

/** PF2e mide en Bulk, donde L vale 0.1 y 1 Bulk ya es un objeto de dos manos. */
const BY_BULK = Object.freeze([
  { upTo: 0.15, w: 1, h: 1 },
  { upTo: 0.6, w: 1, h: 2 },
  { upTo: 1.5, w: 2, h: 2 },
  { upTo: 3, w: 2, h: 3 },
  { upTo: Infinity, w: 3, h: 3 }
]);

/** Devuelve el volumen del objeto en la unidad que use el sistema activo. */
function itemLoad(item) {
  if (game.system.id === "pf2e") {
    const bulk = getProperty(item, "system.bulk.value");
    if (Number.isFinite(Number(bulk))) return Number(bulk);
    const raw = String(getProperty(item, "system.bulk") ?? "").toLowerCase();
    if (raw === "l") return 0.1;
    return Number(raw) || 0;
  }
  const weight = getProperty(item, "system.weight.value") ?? getProperty(item, "system.weight");
  return Number(weight) || 0;
}

/** Ensancha armaduras pesadas, escudos y armas a dos manos. */
function bumpForShape(item, size) {
  let { w, h } = size;
  const armour = String(
    getProperty(item, "system.type.value") ?? getProperty(item, "system.category") ?? ""
  ).toLowerCase();
  if (["medium", "heavy", "shield"].includes(armour)) { w = Math.max(w, 2); h = Math.max(h, 2); }

  if (item?.type === "weapon") {
    const properties = getProperty(item, "system.properties");
    const has = (key) => {
      if (properties instanceof Set) return properties.has(key);
      if (Array.isArray(properties)) return properties.includes(key);
      return properties?.[key] === true || properties?.[key]?.value === true;
    };
    const traits = getProperty(item, "system.traits.value") ?? [];
    const twoHanded = has("two") || (Array.isArray(traits) && traits.some((t) => String(t).startsWith("two-hand")));
    if (twoHanded) { w = Math.max(w, 2); h = Math.max(h, 2); }
  }

  if (["container", "backpack"].includes(item?.type)) { w = Math.max(w, 2); h = Math.max(h, 2); }
  return { w, h };
}

/**
 * Huella final del objeto. `bulky` solo gobierna el paso heuristico: si esta
 * apagado, todo lo que no declare tamano ocupa una casilla.
 */
export function itemFootprint(item, bulky = true) {
  const exact = declaredSize(item) ?? measuredSize(item);
  if (exact) return exact;
  if (!bulky) return { w: 1, h: 1 };

  const table = game.system.id === "pf2e" ? BY_BULK : BY_WEIGHT;
  const load = itemLoad(item);
  const rule = table.find((entry) => load <= entry.upTo) ?? { w: 1, h: 1 };
  return bumpForShape(item, { w: rule.w, h: rule.h });
}
