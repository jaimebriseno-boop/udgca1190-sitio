# 2x2 tests of independence: chi-squared (Pearson, Yates, N-1), Fisher's exact test and phi
# Bioestadistica abierta, UDG-CA-1190. Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

a <- 0; b <- 5; c <- 5; d <- 5   # rows = group or exposure (1, 2), columns = outcome (yes, no)
nivel <- 0.95                        # confidence level of the conditional odds ratio interval

m <- matrix(c(a, b, c, d), nrow = 2, byrow = TRUE)
n <- sum(m)
esperados <- outer(rowSums(m), colSums(m)) / n   # E_ij = (row i total) * (column j total) / n

chi   <- suppressWarnings(chisq.test(m, correct = FALSE))   # Pearson's chi-squared, 1 df
yates <- suppressWarnings(chisq.test(m, correct = TRUE))    # Yates' correction, bounded to min(0.5, |O - E|) as R does

# "N - 1" chi-squared (Campbell 2007): Pearson's statistic times (n - 1)/n
chi2_n1 <- unname(chi$statistic) * (n - 1) / n
p_n1 <- pchisq(chi2_n1, 1, lower.tail = FALSE)

# Two-sided "minlike" p (sum of the tables no more likely than the observed one) and the
# conditional maximum likelihood odds ratio with its interval (solved by uniroot, tol ~ 1.2e-4)
fisher <- fisher.test(m, conf.level = nivel)

phi <- (a * d - b * c) / sqrt(prod(rowSums(m)) * prod(colSums(m)))   # signed phi coefficient

res <- list(n = n,
            e_a = esperados[1, 1], e_b = esperados[1, 2], e_c = esperados[2, 1], e_d = esperados[2, 2],
            e_min = min(esperados),
            chi2 = unname(chi$statistic), p_chi2 = chi$p.value,
            chi2_yates = unname(yates$statistic), p_yates = yates$p.value,
            chi2_n1 = chi2_n1, p_n1 = p_n1,
            p_fisher = fisher$p.value,
            or_cond = c(unname(fisher$estimate), fisher$conf.int[1], fisher$conf.int[2]),
            phi = phi)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# exact2x2::exact2x2(m, tsmethod = "minlike")   # same p as fisher.test
# DescTools::Phi(m)
