# Progreso — Bioestadística abierta

Actualizado: 17 de septiembre de 2026 (madrugada). Leer después [HANDOFF.md](HANDOFF.md).

## Estado del corte

Carpeta de trabajo: worktree de Orca `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta`,
rama `jaimebriseno-boop/Bioestadistica-abierta` (sigue a `origin/jaimebriseno-boop/Bioestadistica-abierta`).
La rama lleva `origin/main` fusionado (`b9e00e6`, con los dos commits de propedéutica posteriores a la
base) y NO está fusionada en `main`: nada de esta sección está publicado en udgca1190.com.mx. Se
publica con el visto bueno del dueño sobre las páginas reales y el merge a `main` (Vercel).

| Hito | Estado | Commit |
|---|---|---|
| H0 · Cimientos + calculadora «IC de una proporción» | Terminado y verificado | `e69d80b` |
| H1 · Vertical completa: prueba diagnóstica 2×2, posprueba (Fagan), valores predictivos | **Terminado y verificado; pendiente del visto bueno del dueño y del merge** | ver `git log` (commit `BIOESTADISTICA: H1 …`) |
| H2 · Asociación 2×2 (RR/OR/RRA/NNT, χ²/Fisher, McNemar) + columnas pegadas (descriptivos, IC media, Hozo) | Pendiente (siguiente) | — |
| H3 · Tamaño de muestra (C1–C7), kappa, Kaplan-Meier (opcional ROC) | Pendiente | — |
| H4 · webR («Verificar con R», consentimiento, ClientRouter, política de hosts) | Pendiente | — |
| H5 · Modelos (logística, Cox, lineal, ICC) con webR | Pendiente | — |
| H6 · Enlace con Propedéutica (`?signo=`) | Pendiente | — |
| H7 · Documentación (README, COMO_AÑADIR, CHANGELOG de fixtures) | Pendiente | — |

## Hecho en H1

- Tres calculadoras del grupo «Pruebas diagnósticas», bilingües, con YAML + módulo puro + casos +
  fixture de R + prueba: `prueba-diagnostica-2x2` (Sn, Sp, VPP, VPN, prevalencia, exactitud, índice de
  Youden, LR±, DOR; selector del método de IC y corrección de Haldane-Anscombe), `probabilidad-posprueba`
  (Bayes en momios, nomograma de Fagan) y `valores-predictivos` (VPP/VPN para cualquier prevalencia, IC
  logit de Mercaldo, frecuencias naturales por 1,000, curvas frente a la prevalencia).
- Métodos nuevos en `src/lib/bioestadistica/metodos/`: `razones.ts` (log-Wald: Simel, Woolf, Haldane),
  `diagnostico.ts` (núcleo 2×2), `bayes.ts`, `predictivos.ts` (Mercaldo estándar y ajustado).
- Gráficas: `DatosGrafica` es una unión (`ic-forest` con paneles apilados, `fagan`, `curvas`) y
  `nucleo/svg.ts` las dibuja sin DOM; estilos globales por tokens en `Grafica.astro`.
- Interfaz: `Tabla2x2Input.astro` (tabla con `<th scope>`, totales como `<output>`, ordinales 1–4 con
  leyenda), `CampoOpcion.astro` (selector genérico; el nivel de confianza también lo usa),
  `CalculadoraPage` reparte campos, tabla y selectores según el YAML (`tabla2x2`, `opciones`);
  el controlador repinta totales (`[data-total]`) y exporta los rótulos de las opciones.
- Contenido y esquema: `content.config.ts` admite `tabla2x2` y `grafica: curvas` y exige los rótulos de
  tabla y de cada opción en los dos idiomas; 4 claves `bio.ui.*` nuevas; 19 referencias nuevas en
  `referencias.bib` con PMID y DOI comprobados contra PubMed y Crossref; `formatCita` no añade punto tras
  un título que termina en «?».
- Pruebas: `prueba-diagnostica-2x2.test.ts` (47), `probabilidad-posprueba.test.ts` (29),
  `valores-predictivos.test.ts` (40), `svg.test.ts` ampliada (33), `contenido.test.ts` ampliada
  (gráficas por tipo, tabla 2×2, selectores, claves huérfanas), `util.ts` con `contextoDePrueba` y
  `conDerivadas`; perfiles nuevos en `tolerancias.ts` sin aflojar ninguno.
- Docs: DECISIONES (sección H1 con todas las desviaciones y su motivo), PROGRESO, HANDOFF.

## Verificación conservada (H1)

`npm run build` 47 páginas (10 de la sección: índice + 4 calculadoras × 2 idiomas) · `npm run check` 0
errores / 0 advertencias (124 hints preexistentes) · `npm run test` 4 + 471 pruebas ·
`npm run fixtures:bio:check` sin deriva (4 calculadoras, 54 casos: 13 + 17 + 10 + 14; 0 discrepancias
TS/R en ningún campo, incluidos ∞, `NA` y las certezas) · `npm run audit:performance` sin recursos
externos ni faltantes · capturas de las tres páginas en ES y EN a 1280 px, 400 px e impresión (PDF)
revisadas · revisión de código independiente (agente `code-reviewer`) con sus hallazgos corregidos.

Pendiente ajeno a la sección: `audit:performance -- --check-data-baseline` sigue fallando porque
`signos.json` de propedéutica cambió en `main` y `docs/performance/baseline.json` no se actualizó.

## Siguiente paso

1. Mostrar al dueño las páginas reales (vista previa de Vercel de la rama o `npm run preview -- --host
   127.0.0.1 --port 4321` → `/herramientas/bioestadistica/`) y recoger correcciones de texto o de
   interpretación.
2. Con su visto bueno: merge a `main` (publica en udgca1190.com.mx) y anotar en
   `docs/performance/REVIEW.md` la secuencia de verificación de la sección.
3. Empezar H2 leyendo [HANDOFF.md](HANDOFF.md) (sección «H2 · siguiente») y [DECISIONES.md](DECISIONES.md).
