# Measures of association and effect from a 2x2 table - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

# rows = exposure or treatment, columns = outcome:
#   a = exposed with the outcome, b = exposed without it, c = unexposed with it, d = unexposed without it
a <- 0; b <- 100; c <- 30; d <- 70
nivel      <- 0.95
diseno     <- "cohorte"       # "cohorte", "casos_controles" or "transversal": changes only how the results are read
metodo_rra <- "newcombe"   # CI for the absolute risk reduction: "newcombe" (hybrid score, method 10) or "wald"
corr       <- 0.5         # 0.5 = Haldane-Anscombe correction for the ratios; it never touches p1, p0, ARR or NNT
n <- a + b + c + d
z <- qnorm(1 - (1 - nivel) / 2)

# Risks with Wilson's (1927) score interval, written out to keep the same order of operations
# as binom::binom.confint(methods = "wilson"); the correction is not applied here on purpose.
n1 <- a + b; n0 <- c + d
ic_wilson <- function(x, m) {
  p  <- x / m
  w1 <- p + 0.5 * z^2 / m
  w2 <- z * sqrt((p * (1 - p) + 0.25 * z^2 / m) / m)
  w3 <- 1 + z^2 / m
  c(p, (w1 - w2) / w3, (w1 + w2) / w3)
}
p1 <- ic_wilson(a, n1)   # risk in the exposed / treated
p0 <- ic_wilson(c, n0)   # risk in the unexposed / controls

# Ratios on the (possibly corrected) cells, with the log-method CI: exp(log(est) -/+ z * SE);
# undefined (NA) when log(est) or the SE is not finite, that is, when a cell of the table is 0.
ac <- a + corr; bc <- b + corr; cc <- c + corr; dc <- d + corr
n1c <- ac + bc; n0c <- cc + dc
ic_log <- function(est, ee) {
  if (is.finite(log(est)) && is.finite(ee)) c(est, exp(log(est) - z * ee), exp(log(est) + z * ee)) else c(est, NA, NA)
}
rr <- ic_log((ac / n1c) / (cc / n0c), sqrt(1/ac - 1/n1c + 1/cc - 1/n0c))   # Katz 1978
or <- ic_log((ac * dc) / (bc * cc), sqrt(1/ac + 1/bc + 1/cc + 1/dc))       # Woolf 1955

# Absolute risk reduction: hybrid score interval (Newcombe 1998, method 10) or Wald
rra <- p1[1] - p0[1]
if (metodo_rra == "newcombe") {
  rra_ic <- c(rra - sqrt((p1[1] - p1[2])^2 + (p0[3] - p0[1])^2),
              rra + sqrt((p1[3] - p1[1])^2 + (p0[1] - p0[2])^2))
} else {
  rra_ee <- sqrt(p1[1] * (1 - p1[1]) / n1 + p0[1] * (1 - p0[1]) / n0)
  rra_ic <- c(rra - z * rra_ee, rra + z * rra_ee)
}

# Relative risk reduction and number needed to treat (reciprocal of the ARR and of its limits)
rrr <- c(1 - rr[1], 1 - rr[3], 1 - rr[2])
nnt <- 1 / abs(rra); nnt_ic <- sort(1 / abs(rra_ic))   # Altman 1998; if the ARR CI crosses 0, read it as NNTB x to Inf to NNTH y

res <- list(n = n, p1 = p1, p0 = p0, rr = rr, or = or,
            rra = c(rra, rra_ic[1], rra_ic[2]), rrr = rrr, nnt = c(nnt, nnt_ic[1], nnt_ic[2]))
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Alternative (score interval, Miettinen-Nurminen type): PropCIs::diffscoreci(a, n1, c, n0, nivel)
# Equivalent in RStudio (not run in the browser):
# epiR::epi.2by2(as.table(matrix(c(a, b, c, d), nrow = 2, byrow = TRUE)), method = "cohort.count", conf.level = nivel)
