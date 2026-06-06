# Design System — UDG-CA-1190

Sistema de diseño del sitio del Cuerpo Académico **UDG-CA-1190 «Investigación
Integrativa de Factores Biológicos del Proceso Salud-Enfermedad»** (UdeG · CUTlajomulco).

Concepto: **"Swiss Data Grid"** — estilo tipográfico internacional (suizo):
retícula visible, sans grotesca, bloques de color planos, mucho blanco, cero
ornamento. El color **codifica significado** (cada línea, estado y tecnología
tiene su color de la paleta Lancet), nunca decora.

## Estructura

```
design/
├── README.md              ← este archivo (guía y tono)
├── tokens/                ← FUENTE DE VERDAD (JSON) → genera src/styles/tokens.css
│   ├── colors.json        ← paleta Lancet (sincronizada con make_logo.py)
│   ├── typography.json    ← familias + escala modular 1.333
│   └── spacing.json       ← escala 8px + parámetros de retícula
├── brand/
│   ├── logo-usage.md      ← reglas de uso del logo
│   └── palette-lancet.md  ← tabla de color + roles + contraste AA
├── components/
│   └── inventory.md       ← inventario de componentes y estados
└── mockups/               ← wireframes lo-fi (ASCII) por sección
```

## Flujo de trabajo del color

1. La paleta vive en `design/tokens/colors.json` (y debe coincidir con
   `make_logo.py`, que genera el logo).
2. `npm run tokens` ejecuta `scripts/tokens-to-css.mjs` y regenera
   `src/styles/tokens.css` (variables CSS). **No editar `tokens.css` a mano.**
3. Los componentes y páginas usan solo variables `--c-*`, `--fs-*`, `--sp-*`.

## Tono

Sobrio, técnico, de élite académica. Frases claras, datos al frente, números
grandes. Evitar adornos. La credibilidad la dan la retícula, el contraste y el
uso disciplinado del color semántico.

## Fuentes

Vía **Fontsource** (self-hosted, sin dependencia de Google en producción):
`Inter Variable` (UI/titulares), `Source Serif 4 Variable` (nombre del CA),
`IBM Plex Mono` (datos/DOI/badges).
