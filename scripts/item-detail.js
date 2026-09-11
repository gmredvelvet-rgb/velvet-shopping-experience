/**
 * Ficha del objeto.
 *
 * Se abre al hacer clic en una casilla y ensena todo lo que el sistema sabe del
 * objeto: arte grande, precio, datos de juego y descripcion enriquecida.
 *
 * Los datos se leen a la defensiva: si un sistema no tiene un campo, ese dato
 * no aparece. Nunca se inventa una ruta ni se ensena "undefined".
 */

import { MODULE_ID, IP_ITEM_FLAGS, api, warn } from "./constants.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character]);
const getProperty = (object, path) => foundry.utils.getProperty(object, path);

const ApplicationV2 = foundry.applications?.api?.ApplicationV2;

/** Convierte Set, Array u objeto de banderas en una lista de textos. */
function toList(value) {
  if (!value) return [];
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "object") return Object.entries(value).filter(([, on]) => on === true).map(([key]) => key);
  return [];
}

/** Etiqueta legible de un rasgo o propiedad, si el sistema la traduce. */
function labelFor(raw, dictionaries) {
  const key = String(raw);
  for (const dictionary of dictionaries) {
    const label = dictionary?.[key];
    if (typeof label === "string") return game.i18n.localize(label);
    if (label?.label) return game.i18n.localize(label.label);
  }
  return key.replace(/-/g, " ");
}

/**
 * Datos de juego del objeto, en pares etiqueta/valor. Cada bloque comprueba que
 * el campo exista antes de anadirlo, asi que un sistema sin ese dato
 * simplemente ensena menos filas.
 */
function factsOf(item, extra = {}) {
  const facts = [];
  const push = (label, value) => {
    if (value === null || value === undefined || value === "" ) return;
    facts.push([label, String(value)]);
  };

  const quantity = api()?.getItemQuantity?.(item);
  if (Number.isFinite(quantity) && quantity > 1) push(game.i18n.localize("VSE.Detail.Quantity"), quantity);

  push(game.i18n.localize("VSE.Detail.Category"), extra.category);
  push(game.i18n.localize("VSE.Detail.Rarity"), extra.rarity);

  // PF2e: nivel y volumen. D&D 5e: peso.
  const level = getProperty(item, "system.level.value");
  if (Number.isFinite(level)) push(game.i18n.localize("VSE.Detail.Level"), level);

  const bulk = getProperty(item, "system.bulk.value");
  if (Number.isFinite(bulk)) push(game.i18n.localize("VSE.Detail.Bulk"), bulk);

  const weight = getProperty(item, "system.weight.value") ?? getProperty(item, "system.weight");
  if (Number.isFinite(Number(weight)) && !Number.isFinite(bulk)) {
    push(game.i18n.localize("VSE.Detail.Weight"), Number(weight));
  }

  if (extra.footprint) {
    push(game.i18n.localize("VSE.Detail.Size"), `${extra.footprint.w} x ${extra.footprint.h}`);
  }

  return facts;
}

/** Rasgos (PF2e) o propiedades (D&D 5e), ya traducidos cuando se puede. */
function tagsOf(item) {
  const raw = toList(getProperty(item, "system.traits.value"))
    .concat(toList(getProperty(item, "system.properties")));
  if (!raw.length) return [];

  const dictionaries = [
    CONFIG?.PF2E?.weaponTraits, CONFIG?.PF2E?.armorTraits, CONFIG?.PF2E?.equipmentTraits,
    CONFIG?.PF2E?.consumableTraits, CONFIG?.DND5E?.itemProperties, CONFIG?.DND5E?.weaponProperties
  ];
  return [...new Set(raw.map((entry) => labelFor(entry, dictionaries)))];
}

async function enrichDescription(item) {
  const raw = getProperty(item, "system.description.value")
    ?? getProperty(item, "system.description")
    ?? "";
  if (typeof raw !== "string" || !raw.trim()) return "";

  const Editor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try {
    return await Editor.enrichHTML(raw, { async: true, relativeTo: item });
  } catch (error) {
    warn("No se pudo enriquecer la descripcion", error);
    return raw;
  }
}

