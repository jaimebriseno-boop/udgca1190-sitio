# Descriptive statistics for one pasted column - Bioestadistica abierta, UDG-CA-1190
# Runs as is in R, RStudio or webR; prints the results as JSON at the end.
library(jsonlite)

# The pasted column, one numeric value per row:
x <- c(37.7, 52.7, 60.3, 65.7, 69.8, 73.2, 76.2, 78.8, 81.1, 83.2, 85.2, 87,
  88.6, 90.2, 91.7, 93.1, 94.5, 95.7, 97, 98.2, 99.3, 100.4, 101.5, 102.5,
  103.5, 104.5, 105.4, 106.3, 107.2, 108.1, 109, 109.8, 110.6, 111.4,
  112.2, 113, 113.8, 114.5, 115.3, 116, 116.7, 117.4, 118.1, 118.8, 119.4,
  120.1, 120.8, 121.4, 122.1, 122.7, 123.3, 124, 124.6, 125.2, 125.8,
  126.4, 127, 127.6, 128.2, 128.7, 129.3, 129.9, 130.4, 131, 131.6, 132.1,
  132.7, 133.2, 133.8, 134.3, 134.9, 135.4, 135.9, 136.5, 137, 137.5, 138,
  138.6, 139.1, 139.6, 140.1, 140.6, 141.2, 141.7, 142.2, 142.7, 143.2,
  143.7, 144.2, 144.7, 145.2, 145.7, 146.2, 146.7, 147.2, 147.7, 148.2,
  148.7, 149.2, 149.7, 150.3, 150.8, 151.3, 151.8, 152.3, 152.8, 153.3,
  153.8, 154.3, 154.8, 155.3, 155.8, 156.3, 156.8, 157.3, 157.8, 158.3,
  158.8, 159.4, 159.9, 160.4, 160.9, 161.4, 162, 162.5, 163, 163.5, 164.1,
  164.6, 165.1, 165.7, 166.2, 166.8, 167.3, 167.9, 168.4, 169, 169.6,
  170.1, 170.7, 171.3, 171.8, 172.4, 173, 173.6, 174.2, 174.8, 175.4, 176,
  176.7, 177.3, 177.9, 178.6, 179.2, 179.9, 180.6, 181.2, 181.9, 182.6,
  183.3, 184, 184.7, 185.5, 186.2, 187, 187.8, 188.6, 189.4, 190.2, 191,
  191.9, 192.8, 193.7, 194.6, 195.5, 196.5, 197.5, 198.5, 199.6, 200.7,
  201.8, 203, 204.3, 205.5, 206.9, 208.3, 209.8, 211.4, 213, 214.8, 216.8,
  218.9, 221.2, 223.8, 226.8, 230.2, 234.3, 239.7, 247.3, 262.3)
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
