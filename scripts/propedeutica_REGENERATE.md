# Regenerar los datos de la herramienta

La app de `app/` es **autocontenida**: no tiene dependencias externas ni build.
Lo único que se regenera es `app/data/signos.json`.

## Origen de los datos

El archivo se produce desde la base de trabajo del proyecto *«Del síntoma al
diagnóstico»*, cuya copia canónica vive (desde 2026-08-08) en el vault privado:

    /Users/jaibri/Jaibri/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs

a partir de tres archivos:

| Archivo de origen | Aporta |
|---|---|
| `maestra_borrador.jsonl` | Hallazgos parseados de McGee 3.ª ed. que aún funcionan como índice |
| `externos_verificado.jsonl` | Hallazgos con cifras del artículo original, verificadas verbatim |
| `enriquecimiento.jsonl` | Nomenclatura en español, epónimos y maniobras |

**Importante:** la maestra contiene la compilación protegida de McGee y este
repo es público — los datos crudos NO se versionan aquí, solo en el vault.

## Comando

```sh
python3 scripts/propedeutica_generar_signos.py \
  --datos  "/Users/jaibri/Jaibri/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs" \
  --salida "public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json"
```

No requiere dependencias: solo la biblioteca estándar de Python 3.

## Sustitución de registros índice → full

Los registros `idx` se van convirtiendo en `full` conforme se localizan y
verifican las cifras en el artículo original (PubMed, texto completo OA o PDF
aportado). El pipeline completo (resolución de referencias, descarga de
abstracts, búsquedas alternativas, generación de digests para agentes,
verificación verbatim y conversión) está versionado en
`scripts/propedeutica_sustitucion/` — ver su README.

## Qué se publica y qué no

El generador separa los registros en dos clases mediante el campo `f`:

- **`f: "full"`** — los hallazgos con cifras verificadas contra su fuente
  primaria. Se publican todas las cifras (sensibilidad, especificidad, razones
  de verosimilitud e intervalos), la población estudiada, el PMID, el DOI y la
  **cita textual del resumen** que respalda cada dato. Cuando hay Sn+Sp o LR,
  la ficha muestra además los **VPP/VPN calculados por el proyecto** a
  prevalencias preprueba supuestas (5 %, 20 % y 50 %), con nota aclaratoria.

- **`f: "idx"`** — los 696 hallazgos cuyo rendimiento diagnóstico está compilado
  en McGee S. *Evidence-Based Physical Diagnosis*, 3.ª ed. (Elsevier, 2012).
  Se publica lo que es aportación del proyecto —nomenclatura en español,
  descripción de la maniobra, patrón de referencia (cuando la caja lo declara),
  clasificación cualitativa— y el **localizador exacto** (caja EBM y página)
  para consultar la cifra en la obra. Las cifras no se reproducen: su selección
  y disposición son compilación del autor.

  Desde 2026-09-16 la app **ya no muestra avisos de restricción**: los registros
  `idx` se presentan como entradas documentadas en la obra (etiqueta «McGee 3e»)
  y las cifras que la fuente primaria no publica (p. ej. Sn/Sp cuando el
  artículo solo da LR) aparecen como «No publicado en la fuente».

  Pendientes del libro (no inventables desde el vault): 30 celdas `idx` sin
  patrón de referencia en las cajas EBM 8-1, 14-1, 16-3, 17-3, 30-2, 31-2 y
  65-2; el bloque «Patrón de referencia» queda vacío y su localizador es la
  referencia pendiente. Y 191 registros `full` sin Sn y/o Sp porque el artículo
  citado solo publica razones de verosimilitud: se muestran explícitamente, sin
  rellenar con valores no verificados.

Si en el futuro se obtiene **autorización expresa de Elsevier**, basta con poner
`PUBLICAR_CIFRAS_MCGEE = True` en `scripts/propedeutica_generar_signos.py` y volver a generar: la app
ya sabe mostrar la ficha completa de cualquier registro marcado como `full`.

## Reacentuación

El pipeline de dominios externos normalizó su texto en español a ASCII. El
generador restituye los diacríticos de forma conservadora: aprende del propio
corpus acentuado (McGee/enriquecimiento) la forma correcta de cada palabra,
la combina con un léxico curado a mano, y **deja intactas las formas ambiguas**
(`esta`/`está`, `mas`/`más` suelto, `publico`/`público`, `medico`/`médico`…).
Ver `BLOQUEADAS` y `LEXICO` en el script.

## Parámetros de URL de la app

| Parámetro | Efecto |
|---|---|
| `?lang=es` · `?lang=en` | Idioma de la interfaz y de los nombres de signos |
| `?embed=1` | Modo embebido: reporta su altura al contenedor por `postMessage` |
| `?signo=<i>` | Abre directamente la ficha de un hallazgo |
| `?q=<texto>` | Precarga una búsqueda |
