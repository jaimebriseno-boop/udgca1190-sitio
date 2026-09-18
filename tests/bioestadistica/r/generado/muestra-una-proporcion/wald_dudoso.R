# Sample size to estimate one proportion (absolute precision) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

p <- 0.05; d <- 0.05; nivel <- 0.95
poblacion <- 0   # size of the finite population; 0 = population not bounded
perdidas <- 0     # expected losses to follow-up, 0 to 0.5
n_dado <- 0         # inverse mode: sample size already available; 0 = not used

z <- qnorm(1 - (1 - nivel) / 2)
n0 <- z^2 * p * (1 - p) / d^2                                   # Cochran 1977
n <- if (poblacion >= 2) n0 / (1 + (n0 - 1) / poblacion) else n0     # finite population correction
n_ajustado <- n / (1 - perdidas)                                # Lwanga & Lemeshow 1991
# Inverse mode: the very same n(d) solved for d, with the same correction
n0_dado <- if (poblacion >= 2) n_dado * (poblacion - 1) / (poblacion - n_dado) else n_dado
d_dado <- if (n_dado >= 2) z * sqrt(p * (1 - p) / n0_dado) else NA_real_

res <- list(z = z, n0 = n0, n = n, n_ajustado = n_ajustado, d_dado = d_dado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# The ceiling is applied once, by the interface: ceiling(n0), ceiling(n), ceiling(n_ajustado).
# Equivalent in RStudio (not run in the browser):
# presize::prec_prop(p, conf.width = 2 * d, conf.level = nivel, method = "wald")
# epiR::epi.sssimpleestb(N = poblacion, Py = p, epsilon = d, error = "absolute", conf.level = nivel)
