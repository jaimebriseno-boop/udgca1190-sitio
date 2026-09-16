# Progreso — propedéutica basada en evidencia

Actualizado: 2026-09-16. Continuación de `44fa230`.

## Resultado actual

Se completaron **121 campos antes vacíos en 37 fichas**, dentro de una revisión
dirigida de 39 registros. Además se corrigieron 12 cifras previamente presentes
con errores de correspondencia, redondeo o criterio, y se recuperaron las cuatro
referencias de MEWS ≥5. Los 1.233 identificadores se conservaron.

- 1.233 fichas con artículos identificados; ninguna cita pendiente.
- 1.230 con alguna métrica; tres adenopatías siguen sin métricas recuperables.
- 239 con alguna Sn/Sp/LR ausente, frente a 269 al comenzar.
- 1.179 con algún vacío al incluir VPP/VPN, frente a 1.196; no sumar estos conteos.

| Campo | Con dato | Sin dato |
|---|---:|---:|
| Sensibilidad | 1121 | 112 |
| Especificidad | 1059 | 174 |
| LR+ | 1196 | 37 |
| LR− | 1050 | 183 |
| VPP observado | 70 | 1163 |
| VPN observado | 56 | 1177 |

**No se alcanzó cero casillas vacías.** La recuperación se limitó a fuentes
verificables y definiciones compatibles. Entre las 239 fichas incompletas en
Sn/Sp/LR, 113 son ordinales; no generar LR−/VPN binarios para ellas. Otras
requieren tablas completas, denominadores verificables o datos que no aparecen
en las fuentes accesibles. No se sustituyeron VPP/VPN observados por escenarios.

## Evidencia y pendientes

- [Informe de esta continuación](docs/propedeutica/CONTINUACION_2026-09-16.md).
- [Inventario reproducible de faltantes](docs/propedeutica/faltantes.csv).
- [Registro por UID, fuentes y hashes](scripts/propedeutica_sustitucion/revision_continuacion.json).
- [Guía de regeneración](scripts/propedeutica_REGENERATE.md).
- [Handoff](SESSION_HANDOFF.md).

La Wiki permanece sin modificación. El recorrido previo de cuatro maestras y
428 notas sigue documentado en `docs/propedeutica/wiki-trazabilidad.json`.
`PDFS_POR_CONSEGUIR.xlsx` permanece intacto y fuera de Git.

## Validación y publicación

33 pruebas correctas; comprobación JavaScript correcta; `npm run check` con
0 errores, 0 advertencias y 75 sugerencias preexistentes. Regeneración idéntica
byte por byte. Navegador local comprobado: MEWS, Park, celulitis en inglés,
Paxinos y página contenedora con 1.233 referencias.

Compilación final correcta: 33 páginas. Implementación publicada en `95a239d`,
enviado a `origin/main`; Vercel confirmó despliegue correcto. JSON y JavaScript
servidos idénticos byte por byte a los locales. Fichas de MEWS, Park y celulitis
verificadas también en producción (español e inglés).
URL: <https://udgca1190.com.mx/herramientas/propedeutica>.
SHA-256 del catálogo actualizado:
`83762d828880bddf24693038c30d5bb326d7373cf6c432ee26702974eda0cc1e`.
