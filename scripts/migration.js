/**
 * Migracion desde el nombre anterior del modulo.
 *
 * Hasta la 0.9.0 el modulo se llamaba Velvet Grid Piles y guardaba todo bajo
 * `flags.velvet-grid-piles` y `velvet-grid-piles.<ajuste>`. Foundry conserva
 * esos datos aunque el id ya no exista, asi que se copian al id nuevo una sola
 * vez. Los originales no se borran: quedan como copia de seguridad y no
 * molestan a nadie.
 */

import { MODULE_ID, warn } from "./constants.js";

export const LEGACY_ID = "velvet-grid-piles";

/** Marca de mundo: la migracion de documentos y ajustes ya se hizo. */
export const MIGRATED = "migratedFromGridPiles";

/**
 * Flags del id viejo de un documento en crudo, o `null` si no hay nada que
 * copiar. Si el documento ya tiene flags nuevos se respetan: nunca se pisa lo
 * que se haya configurado despues de cambiar de nombre.
 */
export function legacyFlags(source) {
  const old = source?.flags?.[LEGACY_ID];
  if (!old || typeof old !== "object" || !Object.keys(old).length) return null;
  if (source.flags[MODULE_ID]) return null;
  return old;
}

/** Actualizacion para `updateDocuments`, o `null`. */
const patchFor = (source) => {
  const flags = legacyFlags(source);
  return flags ? { _id: source._id, [`flags.${MODULE_ID}`]: flags } : null;
};

const patchesFor = (sources = []) => sources.map(patchFor).filter(Boolean);

/**
 * Valor de un ajuste tal como lo guarda Foundry: texto JSON. Si no se puede
 * leer como JSON se devuelve tal cual.
 */
export function decodeSetting(raw) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Si el ajuste viejo se puede copiar. El fondo por defecto era "" y ahora es
 * el arte incluido: un "" viejo no es una eleccion del GM, asi que no debe
 * esconder el fondo nuevo.
 */
export function shouldCopySetting(name, value) {
  return !(name === "backgroundImage" && value === "");
}

/** Ajustes de mundo guardados con el id viejo que aun no existen con el nuevo. */
async function migrateWorldSettings() {
  const storage = game.settings.storage.get("world");
  let count = 0;
  for (const setting of storage) {
    if (!setting.key?.startsWith(`${LEGACY_ID}.`)) continue;
    const name = setting.key.slice(LEGACY_ID.length + 1);
    const key = `${MODULE_ID}.${name}`;
    if (!game.settings.settings.has(key) || storage.getSetting(key)) continue;
    const value = decodeSetting(setting._source.value);
    if (!shouldCopySetting(name, value)) continue;
    await game.settings.set(MODULE_ID, name, value);
    count++;
  }
  return count;
}

/** Ajustes de cliente: viven en el localStorage de cada navegador. */
async function migrateClientSettings() {
  const storage = game.settings.storage.get("client");
  for (const [key, config] of game.settings.settings) {
    if (config.namespace !== MODULE_ID || config.scope !== "client") continue;
    const old = storage.getItem(`${LEGACY_ID}.${config.key}`);
    if (old === null || storage.getItem(key) !== null) continue;
    await game.settings.set(MODULE_ID, config.key, decodeSetting(old));
  }
}

async function migrateDocuments() {
  let count = 0;

  // Actores del mundo, y despues sus objetos.
  const actorPatches = patchesFor(game.actors.map((a) => a._source));
  if (actorPatches.length) await Actor.updateDocuments(actorPatches);
  count += actorPatches.length;

  for (const actor of game.actors) {
    const itemPatches = patchesFor(actor._source.items);
    if (itemPatches.length) await actor.updateEmbeddedDocuments("Item", itemPatches);
    count += itemPatches.length;
  }

  const worldItemPatches = patchesFor(game.items.map((i) => i._source));
  if (worldItemPatches.length) await Item.updateDocuments(worldItemPatches);
  count += worldItemPatches.length;

  // Tokens sin vincular: lo suyo vive en el delta, no en el actor base. Se lee
  // el delta en crudo porque el actor sintetico ya mezcla los flags del base,
  // que a estas alturas tienen el id nuevo y taparian los del token.
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const delta = token.delta?._source;
      if (token.actorLink || !delta || !token.actor) continue;
      const flags = legacyFlags(delta);
      if (flags) {
        await token.actor.update({ [`flags.${MODULE_ID}`]: flags });
        count++;
      }
      const itemPatches = patchesFor(delta.items);
      if (itemPatches.length) await token.actor.updateEmbeddedDocuments("Item", itemPatches);
      count += itemPatches.length;
    }
  }

  return count;
}

export function registerMigrationSetting() {
  game.settings.register(MODULE_ID, MIGRATED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/**
 * Se llama en `ready`. Los ajustes de cliente se copian en cada navegador; el
 * resto solo lo hace un GM, una vez por mundo.
 */
export async function migrateFromLegacyId() {
  try {
    await migrateClientSettings();
    if (!game.user.isGM || game.settings.get(MODULE_ID, MIGRATED)) return;

    const settings = await migrateWorldSettings();
    const documents = await migrateDocuments();
    await game.settings.set(MODULE_ID, MIGRATED, true);

    if (settings || documents) {
      console.log(`${MODULE_ID} | Migrado desde ${LEGACY_ID}: ${settings} ajuste(s), ${documents} documento(s).`);
      ui.notifications.info(game.i18n.format("VSE.Info.Migrated", { settings, documents }));
    }
  } catch (error) {
    // Sin marcar como hecha: se reintenta en la proxima carga.
    warn(`No se pudo migrar desde ${LEGACY_ID}`, error);
  }
}
