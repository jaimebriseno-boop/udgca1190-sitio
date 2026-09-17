# Progreso — Bioestadística abierta

Actualizado: 16 de septiembre de 2026 (noche). Leer después [HANDOFF.md](HANDOFF.md).

## Estado del corte

Carpeta de trabajo: worktree de Orca `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta`,
rama `jaimebriseno-boop/Bioestadistica-abierta` (sigue a `origin/jaimebriseno-boop/Bioestadistica-abierta`).
La rama parte de `main` = `44fa230` y NO está fusionada: nada de esta sección está publicado en
udgca1190.com.mx. Se publica al cerrar H1, tras la revisión del dueño, con merge a `main` (Vercel).

| Hito | Estado | Commit |
|---|---|---|
| H0 · Cimientos + calculadora «IC de una proporción» | **Terminado y verificado** | `e69d80b` |
| H1 · Vertical completa: prueba diagnóstica 2×2, posprueba (Fagan), valores predictivos | Pendiente (siguiente) | — |
| H2 · Asociación 2×2 (RR/OR/RRA/NNT, χ²/Fisher, McNemar) + columnas pegadas (descriptivos, IC media, Hozo) | Pendiente | — |
| H3 · Tamaño de muestra (C1–C7), kappa, Kaplan-Meier (opcional ROC) | Pendiente | — |
| H4 · webR («Verificar con R», consentimiento, ClientRouter, política de hosts) | Pendiente | — |
| H5 · Modelos (logística, Cox, lineal, ICC) con webR | Pendiente | — |
| H6 · Enlace con Propedéutica (`?signo=`) | Pendiente | — |
| H7 · Documentación (README, COMO_AÑADIR, CHANGELOG de fixtures) | Pendiente | — |

## Hecho en H0

- Contenido: colección `calculadoras` (Zod) y enum `seccion`; 5 tarjetas + bloque en Herramientas;
  95 claves `bio.*` en i18n (ES/EN) y helper `tPrefijo`; `data/bioestadistica/referencias.bib`;
  `loadBib(ruta)` y `formatCita` con libros, capítulos, PMID e idioma.
- Biblioteca pura `src/lib/bioestadistica/` (primitivas numéricas validadas contra R 4.5.2,
  proporciones con la aritmética de `binom`, núcleo, calculadora `ic-proporcion`).
- Capa del navegador `src/bioestadistica/`, componentes `src/components/bioestadistica/`,
  páginas `CalculadoraPage` e índice, rutas `[slug]` es/en.
- Pipeline de validación: `scripts/bio-fixtures.mjs` + `tests/bioestadistica/**`
  (el código R del YAML se ejecuta byte a byte con Rscript; fixtures commiteados).
- Docs: PLAN, ESPECIFICACION, ARQUITECTURA, MOTOR, DECISIONES (desviaciones justificadas).

## Verificación conservada (H0)

`npm run build` 37 páginas · `npm run check` 0 errores / 0 advertencias (121 hints preexistentes) ·
`npm run test` 4 + 261 pruebas · `npm run fixtures:bio:check` sin deriva (13 casos, 247 comparaciones
TS/R, 0 discrepancias) · 12,347 comparaciones de primitivas contra R · `npm run audit:performance`
sin recursos externos ni faltantes · capturas de escritorio, móvil (400 px) e impresión revisadas ·
revisión de código independiente (2 altos, 6 medios) con todo corregido y cubierto por pruebas.

Pendiente ajeno a la sección: `audit:performance -- --check-data-baseline` falla porque `signos.json`
de propedéutica cambió en `main` (`e5a49af`) y `docs/performance/baseline.json` no se actualizó.

## Siguiente paso

Leer [HANDOFF.md](HANDOFF.md) y [DECISIONES.md](DECISIONES.md); construir H1 con el mismo patrón que
`ic-proporcion` (YAML + módulo puro + casos + fixture + test); cerrar con la secuencia de verificación;
mostrar al dueño las páginas reales (vista previa de Vercel de la rama o `npm run preview`) y, con su
visto bueno, merge a `main`.
