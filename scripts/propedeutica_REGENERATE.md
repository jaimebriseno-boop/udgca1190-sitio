# Regenerar los datos de propedéutica

La aplicación es autocontenida. El generador produce
`public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json`;
Astro utiliza sus metadatos para mostrar la cobertura en la página del sitio.

## Fuentes y trazabilidad

La base canónica consultada está en:

`/Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs`

Se leen `maestra_borrador.jsonl`, `externos_verificado.jsonl`,
`enriquecimiento.jsonl`, `fuentes.jsonl`, `apendice_match.jsonl` y
`mcgee_apendice.jsonl`. La Wiki se utiliza solo para lectura.

El enriquecimiento de `scripts/propedeutica_evidencia.py` incorpora:

- `propedeutica_sustitucion/revision_wiki.json`: correspondencias revisadas,
  referencias de encabezados, correcciones de maniobra/desenlace y cifras.
- `propedeutica_sustitucion/articulos.json`: metadatos bibliográficos recuperados
  con PubMed efetch para los 298 PMID de los registros externos.
- `docs/propedeutica/REVISION_2026-09-16.md`: cobertura, limitaciones y validación.
- `docs/propedeutica/wiki-trazabilidad.json`: notas maestras, backlinks,
  enlaces salientes y hashes de las notas leídas, sin reproducir su contenido.

## Regeneración y comprobaciones

```sh
python3 scripts/propedeutica_generar_signos.py \
  --datos /Volumes/Bioinformatics/Wiki/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs \
  --salida public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json \
  --fecha 2026-09-16
python3 -m unittest discover -s scripts -p 'test_propedeutica.py'
node --check public/herramientas/propedeutica-basada-en-evidencia/app/js/app.js
npm run check
npm run build
```

Python solo requiere la biblioteca estándar. El generador mantiene los
identificadores `i` ya publicados y agrega al final los desenlaces adicionales.
Comprobar en navegador las fichas, búsqueda, calculadora, rangos, cero, infinito
 y los idiomas español e inglés antes de publicar.

## Interpretación de los campos

`f: full` significa que existe alguna métrica; no certifica que todas estén
completas o verificadas en el artículo. `idx` significa que no se recuperó
ninguna de las seis métricas solicitadas. Este indicador no se muestra como
columna de origen ni como certificado de evidencia.

Las cifras no recuperadas se omiten del JSON y sus casillas quedan vacías.
`NS` conserva el resultado no significativo de la fuente; no se convierte en 1.
Se mantienen rangos e intervalos por separado. Las LR calculadas con Sn/Sp
puntuales llevan `derivadas`; no se invierten LR agrupadas ni se promedian
rangos para obtener Sn/Sp. Las categorías ordinales no generan una LR negativa.
`"Infinity"` representa infinito con JSON válido; 0/0 sigue vacío.

`vpp` y `vpn` son valores observados publicados. `vps` contiene escenarios
calculados a probabilidades preprueba supuestas de 5, 20 y 50 %, con LR
publicadas como primera opción. La interfaz explica esta diferencia.

`refs` contiene citas de artículos, con PMID/DOI cuando se localizaron. Se
aceptan también artículos identificados por autor, título, revista, año y
páginas en la bibliografía original. No se sustituyen con la cita del libro.
Las fuentes de síntesis se identifican internamente como `base: sintesis` y
la ficha aclara que sus cifras pueden resumir varios artículos. No se afirma
que cada artículo haya sido revisado en texto completo.

## URLs

| Parámetro | Efecto |
|---|---|
| `?lang=es` / `?lang=en` | Idioma |
| `?embed=1` | Integración mediante iframe |
| `?signo=<i>` | Abre una ficha conservando los enlaces anteriores |
| `?q=<texto>` | Precarga una búsqueda |
