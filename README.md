# Sitio web · Cuerpo Académico UDG-CA-1190

Sitio institucional del Cuerpo Académico **UDG-CA-1190 «Investigación Integrativa
de Factores Biológicos del Proceso Salud-Enfermedad»** (Universidad de Guadalajara ·
CUTlajomulco). Líder: Dr. Jaime Briseño Ramírez.

Construido con **Astro** (sitio estático, *data-driven*). Diseño: concepto
**"Swiss Data Grid"** con la paleta editorial **Lancet**. Estado actual:
**sitio bilingüe con páginas institucionales y herramientas interactivas** de
dengue, propedéutica y virología.

## Requisitos

- Node ≥ 22.12 y npm ≥ 9.6.5 (requisitos de Astro 6; rama Node 22 en `.nvmrc`).

## Comandos

```bash
npm install        # instala dependencias (una vez)
npm run dev        # servidor local con recarga → http://localhost:4321
npm run build      # genera tokens + compila el sitio a dist/
npm run preview    # sirve dist/ (idéntico a producción)
npm run tokens     # regenera src/styles/tokens.css desde design/tokens/*.json
npm run check      # valida Astro/TypeScript
npm run test:performance   # regresiones de reutilización y actualización de gráficas
npm run audit:performance  # audita recursos de dist/; ejecutar después del build
node scripts/check-bib.mjs   # lint del .bib (avisa de campos/DOI faltantes)
```

Los comandos `dev`, `build` y `check` preparan automáticamente las fuentes locales
desde Fontsource. `public/fonts/` y `src/styles/fonts.css` son generados: no se
editan. Virología comparte `/fonts/fonts.css`, `app/css/guide.css` y
`app/js/guide.js`; al trasladarla a otro servidor deben incluirse esos recursos.
La caché anual se aplica únicamente a archivos con hash en el nombre; los datos
y recursos sin versión conservan la revalidación.

Auditoría transversal, mediciones y siguientes prioridades:
[`docs/performance/REVIEW.md`](docs/performance/REVIEW.md).

## Cómo editar contenido (sin tocar código)

Todo el contenido vive en `data/` (YAML) y en un BibTeX. **No** se edita HTML/JS.

| Archivo | Contiene |
|---|---|
| `data/sitio.yml` | Identidad, misión, contacto, redes, KPIs del inicio. |
| `data/integrantes.yml` | Integrantes (líder, integrantes, colaboradores). |
| `data/lineas.yml` | Las 7 líneas de investigación (LGAC) y su color. |
| `data/herramientas.yml` | Herramientas estadístico-predictivas (HEMOPREDICTA, WISCA…). |
| `data/actividades.yml` | Docencia, edición, revisión, divulgación, eventos. |
| `data/publicaciones.bib` | Publicaciones (exportar de Zotero/JabRef). |
| `data/publicaciones.overrides.yml` | Metadatos web por publicación (estado, líneas, PDF). |

Los datos se **validan** al compilar (esquemas Zod en `src/content.config.ts`):
si falta un campo, el build falla con un mensaje claro. Tras editar, `npm run dev`
muestra el cambio; al hacer `git push`, el sitio se redepliega solo.

> ⚠️ Los campos sensibles marcados "verificar" (ORCID, DOI) deben confirmarse
> contra el registro real antes de publicar.

## Diseño

Ver [`design/`](design/README.md): tokens (fuente única de color, sincronizada
con `make_logo.py`), guía de marca, paleta con contraste AA, inventario de
componentes y wireframes. La guía de estilo viva está en `/estilo`.

## Despliegue

- **Hosting:** Vercel Pro (auto-deploy en `git push` a la rama principal; preset
  Astro, salida `dist/`).
- **Dominio:** `udgca1190.com.mx` vía Porkbun (DNS + reenvío de correo).
- El sitio es estático y **portable** a cualquier host (Cloudflare Pages, etc.).

## Estructura

```
design/   Design system (tokens, marca, componentes, wireframes)
data/     Contenido editable (YAML + BibTeX)  ← lo único que se edita a diario
public/   Activos servidos tal cual (logos, favicon)
scripts/  tokens-to-css.mjs, check-bib.mjs
src/      Astro (layouts, components, pages, styles, content.config.ts, lib)
make_logo.py   Generador reproducible del logo del CA
```

## Licencias

- Código: MIT (ver `LICENSE-CODE`).
- Contenido y datos del CA: CC BY 4.0 (ver `LICENSE-CONTENT`).
