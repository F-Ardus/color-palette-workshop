# Palettekit

Sitio estático con herramientas para armar paletas propias (no un catálogo de paletas hechas).
Uso personal y para compartir con amigos. Producción: https://palettekit.fardus.dev

Herramientas:
- **Generador de paletas** (`/`): paletas por armonía de tonos. Con "Escalar values" (por defecto)
  cada color ocupa un escalón de value distinto, pensado para claroscuro (value = L* de CIE / 10,
  de 0 a 10); sin escalar, cada color toma un value al azar dentro del rango.

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
  la barra pasa a menú desplegable por debajo de 1024px de ventana.
- `public/js/nav.js` — menú desplegable de la barra lateral; lo carga cada página.
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

## Sumar una herramienta
- Una página HTML por herramienta en `public/` (p. ej. `public/contraste/index.html`), con el mismo
  bloque `.app` / `.sidebar` / `.topbar` y `js/nav.js`. El markup de la barra está copiado en cada
  página: al sumar una herramienta, agregar su link en la `<nav>` de todas y marcar la actual con
  `aria-current="page"`. Si las páginas pasan de tres o cuatro, conviene generar la barra desde un módulo.
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
- Textos de UI en español rioplatense (voseo). Comentarios de código en inglés.
- JS vanilla, sin librerías ni paso de build. Lógica nueva en módulos puros con test;
  `app.js` solo cablea.
