# Wireframe — Producción académica (Swiss Data Grid)

Tabla ordenable (tomada del estilo suizo). Estado como celda de color.

```
│ ■ PRODUCCIÓN ACADÉMICA                              │
│ [ Todas ][ Publicadas ][ Sometidas ][ En prep. ]    │  ← filtros (chips)
├────┬───────────────────────────┬────────┬────┬──────┤
│ #  │ Título                    │ Revista│ Año│Estado│  ← cabecera mono, ordenable
├────┼───────────────────────────┼────────┼────┼──────┤
│ 01 │ In-Hospital Mortality …   │ Med Sci│2026│ ▣pub │  ← estado = celda de color
│ 02 │ Chronic Kidney Disease …  │Kidney360│2024│ ▣pub │
│ 03 │ Social Determinants …     │ Viruses│2026│ ▣som │
│ …  │ …                         │ …      │ …  │ …    │
├────┴───────────────────────────┴────────┴────┴──────┤
│ ● en conjunto   ○ individual   DOI → enlace mono     │
└──────────────────────────────────────────────────────┘
```

Notas: fuente = `data/publicaciones.bib` (+ overrides). Render Vancouver vía
`lib/formatCita.mjs`. Estado: ▣verde publicado / ▣teal sometido / ▢gris en prep.
Agrupar opcionalmente por año (eje vertical) como alternativa a la tabla.
