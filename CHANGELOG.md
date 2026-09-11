# Changelog

## 0.11.0

### Anadido

- **Licencia de Patreon (soft gate).** Ninguna funcion se bloquea: sin licencia, el
  modulo funciona entero y solo aparece un recordatorio de prueba gratuita.
- **Velvet License Hub como dependencia.** Foundry lo instala junto con este modulo, y
  una sola conexion de Patreon en el hub licencia todos los modulos de GM RedVelvet, en
  todos los mundos. Con el hub activo, este modulo no muestra tarjeta, recordatorio ni
  menu de licencia propios.

## 0.10.0

El modulo pasa a llamarse **Velvet Shopping Experience**.

### Cambiado

- Nuevo id `velvet-shopping-experience` (antes `velvet-grid-piles`). La carpeta del modulo, los
  flags, los ajustes, la API (`game.velvetShoppingExperience`) y los prefijos de CSS e i18n
  (`vse-`, `VSE.`) cambian con el. Quien tenga estilos o macros propios que usen los nombres
  viejos debe actualizarlos.
- La ventana trae un fondo incluido (`assets/backgrounds/defaultbg.png`) como fondo por defecto.
  Se puede cambiar o vaciar desde los ajustes del modulo.

### Migracion

- Al cargar el mundo, un GM copia una sola vez los datos guardados con el id viejo: posiciones,
  decorado y sonidos de cada tienda, tamanos fijados a mano, ajustes del mundo y de cliente, y
  los tokens sin vincular. Los datos viejos no se borran. Los compendios no se migran.
- Hay que desactivar e instalar el modulo con su nombre nuevo: Foundry lo ve como un modulo
  distinto.

## 0.9.0

Auditoria del codigo. Seis fallos encontrados y corregidos.

### Corregido

- **Comprar arrastrando se llevaba el monton entero.** Arrastrar una flecha de un monton de
  cuatro compraba las cuatro, y las cobraba. Ahora en una tienda se compra de una en una; en un
  cofre se sigue llevando el monton, que es lo que se espera de un cofre. Con Shift se pregunta
  en los dos casos.
- **Un arrastre abandonado contaminaba el siguiente.** Soltar un objeto fuera de las grillas no
  dispara `drop`, solo `dragend`, y el arrastre seguia vivo: el siguiente objeto que entrase en
  la ventana se tomaba por aquel y se movia el que no era.
- **El foco se quedaba pegado al buscador.** Se recuperaba tras cada redibujado sin consumirse,
  asi que despues de una compra el cursor saltaba solo a la caja de busqueda.
- **La ficha de un objeto podia resucitar una tienda cerrada**: comprar desde ella con la ventana
  ya cerrada volvia a abrirla.
- **`deleteActor` comparaba actores por identidad**, asi que la ventana de una tienda borrada
  podia quedarse abierta cuando el actor venia de un token.
- El buscador y el ajuste de la grilla compartian la misma ranura de debounce con tiempos
  distintos: el primero en crearse decidia por los dos.

### Cambiado

- La cabecera del panel del personaje va **en espejo**: retrato hacia el borde exterior y monedas
  hacia el centro, para que las dos figuras se miren en vez de apretarse contra el divisor.

## 0.8.0

Repaso del manejo del dinero en los dos sistemas.

- **"Tomar todo" ya no puede usarse contra un mercader.** El boton no se dibujaba, pero la accion
  no se comprobaba: `transferEverything` mueve sin cobrar, asi que era una via de saqueo.
- **El saldo se refresca por uuid y no por identidad de objeto.** El actor sintetico de un token
  puede llegar como un objeto distinto en cada hook, y en ese caso las monedas de la cabecera se
  quedaban sin actualizar tras una compra.
- **Un saldo a cero se ensena en vez de desaparecer.** Antes, un personaje sin blanca perdia la
  linea de monedas entera y parecia un fallo del modulo.
- Nueva suite `tests/currency.test.mjs`, 18 comprobaciones sobre el contrato del dinero: que un
  mercader siempre pase por `tradeItems` (que cobra) y un contenedor por `transferItems` (que no),
  que los papeles de comprador y vendedor se inviertan al vender, y que las monedas-objeto de
  PF2e no acaben dibujadas como mercancia arrastrable.

## 0.7.1