/* -------------------------------------------- */

export class ItemDetailApp extends (ApplicationV2 ?? Application) {
  static DEFAULT_OPTIONS = {
    classes: ["vse-window", "vse-detail-window"],
    window: { title: "VSE.Detail.Title", icon: "fas fa-scroll", resizable: true },
    position: { width: 460, height: 620 }
  };

  constructor(item, context = {}, options = {}) {
    super(options);
    this.item = item;
    this.context = context; // { grid, side, price, category, rarity, footprint }
  }

  get title() { return this.item?.name ?? game.i18n.localize("VSE.Detail.Title"); }

  static show(item, context = {}) {
    const app = new ItemDetailApp(item, context, {
      id: `${MODULE_ID}-detail-${String(item.uuid ?? item.id).replaceAll(".", "-")}`
    });
    app.render({ force: true });
    return app;
  }

  async _renderHTML() {
    const item = this.item;
    const { price, category, rarity, footprint, canBuy, buyLabel } = this.context;

    const facts = factsOf(item, { category, rarity, footprint });
    const tags = tagsOf(item);
    const description = await enrichDescription(item);
    const notForSale = Boolean(getProperty(item, IP_ITEM_FLAGS.NOT_FOR_SALE));

    const rarityClass = rarity ? ` is-${String(rarity).toLowerCase()}` : "";

    return `
      <div class="vse-detail${rarityClass}">
        <header class="vse-detail-head">
          <div class="vse-detail-art">
            <img src="${esc(item.img)}" alt="">
          </div>
          <div class="vse-detail-ident">
            <h2>${esc(item.name)}</h2>
            ${category ? `<span class="vse-detail-kind">${esc(category)}</span>` : ""}
            ${rarity ? `<span class="vse-detail-rarity">${esc(
              game.i18n.localize(`VSE.Rarity.${rarity}`)
            )}</span>` : ""}
          </div>
        </header>

        ${price ? `
          <div class="vse-detail-price">
            <i class="fas fa-coins"></i>
            <b>${esc(price)}</b>
            ${notForSale ? `<span class="vse-detail-flag">${esc(
              game.i18n.localize("VSE.Warn.NotForSale")
            )}</span>` : ""}
          </div>` : ""}

        ${facts.length ? `
          <dl class="vse-detail-facts">
            ${facts.map(([label, value]) => `
              <div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
          </dl>` : ""}

        ${tags.length ? `
          <ul class="vse-detail-tags">
            ${tags.map((tag) => `<li>${esc(tag)}</li>`).join("")}
          </ul>` : ""}

        <div class="vse-detail-body">
          ${description || `<p class="vse-detail-empty">${esc(
            game.i18n.localize("VSE.Detail.NoDescription")
          )}</p>`}
        </div>

        <footer class="vse-detail-foot">
          ${canBuy ? `
            <button type="button" class="vse-mini" data-vse-detail="take">
              <i class="fas fa-hand-holding"></i> ${esc(buyLabel)}
            </button>` : ""}
          <button type="button" class="vse-mini" data-vse-detail="sheet">
            <i class="fas fa-file-lines"></i> ${esc(game.i18n.localize("VSE.Detail.OpenSheet"))}
          </button>
        </footer>
      </div>`;
  }

  _replaceHTML(result, element) {
    element.innerHTML = result;
    for (const button of element.querySelectorAll("[data-vse-detail]")) {
      button.addEventListener("click", (event) => this._onAction(event, button.dataset.vseDetail));
    }
    return element;
  }

  async _renderInner() {
    const html = await this._renderHTML();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    this._replaceHTML(html, wrapper);
    return $(wrapper);
  }

  async _onAction(event, action) {
    event.preventDefault();
    if (action === "sheet") return this.item.sheet?.render(true);
    if (action === "take") {
      const { grid, side } = this.context;
      await this.close();
      return grid?.takeFromDetail(this.item.id, side);
    }
    return undefined;
  }
}
