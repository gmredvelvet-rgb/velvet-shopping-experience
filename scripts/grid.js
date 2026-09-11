/**
 * Matematica de la grilla: ocupacion, colisiones y empaquetado.
 *
 * Nada de esto toca Foundry, para poder razonarlo (y probarlo) aparte.
 * La ocupacion es un array plano de `cols * rows` con el id del objeto que
 * cubre cada casilla, o `null`.
 */

export function createOccupancy(cols, rows) {
  return new Array(Math.max(0, cols * rows)).fill(null);
}

export function fits(occupancy, cols, rows, x, y, w, h, ignoreId = null) {
  if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const occupant = occupancy[(y + dy) * cols + (x + dx)];
      if (occupant !== null && occupant !== ignoreId) return false;
    }
  }
  return true;
}

export function occupy(occupancy, cols, x, y, w, h, id) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) occupancy[(y + dy) * cols + (x + dx)] = id;
  }
}

/** Primer hueco libre leyendo en orden de lectura. `null` si no cabe. */
export function findFreeCell(occupancy, cols, rows, w, h) {
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      if (fits(occupancy, cols, rows, x, y, w, h)) return { x, y };
    }
  }
  return null;
}

/** Que objeto cubre una casilla concreta. */
export function occupantAt(occupancy, cols, rows, x, y) {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return occupancy[y * cols + x];
}

/**
 * Coloca una lista de objetos en la grilla.
 *
 * @param {Array<{id:string, w:number, h:number}>} entries  Objetos a colocar.
 * @param {object} options
 * @param {number} options.cols                             Ancho de la grilla.
 * @param {number} options.rows                             Alto minimo.
 * @param {object} [options.saved]                          Posiciones guardadas `{id:{x,y}}`.
 * @param {boolean} [options.strict]                        Si `true`, lo que no cabe se reporta
 *                                                          como desbordado en vez de hacer crecer
 *                                                          la grilla.
 * @param {boolean} [options.preserveOrder]                  Si `true`, se respeta el orden de
 *                                                          entrada en vez de colocar primero los
 *                                                          objetos grandes. Necesario cuando el
 *                                                          usuario ha pedido un orden concreto.
 * @returns {{tiles:Array, rows:number, overflow:Array}}
 */
export function layoutItems(entries, { cols, rows, saved = {}, strict = false, preserveOrder = false } = {}) {
  const safeCols = Math.max(1, Math.floor(cols) || 1);
  let safeRows = Math.max(1, Math.floor(rows) || 1);

  // Los objetos con posicion guardada mandan; el resto se rellena despues para
  // que anadir algo nuevo nunca reordene lo que el jugador ya habia colocado.
  const anchored = [];
  const floating = [];
  for (const entry of entries) {
    const position = saved?.[entry.id];
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      anchored.push({ ...entry, x: Math.floor(position.x), y: Math.floor(position.y) });
    } else {
      floating.push({ ...entry });
    }
  }

  // Los grandes primero: dejan menos agujeros irrellenables. Pero si el usuario
  // ha pedido un orden (por precio, por nombre...), ese orden manda: ver los
  // objetos baratos antes que los caros importa mas que aprovechar cada hueco.
  if (!preserveOrder) floating.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const neededRows = () => {
    if (strict) return safeRows;
    const area = entries.reduce((total, entry) => total + entry.w * entry.h, 0);
    const deepest = anchored.reduce((max, entry) => Math.max(max, entry.y + entry.h), 0);
    return Math.max(safeRows, deepest, Math.ceil(area / safeCols) + 2);
  };

  safeRows = neededRows();
  let occupancy = createOccupancy(safeCols, safeRows);
  const tiles = [];
  const overflow = [];

  for (const entry of anchored) {
    if (fits(occupancy, safeCols, safeRows, entry.x, entry.y, entry.w, entry.h)) {
      occupy(occupancy, safeCols, entry.x, entry.y, entry.w, entry.h, entry.id);
      tiles.push(entry);
    } else {
      floating.push(entry); // La posicion guardada ya no vale: se recoloca.
    }
  }

  for (const entry of floating) {
    let cell = findFreeCell(occupancy, safeCols, safeRows, entry.w, entry.h);

    if (!cell && !strict) {
      // Crece hacia abajo, que es la direccion en la que se hace scroll.
      const grownRows = safeRows + Math.max(entry.h, 2);
      const grown = createOccupancy(safeCols, grownRows);
      for (let i = 0; i < occupancy.length; i++) grown[i] = occupancy[i];
      occupancy = grown;
      safeRows = grownRows;
      cell = findFreeCell(occupancy, safeCols, safeRows, entry.w, entry.h);
    }

    if (!cell) {
      overflow.push(entry);
      continue;
    }
    occupy(occupancy, safeCols, cell.x, cell.y, entry.w, entry.h, entry.id);
    tiles.push({ ...entry, x: cell.x, y: cell.y });
  }

  return { tiles, cols: safeCols, rows: safeRows, overflow, occupancy };
}
