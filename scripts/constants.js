/**
 * Constantes compartidas.
 *
 * Todo lo que este modulo guarda vive bajo `flags.velvet-shopping-experience`; los
 * tamanos de objeto se leen tambien desde `flags.item-piles` para que un item
 * colocado en un vault de Item Piles conserve su huella aqui y viceversa.
 */

export const MODULE_ID = "velvet-shopping-experience";

/** Claves de flag propias, sobre actores y sobre objetos. */
export const FLAGS = Object.freeze({
  LAYOUT: "layout",     // actor: { [itemId]: { x, y } }
  SIZE: "size",         // item:  { w, h }  (override manual del GM)
  USE_GRID: "useGrid",  // actor: "default" | "yes" | "no"
  STRICT: "strict",     // actor: "default" | "yes" | "no"
  COLS: "cols",
  ROWS: "rows",
  SHOP_NAME: "shopName",     // actor: rotulo grande; por defecto el nombre del actor
  VENDOR_NAME: "vendorName", // actor: linea de abajo; por defecto el rol de la pila
  BACKGROUND: "background", // actor: ruta de imagen; el decorado de esta tienda
  PORTRAIT: "portrait",     // actor: ruta de imagen; el retrato de esta tienda
  SOUND_WELCOME: "soundWelcome",   // actor: ruta de audio; al abrir la tienda
  SOUND_FAREWELL: "soundFarewell", // actor: ruta de audio; al cerrarla
  SOUND_BUY: "soundBuy",           // actor: ruta de audio; al comprar o tomar
  SOUND_SELL: "soundSell"          // actor: ruta de audio; al vender o guardar
});

/**
 * Item Piles no guarda sus ajustes sueltos bajo `flags.item-piles`, sino
 * agrupados: la configuracion de la pila en `.data` y la del objeto en `.item`
 * (CONSTANTS.FLAGS.PILE y CONSTANTS.FLAGS.ITEM en su codigo). Leerlos un nivel
 * mas arriba devuelve `undefined` siempre y en silencio.
 */
export const IP_PILE_DATA = "flags.item-piles.data";
export const IP_ITEM_DATA = "flags.item-piles.item";

/** Flags de objeto que leemos en crudo, sin mezclar los valores por defecto. */
export const IP_ITEM_FLAGS = Object.freeze({
  WIDTH: `${IP_ITEM_DATA}.width`,
  HEIGHT: `${IP_ITEM_DATA}.height`,
  HIDDEN: `${IP_ITEM_DATA}.hidden`,
  NOT_FOR_SALE: `${IP_ITEM_DATA}.notForSale`
});

/**
 * Lienzo por casilla de los compendios isometricos de Stoneshard. Una imagen
 * cuyo tamano sea multiplo exacto de este valor declara su huella sola.
 */
export const SOURCE_CELL_PX = 108;

/** Ningun objeto puede ocupar mas que esto, por muy pesado que sea. */
export const MAX_FOOTPRINT = 6;

/**
 * Suelo de legibilidad de la casilla. Por debajo de esto el icono deja de
 * distinguirse, asi que antes de encoger mas se quitan columnas.
 */
export const MIN_CELL = 44;

/** Por estrecha que sea la ventana, siempre quedan al menos estas columnas. */
export const MIN_COLS = 3;

/**
 * Por debajo de este lado, el nombre y el precio se esconden: en una casilla
 * pequena la etiqueta le roba el sitio al icono y no se lee ninguno de los dos.
 */
export const COMPACT_CELL = 60;

export const api = () => game.itempiles?.API;

export const warn = (...args) => console.warn(`${MODULE_ID} |`, ...args);
