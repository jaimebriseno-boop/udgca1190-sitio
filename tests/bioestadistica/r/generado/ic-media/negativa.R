# Confidence interval for a mean (t) and for the SD (chi-squared) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

media <- -2.5; de <- 1.2; n <- 12; nivel <- 0.95

# Two-sided Student t quantile with n - 1 degrees of freedom, and the standard error of the mean
tcrit <- qt(1 - (1 - nivel)/2, n - 1)
eem <- de/sqrt(n)
media_ic <- c(media, media - tcrit*eem, media + tcrit*eem)

# CI for the population SD from the chi-squared distribution of (n - 1)s^2/sigma^2 (equal tails)
de_ic <- c(de, de*sqrt((n - 1)/qchisq(1 - (1 - nivel)/2, n - 1)), de*sqrt((n - 1)/qchisq((1 - nivel)/2, n - 1)))

res <- list(media = media_ic, eem = eem, de = de_ic, t_crit = tcrit)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio with raw data: t.test(x, conf.level = nivel)$conf.int; DescTools::MeanCI(x)
