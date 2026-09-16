# Handoff — continuación de propedéutica

Fecha: 2026-09-16. Repositorio: `/Volumes/Bioinformatics/Programacion/UDG-CA-1190`.

## Leer primero

1. [PROGRESS.md](PROGRESS.md): cobertura vigente y validación.
2. [Continuación detallada](docs/propedeutica/CONTINUACION_2026-09-16.md).
3. [Inventario de faltantes](docs/propedeutica/faltantes.csv).
4. [Revisión histórica](docs/propedeutica/REVISION_2026-09-16.md) y
   [guía de regeneración](scripts/propedeutica_REGENERATE.md).

## Objetivo y autorización

El usuario retomó `44fa230` y pidió completar registros pendientes hasta donde
fuera posible. La autorización heredada incluye commit y push. Se realizó una
búsqueda dirigida adicional, con 121 campos recuperados y 39 fichas revisadas.
No se afirma una revisión sistemática exhaustiva ni cero campos faltantes.

Conservar: Wiki de solo lectura; referencias al artículo; ausencia literal
cuando no hay respaldo; VPP/VPN observados separados de escenarios supuestos;
columna Origen eliminada y Veredicto conservado. Las skills de Obsidian y el
recorrido obligatorio previo de 428 notas están documentados. Para una nueva
nota maestra, ejecutar backlinks y leer sus wikilinks del cuerpo y `related_*`.

## Estado técnico y publicación

Rama `main`; remoto `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`.
Base de esta continuación: `44fa230`; implementación previa `e5a49af`.
Publicación de esta continuación: pendiente de cotejo final.

- Página: <https://udgca1190.com.mx/herramientas/propedeutica>.
- Aplicación: `/herramientas/propedeutica-basada-en-evidencia/app/index.html`.
- Parámetros: `?signo=681`, `?lang=en`, `?q=Murphy`.
- JSON: `public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json`.
- SHA-256: `83762d828880bddf24693038c30d5bb326d7373cf6c432ee26702974eda0cc1e`.

33 pruebas pasan. Regeneración idéntica; sintaxis JavaScript correcta; Astro
check sin errores/advertencias (75 sugerencias). Navegador local comprobado; build final correcto (33 páginas).
El navegador integrado no estaba disponible; se utilizó Playwright CLI.

## Archivos y reproducción

Entrada canónica, sin modificar:
`/Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs`.

El generador `scripts/propedeutica_generar_signos.py` y el enriquecedor
`scripts/propedeutica_evidencia.py` aplican, en orden, las revisiones previas y
`scripts/propedeutica_sustitucion/revision_continuacion.json`. Este último
incluye 39 revisiones y 35 entradas de fuentes/intentos. Se aplica después de
crear variantes, por UID y verificando el índice; no modificar el JSON público
a mano. Las fuentes temporales no son dependencias del generador.

`scripts/propedeutica_inventario.py` regenera el CSV con seis métricas, PMID,
tipo ordinal/hallazgo y motivo conservador de cada ausencia. Las pruebas en
`scripts/test_propedeutica.py` funcionan sin Wiki ni red.

```sh
python3 scripts/propedeutica_generar_signos.py \
  --datos /Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs \
  --salida public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json \
  --fecha 2026-09-16
python3 scripts/propedeutica_inventario.py
python3 -m unittest discover -s scripts -p 'test_propedeutica.py'
node --check public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js
npm run check
npm run build
```

Ejecutar check/build/dev secuencialmente: comparten archivos temporales de
Astro. El primer build simultáneo con check tuvo una colisión de caché; no es
un fallo clínico del catálogo. Cambiar la fecha si se realiza otra revisión.

## Correcciones que deben conservarse

Los 1.233 pares `i`/`uid` son estables. El registro detallado contiene todas
las adiciones, con fuentes y alcance; no reimportar los datos brutos por encima.

- MEWS: cuatro referencias de la síntesis de 2012; no transferir LR+ 4,7 de
  una edición posterior ni atribuir el rango únicamente a Subbe 2001.
- Park: desgarro completo usa arco doloroso, brazo caído e infraespinoso;
  VPP por categoría observado, sin LR−/VPN inferidos.
- Codo: 1.736 evaluables, incluidos 778 niños; no usar 1.740 reclutados.
- Van den Bruel: árbol de neumonía con impresión parental, no otro árbol con
  impresión del médico. VPN 100% redondeado: existe un falso negativo.
- Patito feo 970: criterio explícito de consenso ≥2/3, no sensibilidad media
  individual; 145 lesiones de 12 pacientes seleccionados.
- Celulitis 979: Sn 93,5/Sp 38,4 de tabla 5; no mezclar Sn 96,8 de validación
  cruzada de tabla 4. ALT-70 y combinación tienen n=175, térmica n=204.
- Palidez: Hb <7 g/dL, Sn 50/Sp 92; ausencia de palidez es el complemento.
- Paxinos: Sn 79/Sp 50; Sn 96 es palpación. No añadir VPP/VPN al 50% de la revisión.
- Monofilamento: desenlace pie insensible, dos sitios; no úlcera futura.
- Las correcciones previas de Grissom, Monnet, Tokuda, soplos, umbrales y
  polaridad permanecen en los registros anteriores y sus pruebas.

## Para una próxima ampliación

1. Empezar por el CSV vigente y el registro de fuentes ya intentadas.
2. Priorizar tablas originales de PMID 22048053, 20974781, 28763554, 23989984,
   30003987 y 15069148. Las vías consultadas, incluida Scite, no dieron acceso
   a las tablas necesarias. No se hicieron compras.
3. Adenopatías 1103/1110/1111: distinguir exactitud del signo y rendimiento de
   biopsia. No sustituir el desenlace compuesto por cáncer aislado.
4. No invertir LR agrupadas, promediar rangos, combinar cohortes o umbrales,
   ni convertir categorías ordinales en pruebas binarias sin fuente explícita.
5. Obtener VPP/VPN observados o conteos exactos; mantener vacíos los demás.
6. Después de nuevos datos: regenerar, probar, revisar interfaz, publicar y
   cotejar el JSON servido; Git o build por sí solos no prueban el despliegue.

## Archivos ajenos y temporales

`PDFS_POR_CONSEGUIR.xlsx` no se abrió, modificó ni agregó. SHA-256 intacto:
`40fc5a50f525f24d4718bb27b7948f411117bb6d6dd163f46dc55eb206ece382`.

Copias y extracciones de investigación en
`/private/tmp/propedeutica-continuacion-20260916`; pueden desaparecer. No
reaplicar scripts exploratorios temporales: los JSON de revisión versionados
son la fuente de las correcciones. Conservar también el historial del handoff
anterior en `44fa230` para detalles del primer recorrido.
