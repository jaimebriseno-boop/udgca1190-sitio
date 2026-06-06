# Inventario de componentes

Componentes base del Concepto "Swiss Data Grid". Implementados en
`src/components/` y demostrados en `/estilo`.

| Componente | Archivo | Estado | Descripción |
|---|---|---|---|
| Header | `Header.astro` | ✅ base | Sticky, logo horizontal + Nav, borde hairline inferior, blur. |
| Nav | `Nav.astro` | ✅ base | Links mono en versalitas; activo = bloque de color azul bajo el label. |
| Footer | `Footer.astro` | ✅ base | Institucional navy + filete dorado UdeG; logo en placa blanca. |
| KPIs | `Kpis.astro` | ✅ base | Números grandes en celdas con retícula hairline. |
| BadgeLinea | `BadgeLinea.astro` | ✅ base | Cuadro de color sólido + label; color = línea. |
| Card | `Card.astro` | ✅ base | Card con barra de color superior (color de línea), kicker, título, cuerpo. |
| Tag | `grid.css` (`.tag`) | ✅ base | Chip plano para tecnología (R/Python) y estado. |
| Botón | `grid.css` (`.btn`) | ✅ base | Bloque sólido azul; variante `--ghost`. |
| Ítem de publicación | `lib/formatCita.mjs` | ✅ base | Cita Vancouver desde BibTeX, con número, estado y DOI. |

## Pendientes (paso siguiente)

| Componente | Para |
|---|---|
| CardIntegrante | Página Integrantes (foto B/N→color en hover, ORCID, líneas). |
| Tabla de producción ordenable | Página Producción (estado como celda de color). |
| CardHerramienta enriquecida | Página Herramientas (glifo/sparkline de método). |
| Menú móvil | Nav responsive (hamburguesa) en viewport pequeño. |
| Selector de idioma | Bilingüe ES/EN. |

## Primitivas CSS (en `src/styles/`)

`base.css` — reset, tipografía, `.kicker`, `.serif`, `.display`, `.prose`,
`.text-muted`, `.skip-link`.
`grid.css` — `.container`, `.grid` (12 col), `.section`, `.rule`, `.panel`,
`.kpis/.kpi`, `.badge-linea`, `.tag`, `.btn`, `.color-block`, `.col-guide`.
`tokens.css` — **generado** (`--c-*`, `--fs-*`, `--sp-*`, etc.).
