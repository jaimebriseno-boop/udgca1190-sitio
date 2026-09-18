# Sample size for two independent proportions (Fleiss) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)
library(pwr)

p1 <- 0.7; p2 <- 0.85       # proportions expected in group 1 and in group 2
alfa        <- 0.05        # significance level
lateralidad <- "bilateral" # "bilateral" or "unilateral"
poder       <- 0.8       # target power, 1 - beta
r           <- 2           # allocation ratio n2/n1 (1 = equal groups)
correccion  <- "si"  # "si" = report the continuity-corrected n
perdidas    <- 0    # expected losses to follow-up, 0 to 0.5
n_dado      <- 60      # inverse mode: n1 already available; 0 = not used

alternative <- if (lateralidad == "bilateral") "two.sided" else "one.sided"
tside  <- if (lateralidad == "bilateral") 2 else 1
z_alfa <- qnorm(alfa / tside, lower.tail = FALSE)
z_beta <- qnorm(poder)

# Fleiss (1981; Fleiss, Levin & Paik 2003, section 4.2) written out by hand so that
# any allocation ratio is allowed: pooled variance under H0, separate variances under H1.
d    <- abs(p1 - p2)
q1   <- 1 - p1
q2   <- 1 - p2
pbar <- (p1 + r * p2) / (r + 1)
qbar <- 1 - pbar
n1_fleiss <- (z_alfa * sqrt((r + 1) * pbar * qbar) + z_beta * sqrt(r * p1 * q1 + p2 * q2))^2 / (r * d^2)
n2_fleiss <- r * n1_fleiss

# Continuity correction of Fleiss, Tytun & Ury (1980): the corrected n approximates
# Fisher's exact test, the uncorrected one approximates Pearson's chi-squared.
n1_cc <- n1_fleiss / 4 * (1 + sqrt(1 + 2 * (r + 1) / (r * n1_fleiss * d)))^2
n2_cc <- r * n1_cc

n1 <- if (correccion == "si") n1_cc else n1_fleiss
n2 <- r * n1
n_total    <- n1 + n2
n_ajustado <- n_total / (1 - perdidas)   # Lwanga & Lemeshow 1991; the interface takes the ceiling

# Same problem solved by base R. It assumes equal groups, so with r != 1 there is
# nothing to compare against; tryCatch keeps an unsolvable design from stopping the script.
n_ppt <- if (r == 1) {
  tryCatch(power.prop.test(p1 = p1, p2 = p2, sig.level = alfa, power = poder,
                           alternative = alternative, tol = 1e-10)$n,
           error = function(e) NA_real_)
} else NA_real_

# Cohen's h (arcsine transformation) and the n that pwr derives from it. pwr has no
# "one.sided" level: the one-sided test is asked for with "greater" and h > 0, so the
# magnitude of h is what travels, exactly as pwr itself does with "two.sided".
h_cohen <- ES.h(p1, p2)
alt_pwr <- if (lateralidad == "bilateral") "two.sided" else "greater"
n_pwr_h <- if (r == 1) {
  tryCatch(pwr.2p.test(h = abs(h_cohen), sig.level = alfa, power = poder,
                       alternative = alt_pwr)$n,
           error = function(e) NA_real_)
} else NA_real_

# Inverse mode: power attainable with n1 = n_dado and n2 = r * n_dado, by the same
# normal formula of Fleiss without the continuity correction.
poder_dado <- if (n_dado >= 2) {
  pnorm((d * sqrt(r * n_dado) - z_alfa * sqrt((r + 1) * pbar * qbar)) / sqrt(r * p1 * q1 + p2 * q2))
} else NA_real_

res <- list(z_alfa = z_alfa, z_beta = z_beta,
            n1_fleiss = n1_fleiss, n2_fleiss = n2_fleiss,
            n1_cc = n1_cc, n2_cc = n2_cc,
            n1 = n1, n2 = n2, n_total = n_total, n_ajustado = n_ajustado,
            n_ppt = n_ppt, h_cohen = h_cohen, n_pwr_h = n_pwr_h,
            poder_dado = poder_dado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# epiR::epi.sscompb(treat = 0.85, control = 0.70, n = NA, power = 0.80, r = 1, conf.level = 0.95)
