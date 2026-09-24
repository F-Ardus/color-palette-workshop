# Escala de Values

App web estática que genera paletas para dibujar en claroscuro: cada color ocupa
un escalón de value distinto (value = L* de CIE / 10, de 0 a 10). Uso personal
y para compartir con amigos. Producción: https://values.fardus.dev

## Stack y deploy
- HTML + CSS + módulos ES nativos en `public/`. Sin build ni dependencias de runtime;
  las únicas cargas externas son las fuentes de Google Fonts.
- Worker de Cloudflare solo con assets (`wrangler.toml` → `[assets] directory = "./public"`),
  en el custom domain `values.fardus.dev`. Todo lo que está en `public/` se publica.
- CI (`.github/workflows/deploy.yml`): corre `npm test` en cada push y PR; si pasa y es
  `main`, deploya con wrangler-action (versión fijada, secrets `CLOUDFLARE_API_TOKEN` y
  `CLOUDFLARE_ACCOUNT_ID`). Pushear a main = publicar.
- Entorno: Windows + Git Bash. Node ≥ 22.

## Comandos
- `npm test` — tests con `node --test` (`test/*.test.js`), sin dependencias.
- `npm run dev` — `wrangler dev` en http://localhost:8787. Los módulos no cargan desde `file://`.

## Estructura
- `public/index.html` — markup. `public/styles.css` — tokens en `:root`, tema oscuro por
  `prefers-color-scheme`, layout responsive (en mobile la paleta va antes que los ajustes).
- `public/js/color.js` — OKLab/OKLCH ↔ sRGB, L*, `makeColor`, `valueOfHex`, `greyHex`, `textOn`.
- `public/js/palette.js` — `targetValues`, `hues`, `applyTemperature`, `generatePalette`,
  `minGap`, `roleFor`. Funciones puras; el azar entra por un parámetro `rng`.
- `public/js/storage.js` — localStorage con validación y compatibilidad; historial.
- `public/js/sphere.js` — estudio de luz en canvas. `public/js/export.js` — .aco, zip, PNG, descarga.
- `public/js/app.js` — único módulo que toca el DOM: lee ajustes, renderiza, eventos.
- `public/logo.svg` — logo vectorizado del original `assets/logo.png` (fuente, no se publica).
  `favicon-32.png`, `apple-touch-icon.png` e `icon-512.png` (og:image) se renderizaron desde el SVG;
  si cambia el logo, regenerarlos.

## Modelo
- Ajustes → `generatePalette(settings, paletaActual, rng)` → `{colors, locked, dropped}` →
  `setPalette` → render + guardado.
- La paleta siempre está ordenada de más clara a más oscura. Los colores fijados conservan
  su hex y toman el escalón cuyo value objetivo está más cerca del suyo; si no entran, se
  sueltan y se avisa.
- Low key y high key son espejo exacto (curva 0.62). Con temperatura y una armonía elegida,
  los tonos solo se corren hasta 35° para no romper la armonía.
- `makeColor` itera L de OKLab para clavar el value; error medido < 0.03. No degradarlo:
  hay test que lo verifica.
- localStorage: `ev-settings` (ajustes + `colors` + `locked` + `bw`) y `ev-history` (hasta 8).
  Todo lo leído pasa por `sanitizeSettings` / `sanitizeHistory`; hay datos guardados con el
  formato original (valores como strings, sin `locked`) y tienen que seguir cargando.
- Nunca meter datos del usuario o de storage con `innerHTML`; construir nodos con `textContent`.

## Exportación a Clip Studio Paint
- `.zip` sin compresión hecho a mano (`makeZip`, `crc32`) con `escala-de-values.aco`
  (swatches de Photoshop v1 + v2 con nombres, big-endian) y un PNG de la paleta.
- Ante cualquier cambio en `buildAco`, probar la importación en Clip Studio.

## Convenciones
- Textos de UI en español rioplatense (voseo). Comentarios de código en inglés.
- JS vanilla, sin librerías ni paso de build. Lógica nueva en módulos puros con test;
  `app.js` solo cablea.
