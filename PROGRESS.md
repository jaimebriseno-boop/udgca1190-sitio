# Progreso — propedéutica basada en evidencia

Actualizado: 2026-09-16. Leer después [SESSION_HANDOFF.md](SESSION_HANDOFF.md).

## Estado del corte

La actualización está publicada en <https://udgca1190.com.mx/herramientas/propedeutica>.
Último commit de implementación: `e5a49af96f97e54b826cfdc934a1e87ee49ea7cd`,
en `main` y `origin/main`. Los commits anteriores de esta acción son
`d9e395f` y `7abada6`. Este handoff se guarda en un commit documental posterior.

**La meta literal de cero faltantes NO está alcanzada.** El objetivo de esta
sesión quedó marcado como bloqueado por los datos pendientes, no como completo.
El usuario pidió conservar el progreso y continuar en un contexto nuevo.

## Hecho

- Skills `obsidian-cli` y `obsidian-markdown` utilizadas; backlinks de las
  cuatro notas maestras y lectura de sus enlaces salientes, incluidos campos
  `related_*`. Trazabilidad de 428 notas; Wiki sin modificar.
- Columna Origen eliminada; Veredicto conservado y corregida su clasificación.
- 723 campos antes vacíos completados en las 1.213 fichas originales;
  incluye cálculos identificados. Se añadieron 20 fichas de desenlaces de soplos,
  con otras 40 LR, preservando los identificadores anteriores.
- 1.233 fichas, 1.230 con alguna métrica y 1.232 con artículos identificados.
- VPP/VPN observados separados de los escenarios de prevalencia supuesta.
- Commit, push, despliegue y comprobación real en navegador realizados.

## Pendiente

| Campo | Fichas con dato | Fichas sin dato |
|---|---:|---:|
| Sensibilidad | 1097 | 136 |
| Especificidad | 1039 | 194 |
| LR+ | 1177 | 56 |
| LR− | 1025 | 208 |
| VPP observado | 51 | 1182 |
| VPN observado | 42 | 1191 |

269 fichas tienen al menos una Sn/Sp/LR ausente. Si se incluyen VPP/VPN,
son 1.196 fichas con algún campo vacío; estos conteos no son sumables.
Algunas ausencias corresponden a categorías ordinales sin LR− binaria.
Tres adenopatías (i=1103, 1110, 1111) carecen de las seis métricas.
Una cita sigue vacía: MEWS ≥5 (i=681). Detalle en
[faltantes.csv](docs/propedeutica/faltantes.csv).

## Verificación conservada

En el corte de implementación: 25 pruebas correctas, `npm run check` con
0 errores/0 advertencias y 75 sugerencias, `npm run build` correcto (33 páginas),
regeneración idéntica y comprobación de fichas en producción.
Estas pruebas no se ejecutaron de nuevo para guardar únicamente el handoff.

Al preparar este handoff se recalcularon las coberturas y se volvió a cotejar
el JSON local con el servido en producción: idénticos byte por byte.
SHA-256: `ef8f7859ba996f5d7524705fced4e96b6d3f85e09a1b9f3a5ad4de41e65c795b`.

El archivo ajeno a esta acción `PDFS_POR_CONSEGUIR.xlsx` sigue sin seguimiento
en Git y no fue modificado ni agregado.

## Siguiente paso

Leer el handoff y el inventario de faltantes; priorizar nuevas fuentes que
aporten tablas 2×2 o cifras para el mismo signo, umbral, población y desenlace.
No repetir ni revertir las revisiones ya documentadas y no llenar ausencias
con valores supuestos. La continuación clínica se deja al nuevo contexto.
