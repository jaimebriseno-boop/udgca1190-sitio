# Kaplan-Meier survival curves and the log-rank test - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(survival)
library(jsonlite)

# The three pasted columns, one row per patient:
tiempo <- c(3, 5)
evento <- c(1, 0)
grupo <- c()
nivel <- 0.95
tipo_ic <- "log-log"
t1 <- 3   # first time of interest; 0 = none asked for
t2 <- 5   # second time of interest; 0 = none asked for

if (length(grupo) == 0) grupo <- rep(0, length(tiempo))   # no group column: a single curve
codigos <- sort(unique(grupo))                            # group 1 is the lowest numeric code
d <- data.frame(tiempo, evento, grupo = factor(grupo, levels = codigos))
etiquetas <- levels(d$grupo)
k <- length(etiquetas)

# conf.type is explicit: R defaults to "log", papers usually report "log-log"
sf <- survfit(Surv(tiempo, evento) ~ grupo, data = d, conf.type = tipo_ic, conf.int = nivel)

# survfit drops $strata when the grouping factor has a single level
filas <- if (is.null(sf$strata)) list(seq_along(sf$time)) else split(seq_along(sf$time), rep(1:k, sf$strata))

# Median survival with its CI (Brookmeyer-Crowley; the rule of quantile.survfit:
# first time with S < 0.5, midpoint of the plateau when S is exactly 0.5)
q <- quantile(sf, 0.5)
mediana <- function(g) {
  if (g > k) return(c(NA_real_, NA_real_, NA_real_))
  if (k == 1) c(q$quantile[[1]], q$lower[[1]], q$upper[[1]]) else c(q$quantile[g, 1], q$lower[g, 1], q$upper[g, 1])
}

# S(t*) with its CI. t = 0 means no time of interest was asked for (S(0) = 1
# is trivial), and past the last observed time of the group S(t) is not
# defined, although extend = TRUE would prolong the curve
s_en <- function(g, t) {
  if (g > k || t <= 0 || t > max(d$tiempo[d$grupo == etiquetas[g]])) return(c(NA_real_, NA_real_, NA_real_))
  s <- summary(sf, times = t, extend = TRUE)
  j <- if (is.null(s$strata)) 1 else which(as.integer(s$strata) == g)
  c(s$surv[j], s$lower[j], s$upper[j])
}

# Log-rank test (rho = 0, Mantel-Haenszel). It needs two groups, and it is NOT
# defined when the variance of the statistic is 0: survdiff then either stops
# with a singular system (every event tied at one time, or no group at risk
# when the events happen) or reports "on 0 degrees of freedom" with chisq = 0.
# In both situations chi2, the degrees of freedom and p are NA, not 0 and 1.
chi2 <- NA_real_; gl <- NA_real_; p <- NA_real_
if (k == 2) {
  lr <- tryCatch(survdiff(Surv(tiempo, evento) ~ grupo, data = d, rho = 0), error = function(err) NULL)
  if (!is.null(lr) && lr$var[1, 1] > 0) {
    chi2 <- lr$chisq
    gl <- length(lr$n) - 1
    p <- pchisq(chi2, gl, lower.tail = FALSE)
  }
}

n_de <- function(g) if (g > k) NA_real_ else sum(d$grupo == etiquetas[g])
ev_de <- function(g) if (g > k) NA_real_ else sum(d$evento[d$grupo == etiquetas[g]])
# Life table of one group, as survfit reports it (std.err is the SE of log S)
col <- function(g, campo) if (g > k) numeric(0) else sf[[campo]][filas[[g]]]

res <- list(n_1 = n_de(1), eventos_1 = ev_de(1), mediana_1 = mediana(1),
            s_t1_1 = s_en(1, t1), s_t2_1 = s_en(1, t2),
            n_2 = n_de(2), eventos_2 = ev_de(2), mediana_2 = mediana(2),
            s_t1_2 = s_en(2, t1), s_t2_2 = s_en(2, t2),
            chi2_logrank = chi2, gl = gl, p_logrank = p,
            t_1 = I(col(1, "time")), riesgo_1 = I(col(1, "n.risk")), ev_1 = I(col(1, "n.event")),
            cens_1 = I(col(1, "n.censor")), s_1 = I(col(1, "surv")), ee_1 = I(col(1, "std.err")),
            lo_1 = I(col(1, "lower")), hi_1 = I(col(1, "upper")),
            t_2 = I(col(2, "time")), riesgo_2 = I(col(2, "n.risk")), ev_2 = I(col(2, "n.event")),
            cens_2 = I(col(2, "n.censor")), s_2 = I(col(2, "surv")), ee_2 = I(col(2, "std.err")),
            lo_2 = I(col(2, "lower")), hi_2 = I(col(2, "upper")))
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio: survminer::ggsurvplot(sf, risk.table = TRUE)
