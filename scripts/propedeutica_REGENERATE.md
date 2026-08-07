# Regenerar los datos de la herramienta

La app de `app/` es **autocontenida**: no tiene dependencias externas ni build.
Lo único que se regenera es `app/data/signos.json`.

## Origen de los datos

El archivo se produce desde la base de trabajo del proyecto *«Del síntoma al
diagnóstico»* (repositorio propio, rama `CULS`), a partir de tres archivos:

| Archivo de origen | Aporta |
|---|---|
| `datos/maestra_borrador.jsonl` | 876 hallazgos parseados de McGee 3.ª ed. |
| `datos/externos_verificado.jsonl` | 309 hallazgos de PubMed verificados por el CA |
| `datos/enriquecimiento.jsonl` | Nomenclatura en español, epónimos y maniobras |

## Comando

```sh
python3 scripts/propedeutica_generar_signos.py \
  --datos  "/ruta/al/worktree/CULS/datos" \
  --salida "public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json"
```

No requiere dependencias: solo la biblioteca estándar de Python 3.

## Qué se publica y qué no

El generador separa los registros en dos clases mediante el campo `f`:

- **`f: "full"`** — los 309 hallazgos de investigación propia del Cuerpo
  Académico. Se publican todas las cifras (sensibilidad, especificidad, razones
  de verosimilitud e intervalos), la población estudiada, el PMID, el DOI y la
  **cita textual del resumen** que respalda cada dato.

- **`f: "idx"`** — los 876 hallazgos cuyo rendimiento diagnóstico está compilado
  en McGee S. *Evidence-Based Physical Diagnosis*, 3.ª ed. (Elsevier, 2012).
  Se publica lo que es aportación del proyecto —nomenclatura en español,
  descripción de la maniobra, patrón de referencia, clasificación cualitativa—
  y el **localizador exacto** (caja EBM y página), pero **no las cifras**.

  La razón: aunque un dato aislado es un hecho no protegible, la *selección y
  disposición* de esas ~107 tablas constituye una compilación protegida, y los
  LR agrupados por efectos aleatorios son cálculo propio del autor. El contenido
  de este sitio se publica bajo CC BY 4.0, licencia que no podríamos otorgar
  sobre material de terceros.

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
