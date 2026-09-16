# Handoff — herramienta de propedéutica

Fecha: 2026-09-16. Repositorio:
`/Volumes/Bioinformatics/Programacion/UDG-CA-1190`.

## Leer primero

1. [PROGRESS.md](PROGRESS.md): estado, cobertura y pendientes.
2. [Revisión detallada](docs/propedeutica/REVISION_2026-09-16.md).
3. [Inventario de faltantes](docs/propedeutica/faltantes.csv).
4. [Regeneración y semántica de campos](scripts/propedeutica_REGENERATE.md).

## Pedido y autorización del usuario

Completar el desempeño diagnóstico de signos clínicos (Sn, Sp, LR+, LR−,
VPP y VPN) usando `/Volumes/Bioinformatics/Wiki`. Cargar `obsidian-cli` y
`obsidian-markdown`; obligatoriamente ejecutar `obsidian backlinks` en cada
nota maestra y leer sus wikilinks salientes, tanto del cuerpo como `related_*`.
Eliminar la columna Origen, conservar Veredicto y citar el artículo que
origina el dato, no el libro. Dejar vacío lo no identificado. Hacer commit
y push. La meta declarada fue que la herramienta no tuviera datos faltantes.

La última instrucción fue guardar progreso/handoff para continuar en un nuevo
contexto. No ampliar investigación durante este cierre. No hay autorización
para inventar valores, equiparar escenarios a observaciones ni modificar la Wiki.

## Publicado y estado Git

- Rama: `main`; remoto: `https://github.com/jaimebriseno-boop/udgca1190-sitio.git`.
- `d9e395f`: primera recuperación de métricas, referencias e interfaz.
- `7abada6`: revisión dirigida de 51 extracciones de artículos; 81 fichas
  modificadas, 219 campos vacíos completados respecto a la primera publicación.
- `e5a49af96f97e54b826cfdc934a1e87ee49ea7cd`: cotejo de cuidados intensivos,
  diez citas recuperadas, otros 26 campos completados y corrección de veredictos.
- Esos tres commits fueron enviados a `origin/main`. Vercel confirmó el
  despliegue de `e5a49af`; además se verificaron el archivo servido y fichas
  renderizadas en el navegador. Este handoff añade solo documentación.
- URL pública: <https://udgca1190.com.mx/herramientas/propedeutica>.
- Aplicación interna: `/herramientas/propedeutica-basada-en-evidencia/app/index.html`.
  `?signo=684` abre una ficha; `?lang=en` cambia idioma; `?q=Murphy` busca.
- JSON: `public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json`.
- SHA-256 local/producción al cierre:
  `ef8f7859ba996f5d7524705fced4e96b6d3f85e09a1b9f3a5ad4de41e65c795b`.

Antes de crear los documentos, el único archivo sin seguimiento era
`PDFS_POR_CONSEGUIR.xlsx`. No abrirlo como si fuera una salida de esta acción,
no borrarlo, no sobrescribirlo y no agregarlo al commit sin un motivo nuevo.
Su SHA-256 en este corte:
`40fc5a50f525f24d4718bb27b7948f411117bb6d6dd163f46dc55eb206ece382`.
El servidor local de pruebas iniciado para la implementación fue detenido.

## Mapa de archivos y fuentes

| Archivo/ruta | Función |
|---|---|
| `scripts/propedeutica_generar_signos.py` | Generador, identificadores, escenarios y veredicto |
| `scripts/propedeutica_evidencia.py` | Correspondencias, citas, correcciones y cálculos |
| `scripts/propedeutica_sustitucion/revision_wiki.json` | Correcciones manuales de maestras y fuentes con alcance de verificación |
| `scripts/propedeutica_sustitucion/revision_textos_wiki.json` | 81 revisiones con UID, PMID, ruta, líneas y hashes; registro de 51 textos examinados |
| `scripts/propedeutica_sustitucion/articulos.json` | Metadatos PubMed de los 298 PMID externos |
| `scripts/test_propedeutica.py` | 25 pruebas de regresión |
| `public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js` | Interfaz, métricas, citas y calculadora |
| `src/components/pages/PropedeuticaPage.astro` | Página contenedora y cobertura dinámica |
| `docs/propedeutica/wiki-trazabilidad.json` | Backlinks, wikilinks resueltos y hashes de 428 notas |

