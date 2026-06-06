# Paleta Lancet — roles y contraste

Paleta editorial de *The Lancet* (`ggsci::lanonc`), elegida para el CA y usada en
el logo (`make_logo.py`). **El color codifica significado.** Fuente de verdad:
`design/tokens/colors.json`.

## Tabla

| Token | HEX | Rol | Contraste sobre blanco |
|---|---|---|---|
| `--c-blue` | `#00468B` | Primario/marca: titulares, links, bloques sólidos | 8.6:1 ✓ AA |
| `--c-teal` | `#0099B4` | Acento: kickers, barras, indicador activo | 3.3:1 — solo ≥24px/bold o fill con texto blanco |
| `--c-red` | `#ED0000` | Línea RAM / estado | solo bold/grande o fill |
| `--c-green` | `#42B540` | Línea educación / estado "publicado" | solo bold/grande o fill |
| `--c-wine` | `#AD002A` | Línea COVID / acento fuerte | 6.9:1 ✓ AA |
| `--c-purple` | `#925E9F` | Línea genómica | 4.2:1 ✓ AA grande |
| `--c-gray` | `#5B6770` | Texto suave, metadatos, líneas | 5.6:1 ✓ AA |
| `--c-ink` | `#1B1919` | Texto de cuerpo | 17:1 ✓ AAA |
| `--c-bg` | `#FFFFFF` | Fondo base (lienzo suizo) | — |
| `--c-panel` | `#F4F5F7` | Paneles, celdas alternas, cards | — |
| `--c-line` | `#DADEE3` | Líneas de retícula hairline | — |
| `--c-navy` | `#202945` | Footer institucional (azul marino UdeG, 533C) | texto blanco 13:1 ✓ |
| `--c-gold` | `#FDCF85` | Filete dorado UdeG (1345C) | **NUNCA texto** (falla AA); solo filete/fill con navy encima |

## Asignación de color por línea de investigación

| Línea | Color |
|---|---|
| Resistencia antimicrobiana | `red` |
| Infectología clínica | `blue` |
| Epidemiología espacial | `teal` |
| COVID-19 y poblaciones vulnerables | `wine` |
| Genómica de patógenos | `purple` |
| Educación médica | `green` |
| Calidad y seguridad hospitalaria | `gray` |

## Reglas

- Cuerpo de texto: **siempre** `--c-ink` sobre `--c-bg`/`--c-panel`.
- Teal y rojo: no usar como texto pequeño; sí como relleno con texto blanco.
- Dorado UdeG: exclusivo del footer, como filete o fondo con navy encima.
- El navy y el dorado UdeG son **solo institucionales** (footer); el resto del
  sitio es paleta Lancet.
