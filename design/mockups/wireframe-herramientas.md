# Wireframe — Herramientas (Swiss Data Grid)

Sección estratégica: debe lucir. Cada card con bloque de color (dominio) y badge
de tecnología.

```
│ ■ HERRAMIENTAS / MÉTODOS                            │
│ Métodos estadístico-epidemiológicos y predictivos.  │
├──────────────┬──────────────┬───────────────────────┤
│ ███ rojo     │ ███ rojo     │ ███ teal              │  ← barra de color = línea
│ HEMOPREDICTA │ WISCA BAYES. │ ANÁLISIS ESPACIAL     │
│ [R][Stan]    │ [R][brms]    │ [Py][R]               │  ← tags de tecnología
│ Priorización │ Antibiograma │ Rt · Moran's I · LISA │
│ bayesiana de │ ponderado    │                       │
│ hemocultivos │ por síndrome │                       │
│ ▣ Beta       │ ▣ Activa     │ ▢ Interno             │  ← estado
├──────────────┼──────────────┴───────────────────────┤
│ ███ púrpura  │  STACK                                │
│ GENÓMICA     │  R · Python · Stan · sf/spdep ·       │
│ [Py]         │  tidyverse · IQ-TREE                  │
└──────────────┴───────────────────────────────────────┘
```

Notas: fuente = `data/herramientas.yml`. Mejora futura: glifo/sparkline por
método (curva bayesiana, heatmap WISCA, mapa LISA) para reforzar el "qué hace".
Página por herramienta en `/herramientas/[slug]`.
