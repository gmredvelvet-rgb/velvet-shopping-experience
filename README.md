# Velvet Grid Piles

Sustituye las ventanas de **contenedores, pilas de botín y mercaderes** de Item Piles por un
inventario en rejilla estilo Stoneshard / Diablo: cada objeto ocupa las casillas que le
corresponden, se arrastra libremente y se intercambia entre el contenedor y tu personaje.

Funciona igual en **D&D 5e** y **Pathfinder 2e** porque no reimplementa nada de economía:
toda transferencia, precio y moneda sigue pasando por la API de Item Piles.

---

## Cómo se engancha

Item Piles decide qué ventana abrir en `_renderItemPileInterface`, y justo antes lanza un hook
cancelable:

```js
const hookResult = Hooks.call(CONSTANTS.HOOKS.PRE_RENDER_INTERFACE, target, inspectingTarget);
if (hookResult === false) return;
```

Este módulo escucha ese hook (`item-piles-preRenderInterface`), devuelve `false` cuando la pila
está configurada para usar rejilla, y abre su propia ventana. **No hay monkey-patching**: si
algún día quieres volver a la interfaz nativa, basta con apagar un ajuste.

Los vaults de Item Piles se dejan en paz: ya tienen rejilla propia.

---

## Tamaño de los objetos

La huella de cada objeto se resuelve en cascada, de lo más explícito a lo más adivinado:

| Prioridad | Fuente | Notas |
|---|---|---|
| 1 | `flags.velvet-grid-piles.size` | Lo que fijes a mano desde este módulo. |
| 2 | `flags.item-piles.item.width` / `.height` | El mismo dato que usan los vaults de Item Piles. |
| 3 | Flags de los compendios de Fatmorbus | Stoneshard Items, Food & Drink, Shadowdark. |
| 4 | Dimensiones del PNG | Solo si son múltiplo exacto de 108 px por casilla. |
| 5 | Heurística | Peso en 5e, Bulk en PF2e, con ensanche para armaduras pesadas, escudos, armas a dos manos y mochilas. |

Un objeto que ya declara tamaño **nunca** cambia de forma porque alguien active la heurística.

Los flags de Item Piles se leen solo cuando valen más de 1, porque `1x1` es su valor por defecto
y se escribe en casi cualquier objeto que pase por sus manos; si lo respetáramos tal cual,
todo acabaría midiendo una casilla.

**Ojo con las rutas**: Item Piles no guarda sus ajustes sueltos bajo `flags.item-piles`, sino
agrupados — la configuración de la pila en `flags.item-piles.data.*` y la del objeto en
`flags.item-piles.item.*`. Leerlos un nivel más arriba devuelve `undefined` en silencio.

Para fijar un tamaño a mano:

```js
game.velvetGridPiles.setItemSize(item, 2, 3);   // escribe ambos dialectos de flag
```

---

## Categorías

Las pestañas se construyen con lo que hay de verdad en el inventario y agrupan los tipos de
cada sistema en nombres de juego, para que una tienda se lea igual en 5e que en PF2e:

| Pestaña | Pathfinder 2e | D&D 5e |
|---|---|---|
| Armas | `weapon` | `weapon` |
| Armaduras | `armor`, `shield` | `equipment` con tipo light/medium/heavy/shield |
| Munición | `ammo`, `consumable` de categoría ammo | `consumable` de tipo ammo |
| Consumibles | `consumable` (pociones, pergaminos, talismanes…) | `consumable` (pociones, comida…) |
| Equipo | `equipment`, `kit` | `equipment` (resto) |
| Herramientas | — | `tool` |
| Contenedores | `backpack` | `container`, `backpack` |
| Tesoro | `treasure` | `loot` de tipo treasure |
| Misceláneo | `book` y lo demás | `loot` y lo demás |

La categoría personalizada de Item Piles gana siempre y aparece al final con su propio nombre.
Un sistema que no sea ninguno de los dos se reparte por nombre de tipo, y lo que no se reconozca
cae en Misceláneo: **nunca se oculta un objeto** por no saber clasificarlo.

La rareza (`system.rarity` en 5e, `system.traits.rarity` en PF2e) tiñe el borde de la casilla.

---

## La grilla se ajusta al panel

La grilla nunca es más ancha que su panel. Se mide el hueco disponible y se recorta el número de
columnas hasta que la casilla no baje de un tamaño legible; a partir de ahí **solo crece hacia
abajo**. Se recalcula al redimensionar la ventana.

Si la casilla queda por debajo de 60 px, el nombre y el precio se ocultan solos para no robarle
sitio al icono.

---

## Capacidad: laxa o real

Por defecto la rejilla es **cosmética**: si algo no cabe, la rejilla crece hacia abajo y nunca
rechaza un objeto. Es lo que espera una mesa de rol.

Con **capacidad real** activada, un objeto que no encuentre hueco no entra, como en Stoneshard.
Se puede fijar por mundo (ajustes) y sobrescribir pila por pila desde el botón de engranaje de
la ventana.

---

## Uso

- **Arrastrar entre paneles**: transfiere (contenedor) o compra/vende (mercader).
- **Arrastrar dentro de un panel**: recoloca. Si sueltas sobre un objeto del mismo tamaño, se
  intercambian.
- **Shift mientras arrastras**: pregunta cuántas unidades mover. Sin Shift se mueve la pila entera.
- **Clic**: abre la ficha del objeto -- arte grande, precio, datos de juego y descripcion --
  con botones para comprar, tomar o abrir la ficha completa del sistema.
