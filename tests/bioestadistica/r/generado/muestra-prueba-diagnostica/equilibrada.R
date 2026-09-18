# Sample size for sensitivity and specificity (Buderer 1996) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

sn <- 0.9; sp <- 0.9     # expected sensitivity and specificity (strictly between 0 and 1)
prev <- 0.5             # expected prevalence where the test will be used
w <- 0.05                   # half-width of the confidence interval (absolute precision)
nivel <- 0.95           # confidence level
perdidas <- 0     # expected losses (0-0.5)

z <- qnorm(1 - (1 - nivel) / 2)

# Buderer (1996): each half of the design is a Wald interval for a proportion.
n_d  <- z^2 * sn * (1 - sn) / w^2   # diseased needed to estimate Sn with precision +-w
n_nd <- z^2 * sp * (1 - sp) / w^2   # non-diseased needed to estimate Sp with precision +-w

# In a consecutive series nobody recruits by disease status: the prevalence
# decides how many patients must be screened to reach each of those groups.
n_sn <- n_d / prev
n_sp <- n_nd / (1 - prev)

n_total <- max(n_sn, n_sp)               # the binding requirement of the two
n_ajustado <- n_total / (1 - perdidas)   # Lwanga & Lemeshow (1991)

# Values travel WITHOUT rounding: the interface takes the ceiling once, at the end.
res <- list(z = z, n_d = n_d, n_sn = n_sn, n_nd = n_nd, n_sp = n_sp,
            n_total = n_total, n_ajustado = n_ajustado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio: presize::prec_sens(sens = sn, prev = prev, conf.width = 2*w, conf.level = nivel, method = "wald"); presize::prec_spec(spec = sp, prev = prev, conf.width = 2*w, conf.level = nivel, method = "wald")