Datos canónicos de entrada, solo lectura:
`/Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs`.
La guía de regeneración identifica los seis JSONL usados. Las notas maestras
y los resultados del recorrido obligatorio están enumerados en la revisión
detallada. No reconstruir ese recorrido desde memoria ni afirmar una revisión
visual de todos los PDF: se trabajó con notas, extracciones, tablas y algunas
fuentes primarias recuperadas en línea.

Skills para continuar: `/Users/judithcita/.agents/skills/obsidian-cli/SKILL.md`
y `/Users/judithcita/.agents/skills/obsidian-markdown/SKILL.md`.
Para nuevas notas maestras, mantener el requisito de backlinks y lectura de
enlaces salientes. Para internet, usar también la skill `agent-reach`.

## Reglas que deben conservarse

- Los identificadores `i=0..1212` se conservaron; las 20 nuevas fichas de soplos
  se agregaron al final. No renumerar enlaces publicados.
- `f: full` indica alguna métrica disponible; no demuestra completitud ni
  verificación primaria. `base: sintesis` tampoco equivale a texto completo leído.
- Los valores faltantes se omiten del JSON y se muestran en blanco.
- No invertir LR agrupadas para recuperar Sn/Sp; no promediar rangos ni
  presentarlos como IC95. No convertir NS a LR=1.
- Una pareja puntual de Sn/Sp puede derivar LR faltantes con nota de redondeo.
  Conteos `tabla2x2` pueden completar porcentajes y LR. `derivadas` y
  `porcentajes_calculados` identifican cálculos.
- `vpp`/`vpn` son de la población estudiada; `vps` son escenarios supuestos
  de 5%, 20% y 50%. No llenar VPP/VPN observados con esos escenarios.
- Categorías ordinales no reciben LR−/VPN inferidos como si fueran umbrales
  binarios. Solo cambiar esto cuando el artículo confirme el umbral y sus conteos.
- Mantener cero, `"Infinity"` como JSON válido y 0/0 como ausente.
- Citas de artículos en `refs`; no sustituirlas por citas del libro. Una referencia
  recuperada de la bibliografía no certifica cotejo de sus resultados originales.
- «Cambio mínimo» requiere todas las LR evaluables entre 0,5 y 2; una LR
  cercana a 1 no debe ocultar el cambio producido por la otra.

## Correcciones recientes que no deben perderse

- Grissom, PMID 19885995 / PMC4900681: i=516–518 y 683–685. Tablas 1 y 2,
  n=405, índice cardíaco <2,5. «Al menos uno», «los tres» y su complemento
  son pruebas binarias verificadas; antes estaban etiquetadas incorrectamente
  como categorías. Conteos y cálculo complementario están documentados.
- Monnet, PMID 16540963: i=686. Aumento de presión de pulso ≥12% **tras elevar
  las piernas**, no variación respiratoria. Sn 60%, Sp 85%, n=71 del resumen
  original. Sustituye un rango cuya atribución no se pudo establecer; no mezclar
  con los 70/92 de variación respiratoria en Lafanechère.
- Tokuda, PMID 12566553: i=115, 116 y 690. Tablas 1 y 3, n=115, valores
  predictivos y conteos. Se cotejó el texto del artículo indexado de una copia
  pública. El intento con Jina devolvió CAPTCHA; ese archivo NO es evidencia.
