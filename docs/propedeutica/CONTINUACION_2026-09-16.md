# Recuperación adicional de registros pendientes

Corte: 2026-09-16. Comparación con `44fa230`. Este documento continúa la
[revisión anterior](REVISION_2026-09-16.md), sin reemplazar sus correcciones.

## Resultado medido

Se revisaron 39 fichas: 37 recibieron al menos un campo antes vacío, una
recuperó las referencias de MEWS y otra precisó la interpretación ordinal de
palidez lingual. Se completaron **121 campos**, sin quitar ninguna métrica
preexistente. Se corrigieron además 12 valores previamente presentes y varias
definiciones de signo, umbral, población o desenlace. Los 1.233 pares `i`/`uid`
permanecen idénticos; no se añadieron ni renumeraron fichas.

| Campo | Antes | Ahora | Recuperados | Aún ausentes |
|---|---:|---:|---:|---:|
| Sensibilidad | 1097 | 1121 | 24 | 112 |
| Especificidad | 1039 | 1059 | 20 | 174 |
| LR+ | 1177 | 1196 | 19 | 37 |
| LR− | 1025 | 1050 | 25 | 183 |
| VPP observado | 51 | 70 | 19 | 1163 |
| VPN observado | 42 | 56 | 14 | 1177 |

Todas las fichas tienen artículos identificados. Siguen siendo 1.230 con
alguna métrica y tres sin ninguna. Las fichas con alguna Sn/Sp/LR ausente
disminuyeron de 269 a **239**; 113 de estas son ordinales. Al incluir VPP/VPN,
las fichas con algún vacío pasaron de 1.196 a **1.179**. Los conteos de campos
y fichas no deben sumarse ni confundirse.

## Procedencia y decisiones relevantes

El registro reproducible es
[`revision_continuacion.json`](../../scripts/propedeutica_sustitucion/revision_continuacion.json).
Contiene UID, índice, PMID, URL, localización, SHA-256, alcance y cambios para
cada ficha, más 35 entradas de fuentes o intentos. Las rutas temporales
identifican las copias consultadas; no son necesarias para regenerar el JSON.
No se versionan textos completos de terceros. No se modificó la Wiki.

| Fichas | Fuente y alcance del cotejo | Resultado |
|---|---|---|
| 365–366 | McGee 2010, PMID 20920693, tabla 3 | Conteos aórticos en 367 evaluables; no usar los 376 reclutados como denominador |
| 558–560 | Park 2005, PMID 15995110, tabla V reproducida en suplemento oficial JBJS, tabla E4 | VPP por categoría; conjunto correcto: arco doloroso, brazo caído e infraespinoso; sin LR−/VPN binarios |
| 681 | Bibliografía del capítulo de UCI entre ediciones y PubMed | Cuatro referencias de MEWS ≥5; conservar la síntesis de 2012, sin trasladar el quinto estudio posterior |
| 779 | Informe original AHRQ/Chou 2022 | Sp de tonometría emparejada con la Sn de la misma síntesis |
| 888, 890–892 | Bundy 2007, PMID 17652298, tablas 2 y 4 de transcripción del artículo | Umbrales y polaridad de fiebre, dolor y recuentos; no invertir LR agrupadas |
| 912–913 | Appelboam 2008, PMID 19066257, tablas 2–3 | Conteos y valores predictivos; separar niños del conjunto evaluable |
| 948–950 | Steiner 2004, PMID 15187057, tabla 3 del PDF | Sn, Sp y LR− de tres signos de deshidratación, con IC y denominadores por signo |
| 958–960 | Van den Bruel 2007, PMID 17727746, artículo y suplementos | Datos observados para impresiones clínica/parental y árbol de neumonía; VPN redondeado a 100% no implica cero falsos negativos |
| 970–971 | Scope 2008 y Gaudy-Marqueste 2017, resúmenes primarios | Criterio de consenso explícito para 970; separar imágenes clínicas de dermatoscópicas en 971 |
| 975 | Saida 2004, PMID 15492186, tablas 3–4 | Tabla 2×2 de melanoma acral, sin mezclar subgrupos |
| 978–979, 981 | Pulia 2024, PMID 38536160, tabla 5 | Misma población para cada pareja; corregir Sn de 979 que procedía de otra tabla |
| 1008, 1011–1012 | Stoltzfus 1999, PMID 10460203, resumen | Anemia grave Hb <7 g/dL, Sn 50/Sp 92; complemento con Sp 8 para ausencia de palidez |
| 1044 | Walton 2004 y tabla 3 de Krill | Paxinos Sn 79/Sp 50; el 96% pertenece a palpación. No incorporar VPP/VPN de escenario al 50% |
| 1046–1049 | Calis 2000, PMID 10627426, tabla reproducida en suplemento JBJS | Sn/Sp/VPP/VPN del pinzamiento subacromial; cotejo indirecto declarado |
| 1072 | Kalantri 2010, PMID 20049324, tabla del artículo | Palidez lingual grave es una categoría; la LR de ausencia de palidez no es su LR− |
| 1082 | McGill 1999, PMID 10189538, resumen | Monofilamento en dos sitios, desenlace pie insensible; no úlcera futura |
| 1093–1095 | McGee 2010 y correspondencia de fichas maestras | Completar desde síntesis del mismo signo/desenlace; alcance indirecto declarado |
| 1109 | Park 2005, tabla II en transcripción del artículo | Sp de Speed recuperada; LR− calculada de la pareja puntual |

