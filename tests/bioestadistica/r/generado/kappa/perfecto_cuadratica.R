# Cohen's kappa (unweighted and weighted) for a k x k agreement table
#   - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(irr)
library(jsonlite)

# The pasted table, row by row: rows = rater A, columns = rater B,
# the same categories in the same order.
x <- matrix(c(30, 0, 0, 0, 40, 0, 0, 0, 30), nrow = 3, byrow = TRUE)
ponderacion <- "cuadratica"          # "ninguna" | "lineal" | "cuadratica"
nivel <- 0.95
tipo <- switch(ponderacion, ninguna = "unweighted", lineal = "equal", cuadratica = "squared")

# A category nobody used (empty row AND empty column) is dropped first: it adds no
# agreement, and the weights depend on how many categories there are.
vacias <- rowSums(x) == 0 & colSums(x) == 0
x <- x[!vacias, !vacias, drop = FALSE]
k <- nrow(x); n <- sum(x)

# Agreement weights w_ij (Cohen 1968); with k = 2 the three schemes are the identity.
w <- switch(tipo, unweighted = diag(k), equal = 1 - abs(outer(1:k, 1:k, "-"))/(k - 1),
            squared = 1 - (outer(1:k, 1:k, "-")/(k - 1))^2)
p <- x/n; pi <- rowSums(p); pj <- colSums(p)
po <- sum(w*p); pe <- sum(w*outer(pi, pj)); kappa <- (po - pe)/(1 - pe)

# Asymptotic standard error of Fleiss, Cohen & Everitt (1969), from the OBSERVED cells,
# and its Wald interval truncated to [-1, 1]. max(0, .) only absorbs the rounding of
# perfect agreement, where the radicand is 0 up to one ulp.
wi <- as.vector(w %*% pj); wj <- as.vector(t(w) %*% pi)   # weighted row and column means
ee <- sqrt(max(0, sum(p*(w - outer(wi, wj, "+")*(1 - kappa))^2) - (kappa - pe*(1 - kappa))^2))/((1 - pe)*sqrt(n))
z <- qnorm(1 - (1 - nivel)/2)
kappa_ic <- c(kappa, max(-1, kappa - z*ee), min(1, kappa + z*ee))

# z and p against kappa = 0 exactly as irr::kappa2, whose variance is the one under the
# null hypothesis of chance agreement (EXPECTED cells), not the one of the interval.
# kappa2 needs the ratings pair by pair, so they are rebuilt from the table; the
# categories are numbered from 11 because kappa2 sorts its levels as text, and with
# 1 to 10 it would read them "1", "10", "2" and shift the weights of a 10 x 10 table.
niveles <- 10 + 1:k
ratings <- cbind(rep(niveles, rowSums(x)), unlist(lapply(1:k, function(i) rep(niveles, x[i, ]))))
k2 <- kappa2(ratings, weight = tipo)

# Largest kappa these marginals allow. Unweighted that maximum is sum(min(pi, pj));
# with linear or quadratic weights the north-west corner rule reaches it, because
# |i - j| and (i - j)^2 satisfy Monge's condition.
esquina <- function(a, b) {
  m <- matrix(0, length(a), length(b)); i <- 1; j <- 1
  while (i <= length(a) && j <= length(b)) {
    v <- min(a[i], b[j]); m[i, j] <- m[i, j] + v; a[i] <- a[i] - v; b[j] <- b[j] - v
    if (a[i] <= 0) i <- i + 1 else j <- j + 1
  }
  m
}
po_max <- if (tipo == "unweighted") sum(pmin(pi, pj)) else sum(w*esquina(pi, pj))
kappa_max <- (po_max - pe)/(1 - pe)

# Only with two categories (Byrt, Bishop & Carlin 1993): PABAK removes the influence
# of prevalence and bias, and the two indices measure them.
pabak <- if (k == 2) 2*po - 1 else NA_real_
indice_prevalencia <- if (k == 2) abs(x[1, 1] - x[2, 2])/n else NA_real_
indice_sesgo <- if (k == 2) abs(x[1, 2] - x[2, 1])/n else NA_real_

res <- list(n = n, po = po, pe = pe, kappa = kappa_ic, ee = ee,
            z_h0 = unname(k2$statistic), p_h0 = k2$p.value, kappa_max = kappa_max,
            pabak = pabak, indice_prevalencia = indice_prevalencia,
            indice_sesgo = indice_sesgo)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# DescTools::CohenKappa(x, weights = "Unweighted", conf.level = nivel)   # "Equal-Spacing", "Fleiss-Cohen"
