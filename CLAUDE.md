# Palettekit

Sitio estático con herramientas para armar paletas propias (no un catálogo de paletas hechas).
Uso personal y para compartir con amigos. Producción: https://palettekit.fardus.dev

Herramientas:
- **Generador de paletas** (`/`): paletas por armonía de tonos. Con "Escalar values" (por defecto)
  cada color ocupa un escalón de value distinto, pensado para claroscuro (value = L* de CIE / 10,
  de 0 a 10); sin escalar, cada color toma un value al azar dentro del rango.
- **Paleta desde una foto** (`/foto/`): extrae de 3 a 24 colores de una imagen (k-means en OKLab sobre una
  copia de 256px, determinístico), ordenados por value, con el % de la imagen que ocupa cada uno y la
  imagen repintada solo con ellos (o en grises). "Automático" busca 24 y une lo que no se distingue
  (`mergeClusters`: primero lo que ocupa <0.4%, después pares más cerca que `mergeDistance(detalle)`).
  "Randomizar colores" (`recolor.js`) cambia los tonos según una armonía del generador manteniendo value y
  saturación de cada color; agrupa los tonos parecidos de la foto y manda cada grupo a un tono de la
  armonía (±20° como máximo). Cada tarjeta tiene ojo (ver solo ese color en la imagen, el resto en gris;
  también tocando la tarjeta, Escape para salir), refresh (`rerollOne`: otro tono, mismo value y saturación;
  a los grises les da 0.3 de saturación) y candado (lo respeta "Randomizar colores" y "Originales").
  Extraer de nuevo borra fijados y resaltado. La imagen nunca sale del navegador.
- **Creador de paletas** (`/crear/`): paleta a mano de 0 a 24 colores. Arranca al azar (`generatePalette` sin
  escalar y armonía al azar), pegando hex (panel o Ctrl+V en cualquier lado; `parseHexList` acepta la salida
  de "Copiar hex", links, CSS, etc.) o de cero. Editar con selector de color o campo hex, mover, borrar,
  agregar, ordenar por value; todo con Deshacer / Ctrl+Z. La dirección de la página siempre es el link a la
  paleta actual (`/crear/?colors=...`, se actualiza con `replaceState`). Exporta imagen PNG 1200×630
  (`palette-image.js`), link (compartir en pantallas táctiles), hex, .aco y al generador (primeros 9). "Abrir en el generador" pasa la paleta
  por URL; si hay más de 9 colores, los 9 que más ocupan (`topByShare`).

## Stack y deploy
- HTML + CSS + módulos ES nativos en `public/`. Sin build ni dependencias de runtime;
  las únicas cargas externas son las fuentes de Google Fonts.
- Worker de Cloudflare (`wrangler.toml`, nombre `escala-de-values`: no renombrarlo, crearía otro
  Worker que choca con los dominios ya asignados). Sirve `public/` como assets; todo lo que está
  ahí se publica. `src/worker.js` corre primero (`run_worker_first`) y redirige con 301 el
  subdominio viejo `values.fardus.dev` a `palettekit.fardus.dev`; el resto va a los assets.
  Ojo: una entry de Worker solo puede exportar handlers (una constante exportada rompe el runtime).
- CI (`.github/workflows/deploy.yml`): corre `npm test` en cada push y PR; si pasa y es
  `main`, deploya con wrangler-action (versión fijada, secrets `CLOUDFLARE_API_TOKEN` y
  `CLOUDFLARE_ACCOUNT_ID`). Pushear a main = publicar.
- Entorno: Windows + Git Bash. Node ≥ 22.

## Comandos
- `npm test` — tests con `node --test` (`test/*.test.js`), sin dependencias.
- `npm run dev` — `wrangler dev` en http://localhost:8787. Los módulos no cargan desde `file://`.
  La redirección de subdominio no se puede probar local (dev reescribe el host); la cubre `test/worker.test.js`.

## Estructura
- `public/index.html` — Generador de paletas. `public/styles.css` — tokens en `:root`, tema oscuro por
  `prefers-color-scheme`, shell (barra lateral + contenido) y estilos de la herramienta.
  Los breakpoints del contenido son container queries sobre `.content` (su ancho real, sin la barra);
  la barra pasa a menú desplegable por debajo de 1024px de ventana. Con el contenido por debajo de 860px,
  los ajustes quedan arriba de la paleta como panel plegable (`#controlsToggle`, cerrado al cargar,
  alto máximo 50vh con scroll interno); en escritorio siempre están abiertos a la izquierda.
