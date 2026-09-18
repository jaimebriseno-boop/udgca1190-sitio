# Sample size to detect a correlation (Fisher's z transformation) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)
library(pwr)

r <- 0.3                      # correlation worth detecting (not 0, |r| <= 0.98)
alfa <- 0.05                # significance level
lateralidad <- "bilateral"  # "bilateral" or "unilateral"
poder <- 0.8              # target power
perdidas <- 0        # expected losses (0-0.5)
n_dado <- 4            # pairs already available (inverse mode); 0 = not given

tside <- if (lateralidad == "bilateral") 2 else 1
z_alfa <- qnorm(alfa / tside, lower.tail = FALSE)
z_beta <- qnorm(poder)

# Fisher (1915, 1921): atanh(r) is nearly normal with standard error 1/sqrt(n - 3)
c_fisher <- atanh(r)                               # 0.5 * log((1 + r) / (1 - r))
n_clasico <- ((z_alfa + z_beta) / c_fisher)^2 + 3
n_ajustado <- n_clasico / (1 - perdidas)           # Lwanga & Lemeshow (1991)

# pwr adds the bias correction r/(2*(n - 1)) and uses the t quantile instead of
# the normal one, so it lands one or two subjects below the classic formula.
# With a very large r and a modest power its uniroot finds no sign change (the
# four pairs of the lower bound already exceed the power) and it stops: that
# combination is reported as NA instead of aborting the whole script.
alternativa <- if (tside == 2) "two.sided" else if (r > 0) "greater" else "less"
n_pwr <- tryCatch(pwr.r.test(r = r, sig.level = alfa, power = poder, alternative = alternativa)$n,
                  error = function(e) NA_real_)

# Inverse mode: power reached with the pairs already available.
poder_dado <- if (n_dado >= 4) pnorm(abs(c_fisher) * sqrt(n_dado - 3) - z_alfa) else NA_real_

# Values travel WITHOUT rounding: the interface takes the ceiling once, at the end.
res <- list(z_alfa = z_alfa, z_beta = z_beta, c_fisher = c_fisher, n_clasico = n_clasico,
            n_pwr = n_pwr, n_ajustado = n_ajustado, poder_dado = poder_dado)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio: presize::prec_cor(r = r, conf.width = 0.2, conf.level = 1 - alfa, method = "fisher")
