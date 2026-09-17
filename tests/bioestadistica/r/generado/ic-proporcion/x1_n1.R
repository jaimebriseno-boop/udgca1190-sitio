# Confidence interval for a proportion (six methods) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(binom)      # Wilson (default), Clopper-Pearson ("exact"), Agresti-Coull and Wald ("asymptotic")
library(jsonlite)

x <- 1; n <- 1; nivel <- 0.95
alfa <- 1 - nivel; z <- qnorm(1 - alfa / 2); p <- x / n

ic <- function(m) { r <- binom.confint(x, n, conf.level = nivel, methods = m); c(p, r$lower, r$upper) }
wilson          <- ic("wilson")
clopper_pearson <- ic("exact")
agresti_coull   <- ic("agresti-coull")
wald            <- ic("asymptotic")
# Wilson with continuity correction (Newcombe 1998, method 4); 0 and 1 at the boundaries
wcc_lo <- if (x == 0) 0 else max(0, (2 * n * p + z^2 - 1 - z * sqrt(z^2 - 2 - 1 / n + 4 * p * (n * (1 - p) + 1))) / (2 * (n + z^2)))
wcc_hi <- if (x == n) 1 else min(1, (2 * n * p + z^2 + 1 + z * sqrt(z^2 + 2 - 1 / n + 4 * p * (n * (1 - p) - 1))) / (2 * (n + z^2)))
wilson_cc <- c(p, wcc_lo, wcc_hi)
# Jeffreys, equal-tailed (Brown, Cai & DasGupta 2001); binom's "bayes" method is HPD and differs
jeffreys <- c(p, if (x == 0) 0 else qbeta(alfa / 2, x + 0.5, n - x + 0.5),
                 if (x == n) 1 else qbeta(1 - alfa / 2, x + 0.5, n - x + 0.5))

res <- list(p = p, wilson = wilson, wilson_cc = wilson_cc, clopper_pearson = clopper_pearson,
            agresti_coull = agresti_coull, jeffreys = jeffreys, wald = wald)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# DescTools::BinomCI(x, n, conf.level = nivel, method = c("wilson", "wilsoncc", "clopper-pearson", "agresti-coull", "jeffreys", "wald"))
