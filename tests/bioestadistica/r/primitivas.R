# Rejilla de valores de referencia para las primitivas numéricas de
# «Bioestadística abierta» (src/lib/bioestadistica/primitivas/).
#
# R es el oráculo del motor: este script evalúa cada primitiva en una rejilla
# amplia (incluidas las colas extremas) y escribe el resultado en
# tests/bioestadistica/fixtures/primitivas.json, que consume
# tests/bioestadistica/primitivas.test.ts. Solo usa R base y jsonlite.
#
#   Rscript tests/bioestadistica/r/primitivas.R
#
# Codificación: cada número viaja como cadena. Se intenta primero una notación
# decimal que vuelva al mismo doble al releerla (15, 16 o 17 cifras) y, si
# ninguna lo consigue —el formateador de R no garantiza ida y vuelta exacta—,
# se escribe el patrón IEEE-754 en hexadecimal big-endian ("0x…", 16 dígitos).
# Inf, -Inf, NaN y NA viajan con su nombre. Los lógicos son "T" y "F".

suppressPackageStartupMessages(library(jsonlite))

# --------------------------------------------------------------------------
# Codificación exacta de dobles
# --------------------------------------------------------------------------

hex64 <- function(v) {
  crudo <- writeBin(as.double(v), raw(), size = 8, endian = "big")
  paste0("0x", paste(sprintf("%02x", as.integer(crudo)), collapse = ""))
}

desde_hex64 <- function(s) {
  bytes <- as.raw(strtoi(substring(s, seq(3, 17, by = 2), seq(4, 18, by = 2)), 16L))
  readBin(bytes, "double", size = 8, endian = "big")
}

enc <- function(v) {
  v <- as.double(v)
  if (is.nan(v)) return("NaN")
  if (is.na(v)) return("NA")
  if (is.infinite(v)) return(if (v > 0) "Inf" else "-Inf")
  for (k in 15:17) {
    s <- format(v, digits = k, scientific = TRUE)
    if (isTRUE(as.double(s) == v)) return(s)
  }
  hex64(v)
}

enc_arg <- function(a) {
  if (is.logical(a)) return(if (isTRUE(a)) "T" else "F")
  enc(a)
}

# Comprobación de la codificación antes de escribir nada.
local({
  set.seed(20260916)
  muestra <- c(1 / 3, pi, pnorm(-37), 1e-300, 1e308, 1e-320, 0, -0.0,
               exp(rnorm(3000, 0, 200)), runif(3000), rnorm(1000))
  vuelta <- vapply(muestra, function(v) {
    s <- enc(v)
    if (startsWith(s, "0x")) desde_hex64(s) else as.double(s)
  }, numeric(1))
  if (!all(vuelta == muestra)) {
    stop("la codificación de dobles no es exacta: revisar enc()")
  }
})

# --------------------------------------------------------------------------
# Acumulador de bloques
# --------------------------------------------------------------------------

bloques <- list()
descartadas <- 0L

# Producto cartesiano que conserva el tipo de cada argumento.
combinar <- function(...) {
  ls <- list(...)
  idx <- expand.grid(lapply(ls, seq_along), KEEP.OUT.ATTRS = FALSE)
  lapply(seq_len(nrow(idx)), function(i) {
    lapply(seq_along(ls), function(j) ls[[j]][[idx[i, j]]])
  })
}

# Evalúa `fn` sobre cada combinación y guarda el bloque. `filtro(args, valor)`
# permite excluir puntos en los que el propio R no es un oráculo fiable.
rejilla <- function(familia, nombres, combos, fn, filtro = NULL) {
  filas <- list()
  for (a in combos) {
    v <- tryCatch(suppressWarnings(do.call(fn, a)), error = function(e) NA_real_)
    if (length(v) != 1L) next
    if (!is.null(filtro) && !isTRUE(filtro(a, v))) {
      descartadas <<- descartadas + 1L
      next
    }
    filas[[length(filas) + 1L]] <- c(vapply(a, enc_arg, character(1)), enc(v))
  }
  bloques[[length(bloques) + 1L]] <<- list(
    familia = familia, args = nombres, filas = filas
  )
  cat(sprintf("  %-10s %5d filas\n", familia, length(filas)))
}

