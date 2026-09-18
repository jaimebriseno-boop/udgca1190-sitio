# Sample size for two independent means, exact non-central t - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

delta       <- 1         # smallest difference between means that matters
sigma       <- 3         # common standard deviation of the outcome
alfa        <- 0.01
lateralidad <- "bilateral"   # "bilateral" or "unilateral"
poder       <- 0.8         # target power (1 - beta)
r           <- 1             # allocation ratio n2/n1
perdidas    <- 0      # expected losses, 0 to 0.5
n_dado      <- 0        # inverse mode: n1 already available; 0 = not given

tside   <- if (lateralidad == "bilateral") 2 else 1
z_alfa  <- qnorm(alfa/tside, lower.tail = FALSE)
z_beta  <- qnorm(poder)
d_cohen <- abs(delta)/sigma

# Exact power of Student's two-sample t test: under the alternative the statistic
# follows a NON-CENTRAL t with nu = n1 + n2 - 2 and ncp = |delta| / (sigma * sqrt(1/n1 + 1/n2)).
# This is the same function power.t.test evaluates, written for any allocation ratio r.
poder_de <- function(n1) {
  nu  <- pmax(1e-07, n1 * (1 + r) - 2)
  ncp <- abs(delta) / (sigma * sqrt(1/n1 + 1/(r * n1)))
  pt(qt(alfa/tside, nu, lower.tail = FALSE), nu, ncp = ncp, lower.tail = FALSE)
}

# Smallest n1 reaching the target power, with the bracket and the tolerance of power.t.test.
# Two guards: fewer than 2 per group is not a sample size, and an effect so small that
# even 1e7 per group falls short is reported as "not defined" instead of a made-up number.
n1 <- if (poder_de(2) >= poder) 2 else
      if (poder_de(1e7) < poder) NA_real_ else
      uniroot(function(n1) poder_de(n1) - poder, c(2, 1e7), tol = 1e-10)$root
n2      <- r * n1
n_total <- n1 + n2

# power.t.test only covers equal groups; with r != 1 it does not apply and the equation above is the answer.
# It needs the SAME two guards as n1: power.t.test extends the bracket (extendInt = "upX") and
# would answer with a sample size below 2, or beyond the 1e7 where the equation above stops.
n_ptt <- if (r != 1) NA_real_ else
         if (poder_de(2) >= poder) 2 else
         if (poder_de(1e7) < poder) NA_real_ else
         power.t.test(delta = abs(delta), sd = sigma, sig.level = alfa, power = poder,
                      type = "two.sample",
                      alternative = if (tside == 2) "two.sided" else "one.sided",
                      tol = 1e-10)$n

# Classical normal approximation with Guenther's (1981) correction, shown as a teaching row
n1_normal <- (1 + 1/r) * (z_alfa + z_beta)^2 * sigma^2 / delta^2 + z_alfa^2/4
n2_normal <- r * n1_normal

n_ajustado <- n_total / (1 - perdidas)   # Lwanga & Lemeshow 1991; the interface takes the ceiling

# Inverse mode: power actually reached with n1 = n_dado and n2 = r * n_dado
poder_dado <- if (n_dado >= 2) poder_de(n_dado) else NA_real_
poder_dado_normal <- if (n_dado >= 2)
  pnorm(abs(delta) / (sigma * sqrt(1/n_dado + 1/(r * n_dado))) - z_alfa) else NA_real_

res <- list(z_alfa = z_alfa, z_beta = z_beta, d_cohen = d_cohen,
            n1 = n1, n2 = n2, n_total = n_total, n_ptt = n_ptt,
            n1_normal = n1_normal, n2_normal = n2_normal, n_ajustado = n_ajustado,
            poder_dado = poder_dado, poder_dado_normal = poder_dado_normal)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run here): pwr::pwr.t.test(d = d_cohen, power = poder, type = "two.sample")
# and, for unequal groups, pwr::pwr.t2n.test(n1 = ..., n2 = ..., d = d_cohen)
