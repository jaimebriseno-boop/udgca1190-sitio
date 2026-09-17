# Mean and SD from median, range or IQR (Luo 2018, Wan 2014, Hozo 2005) - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

escenario <- "s3"   # "s1" = min, median, max; "s2" = Q1, median, Q3; "s3" = the five numbers
n <- 4
a <- 2; q1 <- 4; m <- 6; q3 <- 9; b <- 21   # NA where the scenario does not use them

# Mean - Luo et al. 2018, with the optimal weights of each scenario
if (escenario == "s1") {
  w1 <- 4/(4 + n^0.75)
  media_luo <- w1*(a + b)/2 + (1 - w1)*m
} else if (escenario == "s2") {
  w2 <- 0.70 + 0.39/n
  media_luo <- w2*(q1 + q3)/2 + (1 - w2)*m
} else {
  w3 <- 2.2/(2.2 + n^0.75)
  w4 <- 0.70 - 0.72/n^0.55
  media_luo <- w3*(a + b)/2 + w4*(q1 + q3)/2 + (1 - w3 - w4)*m
}

# Mean - Wan et al. 2014
media_wan <- switch(escenario,
                    s1 = (a + 2*m + b)/4,
                    s2 = (q1 + m + q3)/3,
                    s3 = (a + 2*q1 + 2*m + 2*q3 + b)/8)

# SD - Wan et al. 2014: expected range xi(n) and expected IQR eta(n) of n standard normal values
xi  <- 2*qnorm((n - 0.375)/(n + 0.25))
eta <- 2*qnorm((0.75*n - 0.125)/(n + 0.25))
de_wan <- switch(escenario,
                 s1 = (b - a)/xi,
                 s2 = (q3 - q1)/eta,
                 s3 = ((b - a)/xi + (q3 - q1)/eta)/2)

# Hozo et al. 2005, by ranges of n; it needs the minimum and the maximum, so it does not apply to S2
if (escenario == "s2") {
  media_hozo <- NA_real_
  de_hozo <- NA_real_
} else {
  media_hozo <- if (n <= 25) (a + 2*m + b)/4 else m
  de_hozo <- if (n <= 15) sqrt(((a - 2*m + b)^2/4 + (b - a)^2)/12) else if (n <= 70) (b - a)/4 else (b - a)/6
}

# Skewness of the reported summary itself: 1 means a symmetric summary
asim_rango <- if (escenario == "s2") NA_real_ else (b - m)/(m - a)
asim_iqr   <- if (escenario == "s1") NA_real_ else (q3 - m)/(m - q1)

res <- list(media_luo = media_luo, media_wan = media_wan, media_hozo = media_hozo,
            de_wan = de_wan, de_hozo = de_hozo, asim_rango = asim_rango, asim_iqr = asim_iqr)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# No CRAN package on the browser list implements these; estmeansd::qe.mean.sd is an alternative in RStudio
