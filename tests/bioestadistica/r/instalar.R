# Instala los paquetes del oráculo de «Bioestadística abierta» (UDG-CA-1190).
#
#   Rscript tests/bioestadistica/r/instalar.R
#
# Solo instala lo que falte y al final imprime la versión de cada paquete, que es
# lo que acaba en `meta.paquetes` de los fixtures. Los paquetes del snippet que
# se ejecuta en el navegador son ligeros (binom, PropCIs, exact2x2, irr, pwr,
# survival, jsonlite); presize, DescTools y epiR son el oráculo secundario y solo
# se usan en local.

PAQUETES <- c(
  "binom",     # binom.confint: Wilson, Clopper-Pearson, Agresti-Coull, Wald
  "PropCIs",   # diferencias de proporciones (score de Newcombe), wald2ci
  "exact2x2",  # pruebas exactas 2x2 y OR condicional
  "irr",       # kappa2 y acuerdo entre observadores
  "pwr",       # tamaño de muestra y potencia
  "presize",   # tamaño de muestra por precisión
  "DescTools", # oráculo secundario: BinomCI y compañía
  "epiR",      # oráculo secundario: epi.tests, epi.2by2
  "jsonlite",  # serialización del resultado de cada snippet
  "survival"   # Kaplan-Meier y log-rank
)

REPO <- "https://cloud.r-project.org"

faltan <- PAQUETES[!vapply(PAQUETES, requireNamespace, logical(1), quietly = TRUE)]
if (length(faltan) > 0) {
  cat("Instalando:", paste(faltan, collapse = ", "), "\n")
  install.packages(faltan, repos = REPO)
} else {
  cat("Todos los paquetes ya estaban instalados.\n")
}

cat("\nVersiones instaladas\n")
sin_instalar <- character(0)
for (p in PAQUETES) {
  v <- tryCatch(packageDescription(p)$Version, error = function(e) NA_character_)
  if (is.null(v) || is.na(v)) {
    sin_instalar <- c(sin_instalar, p)
    cat(sprintf("  %-10s NO INSTALADO\n", p))
  } else {
    cat(sprintf("  %-10s %s\n", p, v))
  }
}
cat(sprintf("\n%s (%s)\n", R.version.string, R.version$platform))

if (length(sin_instalar) > 0) {
  stop("no se pudieron instalar: ", paste(sin_instalar, collapse = ", "), call. = FALSE)
}
