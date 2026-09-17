# Post-test probability by Bayes' theorem in odds form (Fagan 1975) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

pre <- 0.3; lr_pos <- 17; lr_neg <- 0   # pre-test probability (0-1) and likelihood ratios

momios <- function(p) p / (1 - p)     # probability -> odds
post <- function(p, lr) {             # post-test probability; certainties (0 and 1) stay fixed
  if (p <= 0) return(0)
  if (p >= 1) return(1)
  o <- p / (1 - p) * lr
  o / (1 + o)
}
momios_pre <- momios(pre)
momios_post_pos <- momios_pre * lr_pos
momios_post_neg <- momios_pre * lr_neg
post_pos <- post(pre, lr_pos)         # after a positive result
post_neg <- post(pre, lr_neg)         # after a negative result

res <- list(post_pos = post_pos, post_neg = post_neg,
            ganancia_pos = post_pos - pre, ganancia_neg = pre - post_neg,
            momios_pre = momios_pre, momios_post_pos = momios_post_pos, momios_post_neg = momios_post_neg)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
