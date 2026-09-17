# Diagnostic test accuracy from a 2x2 table - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(binom)      # CIs for proportions: "wilson" (default), "exact" (Clopper-Pearson), "agresti-coull", "asymptotic" (Wald)
library(jsonlite)

vp <- 68; fp <- 6; fn <- 12; vn <- 114   # rows = test result (+, -), columns = reference standard (diseased, not diseased)
nivel  <- 0.95
metodo <- "wald"   # CI method for proportions: "wilson", "clopper-pearson", "agresti-coull", "jeffreys" or "wald"
corr   <- 0     # 0.5 = Haldane-Anscombe correction for the ratios (LR, DOR) when a cell is 0; 0 = none
n <- vp + fp + fn + vn
z <- qnorm(1 - (1 - nivel) / 2)

# Proportion with CI -> c(estimate, lower, upper); Jeffreys is the equal-tailed interval (Brown, Cai & DasGupta 2001)
ic_prop <- function(x, m) {
  if (metodo == "jeffreys") {
    lo <- if (x == 0) 0 else qbeta((1 - nivel) / 2, x + 0.5, m - x + 0.5)
    hi <- if (x == m) 1 else qbeta(1 - (1 - nivel) / 2, x + 0.5, m - x + 0.5)
    return(c(x / m, lo, hi))
  }
  m_binom <- switch(metodo, wilson = "wilson", "clopper-pearson" = "exact", "agresti-coull" = "agresti-coull", wald = "asymptotic")
  ci <- binom.confint(x, m, conf.level = nivel, methods = m_binom)
  c(x / m, ci$lower, ci$upper)
}
sn   <- ic_prop(vp, vp + fn)    # sensitivity
sp   <- ic_prop(vn, vn + fp)    # specificity
vpp  <- ic_prop(vp, vp + fp)    # positive predictive value (at this sample's prevalence)
vpn  <- ic_prop(vn, vn + fn)    # negative predictive value
prev <- ic_prop(vp + fn, n)     # prevalence in the sample
exactitud <- ic_prop(vp + vn, n)   # accuracy

# Youden's J = Sn + Sp - 1 with a delta-method (Wald) CI
j    <- sn[1] + sp[1] - 1
j_ee <- sqrt(sn[1] * (1 - sn[1]) / (vp + fn) + sp[1] * (1 - sp[1]) / (vn + fp))
youden <- c(j, j - z * j_ee, j + z * j_ee)

# Ratios with the log-method CI: exp(log(est) -/+ z * SE); undefined (NA) when a cell of the (corrected) table is 0
a <- vp + corr; b <- fp + corr; c <- fn + corr; d <- vn + corr
ic_log <- function(est, ee) {
  if (is.finite(log(est)) && is.finite(ee)) c(est, exp(log(est) - z * ee), exp(log(est) + z * ee)) else c(est, NA, NA)
}
ee_lr <- function(x1, n1, x2, n2) sqrt((1 - x1 / n1) / x1 + (1 - x2 / n2) / x2)   # Simel, Samsa & Matchar 1991
lr_pos <- ic_log(a / (a + c) / (b / (b + d)), ee_lr(a, a + c, b, b + d))
lr_neg <- ic_log(c / (a + c) / (d / (b + d)), ee_lr(c, a + c, d, b + d))
dor    <- ic_log((a * d) / (b * c), sqrt(1 / a + 1 / b + 1 / c + 1 / d))         # Woolf 1955

res <- list(n = n, sn = sn, sp = sp, vpp = vpp, vpn = vpn, prev = prev, exactitud = exactitud,
            youden = youden, lr_pos = lr_pos, lr_neg = lr_neg, dor = dor)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# epiR::epi.tests(as.table(matrix(c(vp, fp, fn, vn), nrow = 2, byrow = TRUE)), method = "wilson", conf.level = nivel)