- **El dialogo de ajustes pasa a dos columnas** y solo cae a una cuando no hay sitio, con scroll
  interno de reserva. Con identidad, decorado, cuatro sonidos y la grilla, en una sola columna se
  salia de la pantalla y el boton de confirmar quedaba fuera de alcance.
- Todos los campos comparten ahora la misma forma -- etiqueta arriba, control debajo -- para que
  la rejilla quede regular en vez de mezclar filas altas y bajas.

## 0.7.0

- **Nombre de la tienda y nombre del vendedor editables**, en una seccion "Identidad" del dialogo
  de ajustes. El rotulo grande deja de estar atado al nombre del actor -- "Commoner" puede pasar a
  ser "La Espada Mellada" -- y la linea de abajo deja de ser el tipo de pila: en su lugar va quien
  atiende. Vacios, se comportan como hasta ahora.
- El rotulo se usa tambien en la barra de titulo de la ventana.

## 0.6.0

- **Cuatro sonidos por tienda**: bienvenida al abrir, despedida al cerrar, y uno para comprar o
  tomar y otro para vender o guardar. Se eligen con el selector de archivos desde el boton
  "Decorado y ajustes de esta tienda", igual que el fondo, y cada tienda tiene los suyos.
- **Solo los oye quien abre la tienda.** Se reproducen con `socketOptions` en false, asi que no
  viajan por websocket al resto de la mesa. Una mesa entera escuchando la campanilla de cada
  compra ajena seria insoportable.
- Los sonidos de compra y venta suenan **despues** de que Item Piles confirme la transaccion: si
  la rechaza por falta de monedas o de permisos, no suena la caja registradora.
- Nuevo ajuste de cliente "Volumen de la tienda", multiplicado por el volumen de interfaz de
  Foundry. A cero se silencian.
- El dialogo de ajustes de la pila se agrupa ahora en Decorado, Sonidos y Grilla.
- Nueva suite `tests/sound.test.mjs`: 12 comprobaciones de que suena lo que toca cuando toca,
  que nunca se emite a la mesa, y que ni el volumen a cero ni una ruta invalida rompen nada.

## 0.5.0

- **El fondo se dibuja ahora como una `<img>` real detras de los paneles**, en vez de como
  `background-image` alimentado por una variable CSS. La cadena anterior -- custom property con
  `url()` dentro, sustituida en una hoja de estilos, con ruta relativa -- tenia demasiados puntos
  donde romperse, y se rompia. Un `src` de HTML lo resuelve el navegador como cualquier imagen.
- La ruta pasa por `foundry.utils.getRoute`, asi que funciona tambien si el mundo se sirve bajo
  un prefijo de ruta.
- El oscurecido pasa a un pseudo-elemento encima de la imagen; el contenido va por encima de los
  dos.
- `game.velvetShoppingExperience.diagnose()` ahora pide la imagen al servidor con un HEAD y dice si
  responde, para distinguir "la ruta esta mal" de "la imagen no llega".

## 0.4.4

- **El fondo no se pintaba nunca, aunque la ruta fuera correcta.** La imagen se emitia como
  `style="...--vse-scene:url("ruta")"`, y las comillas dobles del `url()` cerraban el atributo
  `style` a mitad: la variable quedaba invalida y con ella toda la regla del fondo, que caia al
  tema de madera. Ahora la ruta se aplica con `setProperty` despues del pintado, donde no hay
  atributo que escapar.
- La prueba que cubria esto solo miraba si la ruta aparecia en el HTML, asi que pasaba con el
  marcado roto. Ahora comprueba que ningun atributo `style` contenga un `url()` y que la ruta
  llegue por la via correcta.

## 0.4.3

- **Una ruta del disco duro dejaba el fondo en blanco sin decir nada.** Foundry solo sirve lo que
  hay dentro de su carpeta de datos, asi que `C:\Users\...\fondo.png` nunca podia cargar. Ahora se
  detecta -- unidad de Windows, `file:`, recurso de red -- y se avisa al GM explicando que hay que
  copiar la imagen dentro de `Foundry_Data/Data`. Las barras invertidas de un copiar y pegar de
  Windows se normalizan solas.
- Nueva suite `tests/paths.test.mjs` con 16 comprobaciones de rutas validas e invalidas.

## 0.4.2

