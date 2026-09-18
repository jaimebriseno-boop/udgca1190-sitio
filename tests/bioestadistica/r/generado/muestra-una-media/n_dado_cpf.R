# Sample size to estimate one mean (absolute precision) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

sigma <- 60; d <- 10; nivel <- 0.95
poblacion <- 300   # size of the finite population; 0 = population not bounded
perdidas <- 0     # expected losses to follow-up, 0 to 0.5
n_dado <- 100         # inverse mode: sample size already available; 0 = not used

z <- qnorm(1 - (1 - nivel) / 2)
n_z <- (z * sigma / d)^2                                        # Cochran 1977
# t variant (Student 1908): the SMALLEST integer n >= 2 with n >= (t_{n-1} * sigma / d)^2.
# Searched one by one from max(2, ceiling(n_z)), a lower bound because t > z; the
# condition is monotone, so the first n that meets it is the minimum.
# NOT a fixed point: iterating n <- (t_{ceiling(n)-1} * sigma / d)^2 falls into a
# period-2 cycle and can publish a size BELOW the minimum (sigma = 1, d = 0.36,
# nivel = 0.80 gives 14, but 14 subjects reach only 0.3608, not 0.36).
n_t <- NA_real_
n_i <- max(2, ceiling(n_z))
for (i in 1:64) {
  cumple <- n_i >= (qt(1 - (1 - nivel) / 2, max(1, n_i - 1)) * sigma / d)^2
  if (cumple || n_i + 1 == n_i) { n_t <- n_i; break }   # above 2^53, +1 leaves the double unchanged
  n_i <- n_i + 1
}
n <- if (poblacion >= 2) n_z / (1 + (n_z - 1) / poblacion) else n_z   # finite population correction
n_ajustado <- n / (1 - perdidas)                                # Lwanga & Lemeshow 1991
# Inverse mode: the very same n(d) solved for d, with the same correction
n_efectivo <- if (poblacion >= 2) n_dado * (poblacion - 1) / (poblacion - n_dado) else n_dado
d_dado <- if (n_dado >= 2) z * sigma / sqrt(n_efectivo) else NA_real_

res <- list(z = z, n_z = n_z, n_t = n_t, n = n, n_ajustado = n_ajustado, d_dado = d_dado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# n_t is already an integer; the interface applies the ceiling once to the rest:
# ceiling(n_z), ceiling(n), ceiling(n_ajustado).
# Equivalent in RStudio (not run in the browser):
# presize::prec_mean(mean = 0, sd = sigma, conf.width = 2 * d, conf.level = nivel)
# epiR::epi.sssimpleestc(N = poblacion, xbar = 0, sigma = sigma, epsilon = d, error = "absolute", conf.level = nivel)