- `public/js/nav.js` — menú desplegable de la barra lateral; lo carga cada página.
- `public/js/ui.js` — helpers de DOM compartidos (`el`, `button`, `iconButton`, `toast`, `announce`, `copy`);
  cada página tiene `#toast` y `#announce`.
- `public/foto/index.html` + `public/js/foto-app.js` — la herramienta de foto. `public/js/extract.js` — puro:
  `extractPalette`, `extractAuto`, `kmeans`, `posterize` sobre bytes RGBA. `public/js/recolor.js` — puro:
  `recolor`, `groupHues`. Preferencias propias en localStorage `pk-foto`.
- `public/crear/index.html` + `public/js/crear-app.js`. `public/js/hexlist.js` — puro: `parseHexList`,
  `hexListParam`, `colorsFromParam` (listas de 1 a 24). `public/js/palette-image.js` — `imageLayout` (puro)
  y `drawPaletteImage`. Guarda en localStorage `pk-crear`.
- Pasar una paleta entre herramientas: `/?colors=RRGGBB,...` (`paletteParam` / `paletteFromParam` en
  `storage.js`). El generador la toma al cargar, manda la paleta anterior al historial, limpia la URL y la ordena por
  value (salvo sin escalar con "Ordenar por value" apagado): las herramientas pueden mandar cualquier orden.
- `public/icons.svg` — sprite con los íconos de Lucide que se usan (ISC, crédito en el archivo). En HTML:
  `<svg class="icon" aria-hidden="true"><use href="/icons.svg#nombre"/></svg>`; desde JS, `icon(nombre)` de
  `public/js/icons.js`. Para sumar uno, copiar su SVG de `lucide-static` como `<symbol id="nombre">`; los
  estilos del trazo salen de la clase `.icon`, no del sprite.
- `public/js/color.js` — OKLab/OKLCH ↔ sRGB, L*, `makeColor`, `valueOfHex`, `greyHex`, `textOn`.
- `public/js/palette.js` — `targetValues`, `hues`, `applyTemperature`, `generatePalette`,
  `minGap`, `roleFor`. Funciones puras; el azar entra por un parámetro `rng`.
- `public/js/storage.js` — localStorage con validación y compatibilidad; historial.
- `public/js/sphere.js` — estudio de luz en canvas. `public/js/export.js` — .aco, zip, PNG, descarga.
- `public/js/app.js` — el único módulo del generador que toca el DOM: lee ajustes, renderiza, eventos.
- `public/logo.svg` — logo vectorizado del original `assets/logo.png` (fuente, no se publica).
  `favicon-32.png`, `apple-touch-icon.png` e `icon-512.png` (og:image) se renderizaron desde el SVG;
  si cambia el logo, regenerarlos.

## Idiomas (i18n)
- Textos en `public/i18n/es.json` y `en.json`: claves planas por sección (`nav.*`, `common.*`, `gen.*`,
  `photo.*`, `create.*`, `role.*`…), `{marcadores}` y plurales como `clave_one` / `clave_other`.
- `public/js/i18n.js` se importa antes que todo (top-level await): detecta idioma (`pk-lang` en localStorage,
  si no el del navegador, si no inglés), carga el JSON, traduce el markup y expone `t(clave, vars)`,
  `tn(clave, n)`, `lang`, `LANGS`, `setLang` (guarda y recarga).
- Markup: `data-i18n="clave"` pone el textContent; `data-i18n-attr="aria-label:clave,title:otra"` atributos.
  El texto va en su propio `<span>` para no pisar íconos ni inputs. El HTML queda escrito en español y
  tiene que coincidir con es.json (lo verifica un test).
- Cada página tiene en el `<head>` un script inline que oculta la página (`i18n-loading`) hasta que se
  traduce, si el idioma no es español; replica `detect()` de i18n.js, mantenerlos iguales.
- Los módulos puros no traducen: devuelven claves (p. ej. `roleFor` → `'midLight'`, la UI usa `t('role.' + …)`).
- `test/i18n.test.js` exige mismas claves y marcadores en todos los idiomas, que exista toda clave usada en
  HTML y JS, y que no sobren claves. Para sumar un idioma: nuevo JSON + entrada en `LANGS` + el snippet del head.
- El selector está en el menú de configuración al pie de la barra lateral (`nav.js`).