- Los ajustes del decorado se abren ahora desde un boton con etiqueta en la **barra de titulo**
  de la ventana. El engranaje del divisor central seguia funcionando, pero era un icono diminuto
  y sin nombre: nadie iba a encontrar ahi el fondo de la tienda.

## 0.4.1

- **El retrato se salia de su hueco** y tapaba las pestanas y el buscador. La imagen usaba
  `height: 100%`, y cuando ese porcentaje no encuentra contra que resolverse el navegador cae al
  tamano real del archivo: un icono de 512 px se comia media ventana. Ahora la altura es
  explicita, la cabecera reserva su sitio con altura fija y el contenedor recorta por si acaso.

## 0.4.0

Decorado por tienda, ficha de objeto y el precio de vuelta.

### Corregido

- **El precio habia desaparecido de las casillas**, por dos motivos a la vez: se exigia tener un
  personaje elegido para calcularlo, y el modo compacto escondia la etiqueta entera -- nombre y
  precio -- cuando la casilla bajaba de 60 px. Ahora el precio se ve siempre que haya mercader,
  con o sin destinatario, y en casilla pequena solo se sacrifica el nombre: el precio pasa a
  flotar sobre el arte con un degradado detras.

### Anadido

- **Decorado por tienda.** Cada pila guarda su propio fondo y su propio retrato, elegibles con
  el selector de archivos desde el boton de engranaje. Asi la herreria y la botica no se
  parecen. Si una tienda no tiene fondo propio, hereda el del mundo.
- **Retrato grande y sin marco.** Se dibuja a 168 px de alto (configurable de 80 a 320), sin
  borde ni caja, con los bordes desvanecidos por mascara para que la figura se funda con el
  decorado en vez de parecer pegada dentro de un marco.
- **Ficha del objeto** al hacer clic en una casilla: arte grande, precio, rareza, categoria,
  nivel y volumen en PF2e, peso en 5e, cuanto ocupa en la grilla, rasgos y propiedades
  traducidos por el sistema, y la descripcion enriquecida. Con botones para comprar, vender,
  tomar o guardar sin arrastrar, y para abrir la ficha completa del sistema.
  Los datos se leen a la defensiva: lo que el sistema no tenga, no se ensena.
- El clic distingue arrastre de pulsacion, para que soltar un objeto no abra ademas su ficha.

### Pruebas

- `tests/detail.test.mjs`: 21 comprobaciones sobre la ficha, con objetos de PF2e y de 5e, y un
  objeto pelado que no debe producir ni una fila vacia ni un "undefined".
- Regresion del precio y del decorado por tienda en `tests/render.test.mjs`.

## 0.3.0

Auditoria y pulido. Dos fallos visibles corregidos y la taxonomia de objetos completada.

### Corregido

- **La grilla se salia del panel.** Tenia ancho fijo (columnas x casilla), asi que en un panel
  estrecho desbordaba y el navegador la recortaba por los dos lados: habia objetos que no se
  veian ni se podian alcanzar. Ahora se mide el panel y se ajustan columnas y tamano de casilla
  para caber siempre; la grilla solo crece hacia abajo. Se recalcula al redimensionar la ventana.
- **El destinatario podia ser el propio mercader.** Con su token seleccionado, el panel derecho
  mostraba la misma tienda como "tu personaje". Ahora la pila nunca puede ser su propio destino.
- `rarityOf` no detectaba "veryRare": comparaba minusculas contra camelCase.

### Anadido

- **Taxonomia completa de PF2e y D&D 5e**, verificada contra los tipos reales de cada sistema.
  Armas, Armaduras, Municion, Consumibles, Equipo, Herramientas, Contenedores, Tesoro y
  Miscelaneo. Contempla que PF2e tenga `ammo` y `shield` como tipos propios y que 5e meta la
  armadura dentro de `equipment` y la municion dentro de `consumable`. Un sistema desconocido
  se reparte por nombre de tipo y nunca pierde un objeto.
- **Rareza** en el borde de la casilla, con el mismo codigo de color en los dos sistemas.
- **Modo compacto**: con la casilla por debajo de 60 px la etiqueta se esconde sola para no
  robarle sitio al icono.
- Barra de desplazamiento con el tema del modulo.
- Suites nuevas: `tests/taxonomy.test.mjs` (39 comprobaciones sobre tipos reales) y
  `tests/fit.test.mjs` (la grilla no desborda a ningun ancho, de 1200 a 120 px).