La lectura incluyó tablas visuales de los PDF de deshidratación, suplementos
de hombro y suplementos de Van den Bruel. Otras fuentes se consultaron como
XML, HTML, resumen o transcripción; no se afirma revisión visual de todos los
artículos ni verificación primaria de cada cifra heredada.

## Ausencias que permanecen

Esta fue una búsqueda dirigida, no una revisión sistemática exhaustiva de
todos los artículos del catálogo. La meta literal de cero casillas vacías
no está alcanzada. El [inventario actualizado](faltantes.csv) conserva cada
ausencia, PMID y criterio para retomarla; no confunde «no recuperado» con
«no publicado» ni con «no aplicable».

- Tres adenopatías (1103, 1110, 1111; PMID 6412660) siguen sin métricas: el
  texto disponible mide rendimiento de biopsia. Otra cohorte accesible usa
  malignidad como desenlace y no reemplaza el compuesto original.
- En categorías ordinales, una LR de categoría no genera automáticamente
  una LR− o VPN de un umbral binario. No se completan estos campos por fórmula.
- Faltan tablas accesibles o datos emparejados de faringitis, meningitis,
  trabajo respiratorio en neumonía, apnea, ALT-70 de 2018 y palpación
  acromioclavicular. La vía adicional Scite tampoco dio acceso completo a
  esos seis artículos. No se contrataron accesos ni se hicieron compras.
- Persisten series sin controles, rangos no emparejados, OCR insuficiente,
  denominadores contradictorios y valores predictivos no publicados o no
  recuperados. Los escenarios de prevalencia supuesta permanecen separados.
- La errata de Shah 2017 se cotejó en JAMA; corrige un ejemplo bayesiano y
  redacción, sin aportar Sn/Sp para el hallazgo pendiente.

## Comprobaciones

- 33 pruebas de regresión correctas, incluidos denominadores, polaridad,
  categorías ordinales, exclusión de VPP/VPN supuestos y correspondencia UID.
- JSON válido, identificadores preservados y regeneración idéntica byte por byte.
- Comprobación sintáctica de JavaScript correcta. `npm run check`: cero errores,
  cero advertencias y 75 sugerencias preexistentes.
- Compilación correcta: 33 páginas. Navegador local: MEWS, Park, Paxinos,
  celulitis en inglés y cobertura de la página contenedora. Único error de
  consola: favicon local 404. En producción se comprobaron MEWS, Park y
  celulitis (español/inglés), incluidas referencias, cifras y notas.
- Implementación `95a239d` enviada a `origin/main`. Vercel confirmó el
  despliegue. JSON y JavaScript de las URLs canónicas idénticos byte por byte
  a los archivos locales, comprobados después de la publicación.
- El primer build simultáneo con check falló por una colisión del archivo
  temporal de Astro; se ejecutó de nuevo secuencialmente y terminó correctamente.
- El rótulo de porcentajes calculados dice ahora «conteos publicados del estudio»,
  para incluir también tablas por categorías y árboles de clasificación.

SHA-256 del catálogo:
`83762d828880bddf24693038c30d5bb326d7373cf6c432ee26702974eda0cc1e`.
`PDFS_POR_CONSEGUIR.xlsx` se conservó sin modificación y fuera de Git;
SHA-256 `40fc5a50f525f24d4718bb27b7948f411117bb6d6dd163f46dc55eb206ece382`.
