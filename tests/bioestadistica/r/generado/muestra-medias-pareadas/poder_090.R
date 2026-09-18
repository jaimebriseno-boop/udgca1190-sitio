# Sample size for paired means, exact non-central t - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

delta       <- 0.5         # mean of the within-pair differences that matters
de_dif      <- 1.5        # SD of the DIFFERENCES; 0 = not captured, then it is derived below
sigma       <- 0         # SD of each measurement; only used when de_dif is not given (0 = not captured)
rho         <- 0           # correlation between the two measurements; only used together with sigma
alfa        <- 0.05
lateralidad <- "bilateral"   # "bilateral" or "unilateral"
poder       <- 0.9         # target power (1 - beta)
perdidas    <- 0      # expected losses, 0 to 0.5
n_dado      <- 0        # inverse mode: pairs already available; 0 = not given

# The paired t test only needs the SD of the differences. When it is not reported,
# it follows from the SD of each measurement and their correlation: var(A - B) = 2*sigma^2*(1 - rho).
de_dif <- if (de_dif > 0) de_dif else sigma * sqrt(2 * (1 - rho))

tside   <- if (lateralidad == "bilateral") 2 else 1
z_alfa  <- qnorm(alfa/tside, lower.tail = FALSE)
z_beta  <- qnorm(poder)
d_cohen <- abs(delta)/de_dif

# Exact power of the paired t test: non-central t with nu = n - 1 and ncp = sqrt(n)*|delta|/de_dif.
# It is the body power.t.test evaluates with type = "paired" (tsample = 1).
poder_de <- function(n) {
  nu <- pmax(1e-07, n - 1)
  pt(qt(alfa/tside, nu, lower.tail = FALSE), nu, ncp = sqrt(n) * abs(delta)/de_dif, lower.tail = FALSE)
}

# Smallest number of PAIRS reaching the target power. Two guards before calling R:
# fewer than 2 pairs is not a sample size, and an effect so small that even 1e7 pairs
# falls short is reported as "not defined" instead of a made-up number.
n <- if (poder_de(2) >= poder) 2 else
     if (poder_de(1e7) < poder) NA_real_ else
     power.t.test(delta = abs(delta), sd = de_dif, sig.level = alfa, power = poder,
                  type = "paired",
                  alternative = if (tside == 2) "two.sided" else "one.sided",
                  tol = 1e-10)$n

# Classical normal approximation with Guenther's (1981) one-sample correction, as a teaching row
n_normal <- (z_alfa + z_beta)^2 * de_dif^2 / delta^2 + z_alfa^2/2

n_ajustado <- n / (1 - perdidas)   # Lwanga & Lemeshow 1991; the interface takes the ceiling

# Inverse mode: power actually reached with n_dado pairs
poder_dado <- if (n_dado >= 2) poder_de(n_dado) else NA_real_
poder_dado_normal <- if (n_dado >= 2)
  pnorm(sqrt(n_dado) * abs(delta)/de_dif - z_alfa) else NA_real_

res <- list(de_dif = de_dif, z_alfa = z_alfa, z_beta = z_beta, d_cohen = d_cohen,
            n = n, n_normal = n_normal, n_ajustado = n_ajustado,
            poder_dado = poder_dado, poder_dado_normal = poder_dado_normal)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run here): pwr::pwr.t.test(d = d_cohen, power = poder, type = "paired")