# Solo se conservan los cuantiles cuya CDF vuelve a dar `p` con error relativo
# < 1e-11. Fuera de ese rango el que pierde cifras es R, no el motor: sus
# cuantiles arrancan de aproximaciones cerradas con un refinamiento finito.
#
# La comprobación se hace siempre por la cola cuya probabilidad es ≤ ½. Mirar la
# cola grande no serviría de nada: cerca de 1 la resolución de un doble es
# 1.1e-16 y cualquier x la superaría. `cdf` recibe (x, parámetros…, lower) y
# `extrae_par` devuelve solo los parámetros de la distribución.
guardia_cuantil <- function(cdf, idx_p, extrae_par) {
  function(a, x) {
    p <- a[[idx_p]]
    lower <- a[[length(a)]]
    if (!is.finite(x) || is.na(x)) return(TRUE)
    if (p <= 0 || p >= 1) return(TRUE)
    par <- extrae_par(a)
    inf <- tryCatch(suppressWarnings(do.call(cdf, c(list(x), par, list(TRUE)))),
                    error = function(e) NA_real_)
    sup <- tryCatch(suppressWarnings(do.call(cdf, c(list(x), par, list(FALSE)))),
                    error = function(e) NA_real_)
    if (is.na(inf) || is.na(sup)) return(TRUE)
    objetivo_inf <- if (isTRUE(lower)) p else 1 - p
    objetivo_sup <- if (isTRUE(lower)) 1 - p else p
    if (objetivo_inf <= objetivo_sup) {
      vuelta <- inf; objetivo <- objetivo_inf
    } else {
      vuelta <- sup; objetivo <- objetivo_sup
    }
    if (objetivo <= 0 || vuelta <= 0) return(TRUE)
    abs(vuelta / objetivo - 1) < 1e-11
  }
}

cat("Generando rejilla de primitivas…\n")

# --------------------------------------------------------------------------
# Normal
# --------------------------------------------------------------------------

q_normal <- c(-38, -37.5, -37, -36, -30, -25, -20, -15, -10, -8.2924, -7, -6,
              -5.656854249492381, -5.5, -5, -4, -3, -2.5, -1.959963984540054,
              -1.6448536269514722, -1.5, -1, -0.67448975, -0.5, -0.25, -0.1,
              -1e-8, 0, 1e-8, 0.1, 0.25, 0.5, 0.67448975, 1, 1.5,
              1.6448536269514722, 1.959963984540054, 2.5, 3, 4, 5, 5.5,
              5.656854249492381, 6, 7, 8.2924, 10, 15, 20, 25, 30, 36, 37,
              37.5, 38)

rejilla("pnorm", c("q", "mu", "sd", "lower", "log"),
        c(combinar(q_normal, 0, 1, c(TRUE, FALSE), c(FALSE, TRUE)),
          combinar(c(-3.5, 0, 2.25, 11), c(-2, 0, 4.5), c(0.5, 1, 3),
                   c(TRUE, FALSE), FALSE)),
        function(q, mu, sd, lower, log) pnorm(q, mu, sd, lower.tail = lower, log.p = log))

p_normal <- c(1e-300, 1e-200, 1e-100, 1e-50, 1e-20, 1e-16, 1e-12, 1e-10, 1e-8,
              1e-6, 1e-4, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.4,
              0.475, 0.5, 0.525, 0.6, 0.75, 0.9, 0.95, 0.975, 0.99, 0.995,
              0.999, 1 - 1e-4, 1 - 1e-6, 1 - 1e-8, 1 - 1e-10, 1 - 1e-12,
              1 - 1e-16, 0, 1)

rejilla("qnorm", c("p", "mu", "sd", "lower"),
        c(combinar(p_normal, 0, 1, c(TRUE, FALSE)),
          combinar(c(0.025, 0.5, 0.975), c(-2, 10), c(0.5, 4), c(TRUE, FALSE))),
        function(p, mu, sd, lower) qnorm(p, mu, sd, lower.tail = lower))

rejilla("dnorm", c("x", "mu", "sd", "log"),
        c(combinar(q_normal, 0, 1, c(FALSE, TRUE)),
          combinar(c(-3.5, 0, 2.25), c(-2, 4.5), c(0.5, 3), c(FALSE, TRUE))),
        function(x, mu, sd, log) dnorm(x, mu, sd, log = log))

# --------------------------------------------------------------------------
# t de Student
# --------------------------------------------------------------------------

gl_t <- c(1, 2, 5, 10, 30, 100, 1000)
q_t <- c(-1e10, -1e5, -1000, -100, -30, -10, -5, -3, -2, -1, -0.5, -1e-8, 0,
         1e-8, 0.5, 1, 2, 3, 5, 10, 30, 100, 1000, 1e5, 1e10)

rejilla("pt", c("q", "df", "lower"),
        combinar(q_t, gl_t, c(TRUE, FALSE)),
        function(q, df, lower) pt(q, df, lower.tail = lower))