## Sumar una herramienta
- Una página HTML por herramienta en `public/` (p. ej. `public/foto/index.html`), con el mismo
  bloque `.app` / `.sidebar` / `.topbar` y `js/nav.js`. El markup de la barra está copiado en cada
  página (con su menú de configuración): al sumar una herramienta, agregar su link en la `<nav>` de todas y marcar la actual con
  `aria-current="page"`. En páginas de subcarpetas, rutas absolutas (`/styles.css`, `/js/...`). Si las páginas pasan de tres o cuatro, conviene generar la barra desde un módulo.
- Lógica en módulos puros con test; un módulo `*-app.js` por página que cablea el DOM.

## Modelo (Generador de paletas)
- Cada color sale de una receta `{hue, jitter, pick}` que no depende de los ajustes: `jitter` (-1..1)
  es su lugar en la variación de saturación y `pick` (0..1) su lugar en el rango de values cuando no
  se escala. Las recetas van ordenadas de clara a oscura (la temperatura depende de ese orden).
- `generatePalette(settings, paletaActual, rng)` sortea recetas nuevas. `adjustPalette(settings,
  paletaActual)` reusa las recetas (estiradas con `resampleRecipes` si cambia la cantidad) y solo
  aplica los ajustes nuevos. Ambas devuelven `{colors, locked, recipes, dropped}`.
- Con "Mantener tonos" (`keep`), los cambios de ajustes llaman a `adjustPalette`, salvo armonía y
  temperatura, que siempre sortean. "Generar" siempre sortea. Solo sortear agrega al historial.
- El botón de refresh de cada color llama a `rerollColor`: tono y saturación nuevos (al menos 30° de
  diferencia, con el sesgo de temperatura de su posición) y el mismo value; apunta al value objetivo del
  escalón para no desviarse con refreshes repetidos. Los colores fijados no se pueden re-sortear.
- Sin escalar, cada tarjeta tiene un slider de value (entre "más oscuro" y "más claro"): `setColorValue`
  cambia ese color sin reordenar mientras se arrastra (las tarjetas se repintan en su lugar) y al soltar
  se guarda; si "Ordenar por value" está prendido, `sortPalette` reordena y el foco sigue al slider.
- Paletas sin recetas (guardadas antes, o del historial) las reconstruyen con `recipeFromHex`
  (tono y saturación leídos del hex con `hueOfHex` / `satOfHex`).
- Escalada, la paleta siempre está ordenada de más clara a más oscura. Sin escalar, "Ordenar por value"
  (`order`, arriba de las tarjetas) decide si se reordena al soltar un slider o al ajustar; apagado, las
  tarjetas quedan en el orden que el usuario dejó. Por eso todo lo que habla de "el más claro / el más
  oscuro" (roles, "Apagar los extremos", temperatura del refresh, esfera) usa `rankOf` por value, nunca
  la posición de la tarjeta. Los colores fijados conservan
  su hex y toman el escalón cuyo value objetivo está más cerca del suyo; si no entran, se
  sueltan y se avisa.
- Low key y high key son espejo exacto (curva 0.62). Con temperatura y una armonía elegida,
  los tonos solo se corren hasta 35° para no romper la armonía.
- `makeColor` itera L de OKLab para clavar el value; error medido < 0.03. No degradarlo:
  hay test que lo verifica.
- localStorage: `ev-settings` (ajustes, incluidos `scale`, `keep` y `bw`, + `colors` + `locked` +
  `recipes`) y `ev-history` (hasta 8, solo hex). Las claves `ev-*` quedan por compatibilidad.
  Todo lo leído pasa por `sanitizeSettings` / `sanitizeHistory`; hay datos guardados con el
  formato original (valores como strings, sin `locked`) y tienen que seguir cargando.
- Nunca meter datos del usuario o de storage con `innerHTML`; construir nodos con `textContent`.
- Para ocultar cosas se usa el atributo `hidden`; `styles.css` tiene `[hidden]{display:none!important}`
  porque clases como `.field` ponen `display` y si no le ganarían. En tests de navegador, chequear
  `getComputedStyle(...).display`, no el atributo.

## Exportación a Clip Studio Paint
- `palettekit.zip` sin compresión hecho a mano (`makeZip`, `crc32`) con `palettekit.aco`
  (swatches de Photoshop v1 + v2 con nombres, big-endian) y un PNG de la paleta.
- Ante cualquier cambio en `buildAco`, probar la importación en Clip Studio.

## Convenciones
- Textos de UI en español rioplatense (voseo) y en inglés, siempre por i18n (nunca texto fijo en el JS).
  Comentarios de código en inglés.
- JS vanilla, sin librerías ni paso de build. Lógica nueva en módulos puros con test;
  `app.js` solo cablea.
