# Ejecuta los snippets de R generados para una calculadora y reúne su salida.
#
#   Rscript tests/bioestadistica/r/correr_casos.R <slug> [--dir=<ruta>] [--paquetes=a,b]
#
# Cada archivo de `r/generado/<slug>/` es, byte a byte, el código que ve el
# usuario en la página: aquí solo se ejecuta con `source()` y se captura lo que
# imprime por stdout (un único JSON). No se transforma nada.
#
#   --dir       directorio con los snippets; por omisión `r/generado/<slug>`.
#               `scripts/bio-fixtures.mjs --check` apunta a un directorio temporal.
#   --paquetes  paquetes cuya versión va en `meta`; si no se pasa, se deducen de
#               las llamadas `library()` de los propios snippets.
#
# Imprime por stdout `{"meta": {...}, "casos": {...}}` y termina con error si
# cualquier snippet falla o no imprime un JSON legible.

args <- commandArgs(trailingOnly = TRUE)
opciones <- grep("^--", args, value = TRUE)
libres <- setdiff(args, opciones)

if (length(libres) != 1L) {
  stop("uso: Rscript correr_casos.R <slug> [--dir=<ruta>] [--paquetes=a,b]", call. = FALSE)
}
slug <- libres[1L]

valor_opcion <- function(nombre) {
  hit <- grep(paste0("^--", nombre, "="), opciones, value = TRUE)
  if (length(hit) == 0L) return(NA_character_)
  sub(paste0("^--", nombre, "="), "", hit[length(hit)])
}

argv <- commandArgs(trailingOnly = FALSE)
este <- sub("^--file=", "", argv[grep("^--file=", argv)])
dir_script <- if (length(este) > 0L) dirname(normalizePath(este[1L])) else getwd()

dir_casos <- valor_opcion("dir")
if (is.na(dir_casos)) dir_casos <- file.path(dir_script, "generado", slug)
if (!dir.exists(dir_casos)) {
  stop("no existe el directorio de snippets: ", dir_casos,
       "\nGenera los casos con: node scripts/bio-fixtures.mjs --solo ", slug, call. = FALSE)
}

archivos <- list.files(dir_casos, pattern = "\\.R$", full.names = TRUE)
if (length(archivos) == 0L) stop("no hay snippets .R en ", dir_casos, call. = FALSE)

# Orden estable y reproducible: alfabético, con `ejemplo` siempre primero.
ids <- sub("\\.R$", "", basename(archivos))
orden <- order(ids != "ejemplo", ids, method = "radix")
archivos <- archivos[orden]
ids <- ids[orden]

# ---------------------------------------------------------------------------
# Ejecución de cada snippet
# ---------------------------------------------------------------------------

correr <- function(ruta, id) {
  anterior <- getwd()
  on.exit(setwd(anterior), add = TRUE)
  setwd(dirname(ruta))
  salida <- tryCatch(
    capture.output(source(ruta, local = new.env())),
    error = function(e) stop("el snippet ", id, " (", ruta, ") falló en R:\n  ", conditionMessage(e), call. = FALSE)
  )
  texto <- paste(salida, collapse = "")
  if (!nzchar(trimws(texto))) {
    stop("el snippet ", id, " no imprimió nada; se esperaba una línea `cat(toJSON(res, ...))`", call. = FALSE)
  }
  tryCatch(
    jsonlite::fromJSON(texto, simplifyVector = TRUE),
    error = function(e) stop("el snippet ", id, " no imprimió un JSON legible:\n  ", conditionMessage(e),
                             "\n  salida: ", substr(texto, 1L, 200L), call. = FALSE)
  )
}

suppressPackageStartupMessages(library(jsonlite))

casos <- list()
for (i in seq_along(archivos)) {
  casos[[ids[i]]] <- correr(archivos[i], ids[i])
}

# ---------------------------------------------------------------------------
# Metadatos de reproducibilidad
# ---------------------------------------------------------------------------

lista_paquetes <- valor_opcion("paquetes")
if (is.na(lista_paquetes)) {
  # Deducidos de los propios snippets: library(binom), require(jsonlite)...
  lineas <- unlist(lapply(archivos, readLines, warn = FALSE), use.names = FALSE)
  hits <- regmatches(lineas, regexpr("^\\s*(library|require)\\(([A-Za-z0-9._]+)\\)", lineas))
  nombres <- unique(sub("^\\s*(library|require)\\(([A-Za-z0-9._]+)\\).*$", "\\2", hits))
} else {
  nombres <- trimws(strsplit(lista_paquetes, ",", fixed = TRUE)[[1]])
  nombres <- nombres[nzchar(nombres)]
}
nombres <- sort(unique(nombres))

versiones <- list()
for (p in nombres) {
  v <- tryCatch(packageDescription(p)$Version, error = function(e) NULL)
  if (is.null(v) || is.na(v)) stop("el paquete ", p, " no está instalado; corre tests/bioestadistica/r/instalar.R", call. = FALSE)
  versiones[[p]] <- v
}

meta <- list(
  R = R.version.string,
  plataforma = R.version$platform,
  paquetes = versiones
)

cat(toJSON(list(meta = meta, casos = casos), auto_unbox = TRUE, digits = NA, pretty = TRUE))
cat("\n")