# Para gl ≤ 2 el cuantil crece como p^{-1/gl}: por debajo de 1e-150 su cuadrado
# ya no cabe en un doble y la CDF no se puede evaluar en ese punto.
p_t <- c(1e-150, 1e-100, 1e-60, 1e-30, 1e-15, 1e-8, 1e-4, 0.001, 0.01, 0.025,
         0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.975, 0.99, 0.999, 1 - 1e-4,
         1 - 1e-8, 0, 1)

rejilla("qt", c("p", "df", "lower"),
        combinar(p_t, gl_t, c(TRUE, FALSE)),
        function(p, df, lower) qt(p, df, lower.tail = lower),
        filtro = guardia_cuantil(
          function(x, df, lower) pt(x, df, lower.tail = lower),
          1, function(a) list(a[[2]])))

# --------------------------------------------------------------------------
# t no central (AS 243)
# --------------------------------------------------------------------------

rejilla("pnt", c("q", "df", "ncp", "lower"),
        combinar(c(-5, -3, -2, -1, 0, 0.5, 1, 2, 3, 5, 8, 12),
                 c(1, 2, 5, 10, 30, 100),
                 c(-3, -1.5, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 6),
                 c(TRUE, FALSE)),
        function(q, df, ncp, lower) pt(q, df, ncp, lower.tail = lower))

# --------------------------------------------------------------------------
# Ji cuadrada
# --------------------------------------------------------------------------

rejilla("pchisq", c("q", "df", "lower"),
        c(combinar(c(1e-10, 1e-5, 0.001, 0.01, 0.1, 0.5, 1, 2, 3.841458820694124,
                     5, 10, 20, 50, 100, 200, 500),
                   c(1, 2, 3, 5, 10, 20, 30, 50), c(TRUE, FALSE)),
          combinar(c(0.5, 3.841458820694124), as.list(1:50), c(TRUE, FALSE))),
        function(q, df, lower) pchisq(q, df, lower.tail = lower))

p_chi <- c(1e-300, 1e-100, 1e-20, 1e-10, 1e-5, 0.001, 0.01, 0.025, 0.05, 0.1,
           0.25, 0.5, 0.75, 0.9, 0.95, 0.975, 0.99, 0.999, 1 - 1e-6, 1 - 1e-8,
           0, 1)

rejilla("qchisq", c("p", "df", "lower"),
        c(combinar(p_chi, c(1, 2, 3, 5, 10, 20, 30, 50), c(TRUE, FALSE)),
          combinar(c(0.025, 0.5, 0.975), as.list(1:50), c(TRUE, FALSE))),
        function(p, df, lower) qchisq(p, df, lower.tail = lower),
        filtro = guardia_cuantil(
          function(x, df, lower) pchisq(x, df, lower.tail = lower),
          1, function(a) list(a[[2]])))

# --------------------------------------------------------------------------
# Gamma
# --------------------------------------------------------------------------

rejilla("pgamma", c("q", "shape", "rate", "lower"),
        combinar(c(1e-10, 1e-4, 0.01, 0.1, 0.5, 1, 2, 5, 10, 50, 100, 300),
                 c(0.5, 1, 2.5, 10, 100, 200), c(1, 0.5, 2, 10),
                 c(TRUE, FALSE)),
        function(q, shape, rate, lower) pgamma(q, shape, rate, lower.tail = lower))

rejilla("qgamma", c("p", "shape", "rate", "lower"),
        combinar(c(1e-300, 1e-100, 1e-20, 1e-10, 1e-5, 0.001, 0.025, 0.1, 0.25,
                   0.5, 0.75, 0.9, 0.975, 0.999, 1 - 1e-6, 0, 1),
                 c(0.5, 1, 2.5, 10, 100, 200), c(1, 0.5, 2, 10),
                 c(TRUE, FALSE)),
        function(p, shape, rate, lower) qgamma(p, shape, rate, lower.tail = lower),
        filtro = guardia_cuantil(
          function(x, shape, rate, lower) pgamma(x, shape, rate, lower.tail = lower),
          1, function(a) list(a[[2]], a[[3]])))

# --------------------------------------------------------------------------
# Beta (incluidos los bordes de Clopper-Pearson y la a priori de Jeffreys)
# --------------------------------------------------------------------------

ab_beta <- list(c(0.5, 0.5), c(0.5, 500), c(500, 0.5), c(1, 1), c(2, 3),
                c(5, 5), c(68, 13), c(69, 12), c(1, 100), c(100, 1),
                c(500, 500), c(0.5, 12.5), c(80.5, 13.5), c(0, 5), c(5, 0),
                c(0, 0.5))

