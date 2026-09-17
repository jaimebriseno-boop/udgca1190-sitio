# Predictive values from sensitivity, specificity and prevalence - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

sn <- 0.85; sp <- 0.95; prev <- 0.3   # sensitivity, specificity and prevalence where the test will be used (0-1)
n_d <- 80; n_nd <- 120             # diseased and non-diseased in the validation study; 0 = unknown (no CI)
nivel <- 0.9
z <- qnorm(1 - (1 - nivel) / 2)

vpp_punto <- sn * prev / (sn * prev + (1 - sp) * (1 - prev))         # Bayes' theorem
vpn_punto <- sp * (1 - prev) / (sp * (1 - prev) + (1 - sn) * prev)
lr_pos <- sn / (1 - sp)
lr_neg <- (1 - sn) / sp

# Logit confidence interval of Mercaldo, Lau & Zhou (2007); with Sn or Sp at 0 or 1 the standard
# error is undefined and the adjusted logit is used (0.5 added to each cell of the validation study)
logit <- function(p) log(p / (1 - p))
expit <- function(x) 1 / (1 + exp(-x))
ic_logit <- function(s, e, d, nd) {      # s = Sn, e = Sp, d = diseased, nd = non-diseased
  vpp <- s * prev / (s * prev + (1 - e) * (1 - prev))
  vpn <- e * (1 - prev) / (e * (1 - prev) + (1 - s) * prev)
  ee_vpp <- sqrt((1 - s) / (s * d) + e / ((1 - e) * nd))
  ee_vpn <- sqrt((1 - e) / (e * nd) + s / ((1 - s) * d))
  list(vpp = c(expit(logit(vpp) - z * ee_vpp), expit(logit(vpp) + z * ee_vpp)),
       vpn = c(expit(logit(vpn) - z * ee_vpn), expit(logit(vpn) + z * ee_vpn)))
}
if (n_d > 0 && n_nd > 0) {
  ajustado <- sn %in% c(0, 1) || sp %in% c(0, 1)
  ic <- if (ajustado) ic_logit((sn * n_d + 0.5) / (n_d + 1), (sp * n_nd + 0.5) / (n_nd + 1), n_d + 1, n_nd + 1) else ic_logit(sn, sp, n_d, n_nd)
  vpp <- c(vpp_punto, ic$vpp); vpn <- c(vpn_punto, ic$vpn)
} else {
  vpp <- vpp_punto; vpn <- vpn_punto     # without the study sizes there is no interval
}

# Natural frequencies per 1,000 people tested (Gigerenzer & Edwards 2003)
vp_mil <- 1000 * prev * sn;       fn_mil <- 1000 * prev * (1 - sn)
fp_mil <- 1000 * (1 - prev) * (1 - sp); vn_mil <- 1000 * (1 - prev) * sp

res <- list(vpp = vpp, vpn = vpn, lr_pos = lr_pos, lr_neg = lr_neg,
            vp_mil = vp_mil, fp_mil = fp_mil, fn_mil = fn_mil, vn_mil = vn_mil)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