### Eliminado

- `release()` en `grid.js`, que no llamaba nadie.

## 0.2.0

Rediseno de la ventana: de lista con rejilla a mostrador de tienda.

- **Cabecera de escena** por panel: retrato grande (usa la imagen de mercader de Item Piles si
  esta configurada), nombre, rol y la descripcion del mercader como cita.
- **Pestanas de categoria** construidas con los tipos que hay de verdad en el inventario, no con
  todos los del sistema. Respetan la categoria personalizada de Item Piles.
- **Buscador** por nombre en cada panel, con el foco recuperado tras el redibujado.
- **Orden** por tipo, nombre o precio. Un orden explicito manda sobre las posiciones guardadas;
  "manual" devuelve el control a la colocacion del jugador.
- **Nombre y precio bajo cada icono**, con la cantidad en una chapa dorada en la esquina.
  Se puede apagar desde los ajustes.
- Tema de madera, laton y pergamino dibujado solo con gradientes, sin archivos de imagen.
  Nuevo ajuste para poner tu propio arte de fondo.
- Casilla por defecto de 52 a 76 px, para que quepa la etiqueta.
- `layoutItems` acepta `preserveOrder`: sin el, el empaquetado por tamano se cargaba el orden
  que acababa de pedir el usuario.
- Panel apilado en vertical cuando la ventana es estrecha.

## 0.1.2

- **Corregido el fallo que dejaba la pila sin abrir nada.** El hook de Item Piles entrega
  `false` -- no `null` -- cuando no hay personaje inspector, y el encadenamiento opcional `?.`
  solo corta con `null` y `undefined`: `false.getFlag()` lanzaba y tumbaba el render entero.
  Ahora todo lo que llega del hook pasa por `toActor`, que ademas acepta un TokenDocument
  cuando `fromUuidSync` devuelve uno en vez de un Actor.
- `setItemSize` escribia el tamano en `flags.item-piles.width`; ahora usa la ruta real,
  `flags.item-piles.item.width`.
- Nueva bateria de regresion en `tests/render.test.mjs` para el destinatario `false`, el
  destinatario TokenDocument y la normalizacion de `toActor`.

## 0.1.1

- **Corregidas las rutas de los flags de Item Piles.** Su configuracion vive en
  `flags.item-piles.data.*` (pila) y `flags.item-piles.item.*` (objeto), no sueltos bajo
  `flags.item-piles`. Por eso no se detectaban el tipo de pila, los objetos ocultos, los que no
  estan a la venta ni los tamanos ya guardados por los vaults.
- Los ajustes de la pila se leen ahora con `getActorFlagData`, que tambien resuelve la
  configuracion guardada en el TokenDocument en vez de en el actor.
- Las columnas y filas dejan de heredarse de Item Piles: sus valores por defecto de vault
  (10x5) pisaban siempre los ajustes de mundo.
- **Red de seguridad**: si la ventana de rejilla falla al abrirse, se avisa en pantalla, se
  registra el error en consola y se reabre la pila con la interfaz nativa de Item Piles. Antes,
  un fallo de render dejaba la pila sin abrir nada, porque el hook ya la habia cancelado.
- Nuevo `game.velvetShoppingExperience.diagnose()` y suite `tests/render.test.mjs`, que reproduce el
  render completo con stubs.

## 0.1.0

Primera version.

- Intercepta `item-piles-preRenderInterface` y abre una ventana de rejilla propia para
  contenedores, pilas de botin y mercaderes. Los vaults siguen usando la interfaz de Item Piles.
- Resolucion de huella en cascada: flag propio, flags de Item Piles, flags de los compendios de
  Fatmorbus, dimensiones del PNG y heuristica por peso (5e) o Bulk (PF2e).
- Doble panel con arrastre entre contenedor y personaje. Transferencias por `transferItems`,
  compraventa por `tradeItems`: ni un solo movimiento de objetos fuera de la API de Item Piles.
- Recolocacion e intercambio dentro de un mismo panel, guardado en un unico flag por actor.
- Precio, cantidad y candado de "no esta a la venta" dibujados sobre cada casilla.
- Capacidad laxa por defecto, con modo de capacidad real configurable por mundo y por pila.
- Arrastre de objetos desde compendios o fichas hacia la pila para el GM.
- Suites de prueba sin dependencias de Foundry para la rejilla y las huellas.