rejilla("pbeta", c("q", "a", "b", "lower"),
        unlist(lapply(ab_beta, function(ab) {
          combinar(c(0, 1e-12, 1e-6, 0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9,
                     0.99, 0.999, 1),
                   ab[1], ab[2], c(TRUE, FALSE))
        }), recursive = FALSE),
        function(q, a, b, lower) pbeta(q, a, b, lower.tail = lower))

rejilla("qbeta", c("p", "a", "b", "lower"),
        unlist(lapply(ab_beta, function(ab) {
          combinar(c(0, 1e-100, 1e-12, 1e-6, 0.001, 0.025, 0.05, 0.1, 0.25, 0.5,
                     0.75, 0.9, 0.95, 0.975, 0.999, 1 - 1e-6, 1),
                   ab[1], ab[2], c(TRUE, FALSE))
        }), recursive = FALSE),
        function(p, a, b, lower) qbeta(p, a, b, lower.tail = lower),
        filtro = guardia_cuantil(
          function(x, a, b, lower) pbeta(x, a, b, lower.tail = lower),
          1, function(a) list(a[[2]], a[[3]])))

# --------------------------------------------------------------------------
# F de Snedecor
# --------------------------------------------------------------------------

rejilla("pf", c("q", "df1", "df2", "lower"),
        combinar(c(1e-6, 0.001, 0.1, 0.5, 1, 2, 5, 10, 100, 1000),
                 c(1, 2, 3, 4, 5, 10, 20, 100), c(1, 2, 3, 5, 10, 20, 100, 1000),
                 c(TRUE, FALSE)),
        function(q, df1, df2, lower) pf(q, df1, df2, lower.tail = lower))

rejilla("qf", c("p", "df1", "df2", "lower"),
        combinar(c(1e-6, 1e-4, 0.001, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75,
                   0.9, 0.95, 0.975, 0.99, 0.999, 0, 1),
                 c(1, 2, 3, 4, 5, 10, 20, 100), c(1, 2, 3, 5, 10, 20, 100, 1000),
                 c(TRUE, FALSE)),
        function(p, df1, df2, lower) qf(p, df1, df2, lower.tail = lower),
        filtro = guardia_cuantil(
          function(x, df1, df2, lower) pf(x, df1, df2, lower.tail = lower),
          1, function(a) list(a[[2]], a[[3]])))

# --------------------------------------------------------------------------
# Binomial
# --------------------------------------------------------------------------

np_binom <- list(c(10, 0.5), c(10, 0.01), c(10, 0.999), c(100, 0.3),
                 c(1000, 0.001), c(1e4, 0.5), c(1e5, 0.2), c(1e6, 0.5),
                 c(1e6, 1e-6), c(50, 0.9))

ks_de <- function(n) {
  ks <- unique(round(c(0, 1, 2, n * c(0.001, 0.01, 0.1, 0.3, 0.4, 0.49, 0.5,
                                      0.51, 0.6, 0.9, 0.99), n - 1, n)))
  ks[ks >= 0 & ks <= n]
}

rejilla("dbinom", c("k", "n", "p", "log"),
        unlist(lapply(np_binom, function(np) {
          combinar(ks_de(np[1]), np[1], np[2], c(FALSE, TRUE))
        }), recursive = FALSE),
        function(k, n, p, log) dbinom(k, n, p, log = log))

rejilla("pbinom", c("k", "n", "p", "lower"),
        unlist(lapply(np_binom, function(np) {
          combinar(ks_de(np[1]), np[1], np[2], c(TRUE, FALSE))
        }), recursive = FALSE),
        function(k, n, p, lower) pbinom(k, n, p, lower.tail = lower))

# --------------------------------------------------------------------------
# Hipergeométrica (parámetros de R: m blancas, n negras, k extraídas)
# --------------------------------------------------------------------------

mnk_hiper <- list(c(10, 7, 8), c(50, 50, 20), c(5, 5, 5), c(1000, 1000, 1000),
                  c(100, 900, 50), c(12, 8, 10), c(2, 1000, 20), c(30, 30, 30))

xs_de <- function(m, n, k) {
  lo <- max(0, k - n); hi <- min(k, m)
  unique(round(c(lo - 1, lo, lo + 1, lo + (hi - lo) * c(0.25, 0.5, 0.75),
                 hi - 1, hi, hi + 1)))
}

