# Descriptive statistics for one pasted column - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

# The pasted column, one numeric value per row:
x <- c(47, 165, 97, 138, 202, 156, 166, 141, 96, 132, 177, 51, 150, 117, 210,
  178, 208, 138, 171, 50, 162, 139, 134, 126, 160, 147, 196, 75, 166, 204,
  226, 148, 99, 123, 160, 147, 153, 148, 79, 122)
nivel <- 0.95
n <- length(x)

media <- mean(x); de <- sd(x); eem <- de/sqrt(n)   # sd() uses the n - 1 denominator

# t interval for the mean, written out because t.test() stops with constant data;
# otherwise identical to t.test(x, conf.level = nivel)$conf.int
tcrit <- qt(1 - (1 - nivel)/2, n - 1)
media_ic <- c(media, media - tcrit*eem, media + tcrit*eem)

q <- quantile(x, c(0.25, 0.5, 0.75), type = 7, names = FALSE)   # type 7 = R's default (Hyndman & Fan 1996)
iqr <- q[3] - q[1]
cv <- de/media

# Sample skewness G1 and excess kurtosis G2 (Joanes & Gill 1998, "type 2": the SPSS/SAS pair)
m <- function(k) mean((x - media)^k)
g1 <- if (n >= 3 && m(2) > 0) m(3)/m(2)^1.5 * sqrt(n*(n - 1))/(n - 2) else NA_real_
g2 <- if (n >= 4 && m(2) > 0) ((n + 1)*(m(4)/m(2)^2 - 3) + 6)*(n - 1)/((n - 2)*(n - 3)) else NA_real_

media_geom <- if (all(x > 0)) exp(mean(log(x))) else NA_real_   # undefined with zero or negative values

# Shapiro-Wilk (Royston 1995, AS R94): needs 3 <= n <= 5000 and a non-zero range
sw <- if (n >= 3 && n <= 5000 && diff(range(x)) > 0) shapiro.test(x) else NULL
sw_w <- if (is.null(sw)) NA_real_ else unname(sw$statistic)
sw_p <- if (is.null(sw)) NA_real_ else sw$p.value

n_atipicos <- sum(x < q[1] - 1.5*iqr | x > q[3] + 1.5*iqr)   # Tukey's fences

res <- list(n = n, media = media_ic, de = de, eem = eem,
            mediana = q[2], q1 = q[1], q3 = q[3], iqr = iqr,
            min = min(x), max = max(x), rango = diff(range(x)), cv = cv,
            g1 = g1, g2 = g2, media_geom = media_geom,
            sw_w = sw_w, sw_p = sw_p, n_atipicos = n_atipicos)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))

# Equivalent in RStudio (not run in the browser):
# DescTools::Skew(x, method = 2); DescTools::Kurt(x, method = 2); e1071::skewness(x, type = 2)