- Kaplan, PMID 11303155: i=514, 515 y 682. Cita recuperada de tabla 52-2;
  se conserva la estimación de la síntesis, sin afirmar tabla primaria revisada.
  La ficha de sepsis ya no arrastra por error la referencia de Grissom.
- i=687: respiración asincrónica con movimiento abdominal anormal espiratorio;
  desenlace intubación o muerte, no un diagnóstico genérico de UCI.
- i=222/689 y 225/688: desenlaces corregidos a derrame pleural en SDRA e
  intubación bronquial, respectivamente, en lugar de EPOC.

Las demás correcciones de signos, polaridad, umbrales y denominadores figuran
en los registros de revisión; no reemplazarlas con una nueva importación bruta.

## Pendientes concretos y orden para retomar

La meta de cero faltantes permanece pendiente; no marcarla alcanzada por
tener compilación correcta o citas en casi todas las fichas. El estado del
objetivo de la sesión anterior fue `blocked`; no confundirlo con cierre científico.

1. Confirmar Git y el hash actual antes de cambiar nada. Leer `faltantes.csv`
   y distinguir datos no recuperados de métricas que no aplican a una categoría.
2. Resolver la única cita vacía: MEWS ≥5, UID `C00866`, i=681. Las referencias
   4–7 de la estimación agrupada no están en la bibliografía local. Subbe 2001
   figura como desarrollo de la escala y no basta para atribuirle ese rango.
3. Priorizar artículos con posibilidad de recuperar una tabla 2×2 para las
   269 fichas con alguna Sn/Sp/LR vacía. Consultar primero el registro de los
   51 textos ya revisados para evitar repetir búsquedas infructuosas.
4. Las adenopatías i=1103, 1110, 1111 (PMID 6412660) carecen de las seis
   métricas: el texto disponible ofrece rendimiento de biopsia. Se necesita
   evidencia válida de desempeño del hallazgo; no convertir rendimiento de
   biopsia en sensibilidad o VPP del signo clínico.
5. Para VPP/VPN observados, buscar valores publicados o conteos con
   denominador y población definidos. Hay 51 VPP y 42 VPN, frente a 1.184
   fichas con escenarios completos o parciales. Estos universos son distintos.
6. Registrar cada adición con fuente, localización y alcance real del cotejo;
   regenerar, actualizar cobertura/inventario, verificar y publicar únicamente
   cambios sustentados. La autorización original incluye commit y push.

## Comandos para la siguiente implementación

```sh
cd /Volumes/Bioinformatics/Programacion/UDG-CA-1190
git status --short
git log -5 --oneline
shasum -a 256 public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json

python3 scripts/propedeutica_generar_signos.py \
  --datos /Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs \
  --salida public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json \
  --fecha 2026-09-16
python3 -m unittest discover -s scripts -p 'test_propedeutica.py'
node --check public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js
npm run check
npm run build
```

La fecha anterior reproduce este corte; usar la fecha real de la revisión
cuando haya cambios nuevos. No hace falta regenerar ni repetir pruebas
costosas solo por leer este handoff. Para verificar interfaz local, `npm run dev -- --host 127.0.0.1` y la skill de navegador disponible.
Después del push, comprobar el despliegue y el JSON servido, no solo Git.

## Evidencia auxiliar temporal

`/private/tmp/propedeutica-20260916` conserva instantáneas previas,
`grissom.xml`, metadatos PubMed, registros de compilación y copias descargadas
del JSON publicado. Puede desaparecer: no es la fuente canónica del proyecto.
No ejecutar ciegamente los scripts exploratorios temporales, en especial
`revision_textos.py`, porque pueden volver a aplicar versiones anteriores de
las correcciones. Los registros versionados y el generador son la ruta reproducible.

Para empezar el nuevo contexto: «Lee PROGRESS.md y SESSION_HANDOFF.md y
continúa con los pendientes de propedéutica, preservando las correcciones
publicadas y sin completar datos que no estén sustentados».