rejilla("dhyper", c("x", "m", "n", "k", "log"),
        unlist(lapply(mnk_hiper, function(v) {
          combinar(xs_de(v[1], v[2], v[3]), v[1], v[2], v[3], c(FALSE, TRUE))
        }), recursive = FALSE),
        function(x, m, n, k, log) dhyper(x, m, n, k, log = log))

rejilla("phyper", c("x", "m", "n", "k", "lower"),
        unlist(lapply(mnk_hiper, function(v) {
          combinar(xs_de(v[1], v[2], v[3]), v[1], v[2], v[3], c(TRUE, FALSE))
        }), recursive = FALSE),
        function(x, m, n, k, lower) phyper(x, m, n, k, lower.tail = lower))

# --------------------------------------------------------------------------
# Funciones especiales
# --------------------------------------------------------------------------

rejilla("lgamma", c("x"),
        combinar(c(-10.5, -5.25, -2.7, -0.5, -0.1, 0.001, 0.1, 0.5, 1, 1.5, 2,
                   2.5, 3, 5, 10, 15.5, 50, 100, 1000, 1e5, 1e6, 1e10, 1e100)),
        function(x) lgamma(x))

rejilla("lfactorial", c("n"),
        combinar(c(0, 1, 2, 5, 10, 20, 100, 1000, 1e5, 1e6)),
        function(n) lfactorial(n))

rejilla("lbeta", c("a", "b"),
        lapply(list(c(0.5, 0.5), c(1, 1), c(2, 3), c(3, 4), c(5, 5), c(0.5, 500),
                    c(10.3, 500), c(68, 13), c(500, 500), c(1e5, 1e5),
                    c(500000, 500001), c(1e6, 2), c(0.001, 0.001)),
               function(v) list(v[1], v[2])),
        function(a, b) lbeta(a, b))

rejilla("lchoose", c("n", "k"),
        lapply(list(c(5, 0), c(5, 1), c(5, 5), c(5, 6), c(5, -1), c(10, 3),
                    c(50, 25), c(100, 7), c(1000, 500), c(1e4, 5000),
                    c(1e6, 5e5), c(1e6, 1), c(1e6, 999999), c(10.5, 3),
                    c(2000, 1000)),
               function(v) list(v[1], v[2])),
        function(n, k) lchoose(n, k))

# erf y erfc no existen en R base: se derivan de pnorm, que es el oráculo.
# La identidad erf(x) = 2Φ(x√2) − 1 cancela cerca de cero (Φ ≈ ½), así que la
# rejilla de erf empieza en |x| = 1e-3; el comportamiento en el origen se
# comprueba en TS contra su desarrollo, erf(x) → 2x/√π.
rejilla("erf", c("x"),
        combinar(c(-6, -4, -3, -2, -1, -0.5, -0.46875, -0.1, -0.01, -0.001,
                   0, 0.001, 0.01, 0.1, 0.46875, 0.5, 1, 2, 3, 4, 6, 10, 20, 26)),
        function(x) 2 * pnorm(x * sqrt(2)) - 1)

rejilla("erfc", c("x"),
        combinar(c(-6, -4, -3, -2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 3, 4, 6,
                   10, 20, 26)),
        function(x) 2 * pnorm(-x * sqrt(2)))

# --------------------------------------------------------------------------
# Escritura
# --------------------------------------------------------------------------

meta <- list(
  generado_por = "tests/bioestadistica/r/primitivas.R",
  generado = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  R = R.version.string,
  plataforma = R.version$platform,
  jsonlite = as.character(packageVersion("jsonlite")),
  codificacion = paste(
    "cada número es una cadena: decimal con ida y vuelta exacta,",
    "o patrón IEEE-754 big-endian '0x…' de 16 dígitos;",
    "Inf/-Inf/NaN/NA por su nombre; los lógicos son 'T' y 'F'"
  ),
  filas_descartadas = descartadas,
  criterio_descarte = paste(
    "cuantiles en los que la propia CDF de R no reproduce p con error",
    "relativo < 1e-11 (R deja de ser oráculo fiable ahí)"
  )
)

salida <- file.path(
  dirname(dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])))),
  "fixtures", "primitivas.json"
)
dir.create(dirname(salida), recursive = TRUE, showWarnings = FALSE)

total <- sum(vapply(bloques, function(b) length(b$filas), integer(1)))
writeLines(
  toJSON(list(meta = meta, bloques = bloques), auto_unbox = TRUE, pretty = 2),
  salida
)
cat(sprintf("\n%d filas en %d bloques (%d descartadas) → %s\n",
            total, length(bloques), descartadas, salida))