- **Arrastrar desde un compendio o una hoja** hacia la rejilla: añade el objeto a la pila (solo GM).
- **Botón de engranaje** (solo GM): columnas, filas, capacidad real y volver a la UI nativa.

Las posiciones se guardan en `flags.velvet-grid-piles.layout` **del actor**, como un único mapa
`{ idDeObjeto: {x, y} }`. Un solo `update` por movimiento, y nada que escribir en objetos que no
son tuyos: quien no tenga permiso de edición ve un empaquetado automático determinista, igual
para todos, y puede seguir arrastrando objetos fuera (eso lo resuelve el socket de Item Piles).

---

## Ajustes

| Ajuste | Ámbito | Por defecto |
|---|---|---|
| Rejilla en contenedores / mercaderes / pilas | Mundo | Activado |
| Capacidad real por defecto | Mundo | Desactivado |
| Deducir el tamaño por peso | Mundo | Activado |
| Tamaño de casilla (px) | Cliente | 52 |
| Columnas y filas por defecto | Mundo | 10 × 6 |

---

## API

```js
game.velvetGridPiles.open(pileActor, recipientActor);  // abre la ventana a mano
game.velvetGridPiles.footprintOf(item);                // -> { w, h }
game.velvetGridPiles.setItemSize(item, w, h);
game.velvetGridPiles.resetLayout(actor);               // olvida las posiciones guardadas
```

---

## Pruebas

La matemática de la rejilla y la resolución de huellas no dependen de Foundry, así que se
prueban sueltas:

```bash
cd tests
node grid.test.mjs         # empaquetado, colisiones, capacidad estricta
node footprints.test.mjs   # cascada de tamanos, 5e y PF2e
node render.test.mjs       # render completo, filtros, orden
node taxonomy.test.mjs     # tipos reales de PF2e y 5e, rareza
node fit.test.mjs          # la grilla no desborda a ningun ancho
node detail.test.mjs       # ficha de objeto en ambos sistemas
node paths.test.mjs        # rutas de imagen validas e invalidas
node sound.test.mjs        # sonidos, y que no se emitan a la mesa
```

---

## Si algo no abre

Este módulo cancela la ventana de Item Piles para poner la suya. Si la nuestra fallara, el
módulo lo detecta, avisa en pantalla y **reabre la pila con la interfaz normal de Item Piles**,
para que nunca te quedes sin poder abrir un cofre.

Para saber qué pasó, selecciona el token y ejecuta en la consola (F12) o en una macro:

```js
await game.velvetGridPiles.diagnose();
```

Devuelve la versión de Item Piles, si el hook está registrado, el tipo de pila, si decidimos
interceptarla y —si algo revienta— el mensaje y el stack reales.

Para desactivar la rejilla sin desinstalar nada: ajustes del módulo, o el botón de engranaje de
la ventana, opción «Usar la grilla → No».

---

## Identidad de la tienda

El rótulo grande y la línea de debajo son editables por pila, desde la sección **Identidad** del
diálogo de ajustes: el actor puede llamarse "Commoner" y la tienda "La Espada Mellada", atendida
por "Bram el Tuerto". Vacíos, se usan el nombre del actor y el tipo de pila.

El rótulo aparece también en la barra de título de la ventana.

---

## Decorado por tienda

Cada pila guarda su propio fondo y su propio retrato. Se eligen desde el botón **"Decorado y
ajustes de esta tienda"** de la barra de título de la ventana (o el engranaje del divisor
central), que abre el selector de archivos de Foundry. Una tienda sin fondo propio hereda el del mundo, y sin ninguno de los dos se dibuja el
tema de madera.

El retrato se dibuja **sin marco**, a la altura que fijes en los ajustes, con los bordes
desvanecidos para que la figura se integre con el decorado. Da igual si la imagen es un recorte
con transparencia o una ilustración completa.

Prioridad del retrato del mercader: flag propio → *Merchant Image* de Item Piles → arte del actor.

**Las imagenes tienen que vivir dentro de `Foundry_Data/Data`.** Una ruta del disco duro como
`C:\Users\...\fondo.png` no la puede servir Foundry al navegador; el modulo lo detecta y avisa en
vez de dejarte el fondo en blanco. Usa el boton de la lupa, que solo navega por donde vale.

---

## Sonidos de tienda

Cada pila puede tener cuatro sonidos propios, elegibles desde el mismo diálogo que el decorado:

| Sonido | Cuándo suena |
|---|---|
| Bienvenida | Al abrir la tienda |
| Despedida | Al cerrarla |
| Al comprar o tomar | Tras confirmarse una transferencia desde la pila |
| Al vender o guardar | Tras confirmarse una transferencia hacia la pila |

**Solo los oye quien está usando la tienda.** Se reproducen en local, sin emitirlos por
websocket, así que el resto de la mesa no escucha la campanilla de cada compra ajena.

Los de compra y venta suenan después de que Item Piles confirme la operación: si la rechaza por
falta de monedas, no suena nada.

El volumen se ajusta por cliente en los ajustes del módulo, y se multiplica por el volumen de
interfaz de Foundry.

---

## Requisitos

- Foundry VTT v13 o v14
- **Item Piles** 3.x (obligatorio)
- Opcional: `stoneshard-sheet-by-fatmorbus` y sus compendios, para que un objeto ocupe lo mismo
  en la hoja y en el contenedor.

El tema visual es propio: se dibuja con gradientes CSS y no redistribuye los assets gráficos de
ningún otro módulo.
