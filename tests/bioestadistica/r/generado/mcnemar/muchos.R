# McNemar test for paired proportions - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

# Rows = first measurement (test A, or "before"), columns = second one (test B, or "after").
# a = (+,+) and d = (-,-) are the concordant pairs; b = (+,-) and c = (-,+), the discordant ones.
a <- 300; b <- 200; c <- 100; d <- 900
metodo_delta <- "wald"   # CI for the paired difference: "wald" or "agresti-min"
nivel <- 0.95
x <- matrix(c(a, b, c, d), nrow = 2, byrow = TRUE)
n <- a + b + c + d
n_disc <- b + c        # only the discordant pairs carry information about change
z <- qnorm(1 - (1 - nivel) / 2)

p_a <- (a + b) / n     # proportion positive with the first measurement
p_b <- (a + c) / n     # proportion positive with the second one

# McNemar's chi-squared with 1 df, without and with Edwards' (1948) continuity
# correction. Note that mcnemar.test() skips the correction when b == c, and
# that both statistics (and their p values) are NaN when b + c = 0.
mc  <- mcnemar.test(x, correct = FALSE)
mce <- mcnemar.test(x, correct = TRUE)

# Exact two-sided binomial test on the discordant pairs (exact McNemar)
p_exacta <- if (n_disc > 0) binom.test(b, n_disc, p = 0.5)$p.value else NA_real_

# Paired difference. The point estimate is always (b - c)/n; only the interval
# changes with `metodo_delta`.
est <- (b - c) / n
if (metodo_delta == "agresti-min") {
  # Agresti & Min (2005): interval centred on the adjusted estimator (b - c)/(n + 2)
  # and clipped to [-1, 1], as in PropCIs::diffpropci.mp (which reports (c - b)/n).
  est_am <- (b - c) / (n + 2)
  se_am <- sqrt((b + c + 1) - (b - c)^2 / (n + 2)) / (n + 2)
  ll <- max(-1, est_am - z * se_am)
  ul <- min(1, est_am + z * se_am)
  delta <- c(est, ll, ul)
} else {
  se <- sqrt((b + c) - (b - c)^2 / n) / n
  delta <- c(est, est - z * se, est + z * se)
}

# Paired odds ratio b/c: the Clopper-Pearson interval for b/(b + c) carried to
# the odds scale, p/(1 - p). Undefined (NA) without discordant pairs.
or_pareado <- if (n_disc > 0) {
  alpha <- 1 - nivel
  pl <- if (b == 0) 0 else qbeta(alpha / 2, b, c + 1)
  pu <- if (c == 0) 1 else qbeta(1 - alpha / 2, b + 1, c)
  c(b / c, pl / (1 - pl), pu / (1 - pu))
} else c(NA, NA, NA)

res <- list(n = n, n_disc = n_disc, p_a = p_a, p_b = p_b,
            chi2 = unname(mc$statistic), p_chi2 = mc$p.value,
            chi2_edwards = unname(mce$statistic), p_edwards = mce$p.value,
            p_exacta = p_exacta, delta = delta, or_pareado = or_pareado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# exact2x2::mcnemar.exact(x)
# PropCIs::diffpropci.Wald.mp(b, c, n, nivel)   # note: PropCIs reports (c - b)/n
