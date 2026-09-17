# Especificación de diseño estadístico: «Bioestadística abierta», primer lote

Documento de dominio (no código). Español primero; los nombres en inglés son los del gemelo `/en/`. Toda referencia cuyos datos bibliográficos no pude confirmar lleva «[verificar]». Ningún valor esperado de fixture se inventa: los produce R.

## 0. Convenciones comunes a todas las calculadoras

**Niveles.** N1 = TypeScript instantáneo (recalcula en cada tecla; webR solo si el usuario pulsa «Ejecutar en R» para comparar). N2 = requiere webR (ajuste de modelos, ICC).

**Notación 2×2.** Diagnóstico: filas = resultado de la prueba (+, −), columnas = estándar de referencia (enfermo, sano): $a$ = VP, $b$ = FP, $c$ = FN, $d$ = VN, $n=a+b+c+d$. Asociación: filas = expuesto / no expuesto, columnas = desenlace sí / no: $a,b$ / $c,d$; $n_1=a+b$, $n_0=c+d$, $m_1=a+c$, $m_0=b+d$. Es el mismo orden que usan `epiR::epi.tests` y `epiR::epi.2by2`.

**IC por defecto.** Proporciones: Wilson (score, sin corrección de continuidad) según Newcombe 1998 y Brown, Cai & DasGupta 2001; selector con Clopper-Pearson, Agresti-Coull, Wald (etiquetado «didáctico» si $n\hat p<5$ o $n(1-\hat p)<5$) y Jeffreys (opcional). Razones (RR, OR, LR, DOR, HR): método logarítmico (Katz, Woolf, Simel). Nivel de confianza editable (90, 95, 99; por defecto 95).

**Celdas cero.** Por defecto sin corrección, igual que R: una razón (RR, OR, LR, DOR) con celda 0 devuelve 0 o ∞ como estimación puntual e IC no definido (`[NaN, NaN]`), más un aviso `celda_cero` con botón «aplicar corrección de Haldane-Anscombe». Al activarla se suma 0.5 a las cuatro celdas antes de calcular la razón y su IC (Haldane 1956; Anscombe 1956), se emite el aviso `haldane_aplicado` y la opción viaja al snippet R (`corr <- 0.5`) para que TS y R hagan lo mismo; nunca se aplica en silencio. No se aplica a Sn, Sp, VPP, VPN, χ², Fisher ni McNemar.

**Contrato de snippets R (alineado con el plan del motor, §3).** Un solo texto R por calculadora sirve como bloque copiable, como lo que ejecuta webR y como lo que ejecuta `Rscript` para el fixture; termina con `cat(toJSON(res, auto_unbox = TRUE, digits = NA))`. Paquetes admitidos en el snippet ejecutable: base R (`stats`), `binom`, `PropCIs`, `exact2x2`, `irr`, `pwr`, `survival`, `jsonlite`. `epiR` (arrastra `sf`, `officer`, `flextable` en wasm), `DescTools`, `presize`, `pROC` y `Hmisc` aparecen solo como líneas comentadas «Equivalente en RStudio» al final del snippet y como oráculo secundario local en `Rscript`. Los nombres de campo del JSON son idénticos en TS, R y fixtures (diagnóstico: `n, se, sp, vpp, vpn, prev, exactitud, youden, lr_pos, lr_neg, dor`; un vector de longitud 3 es `[estimación, inferior, superior]`). El método de IC de proporciones del snippet debe seguir la selección de la calculadora (`methods = "wilson"` por defecto en `binom.confint`; el ejemplo §3.2 del motor usa `"exact"`, hay que parametrizarlo). Detalles de R que TS reproduce y que quedan fijados como `MetodoId` y caso de fixture: `chisq.test` acota Yates a $\min(0.5,|O-E|)$; `mcnemar.test` corrige por defecto; `quantile(type = 7)`; `survfit` con `conf.type = "log-log"` explícito; `fisher.test` da p «minlike» y su IC del OR condicional lo resuelve `uniroot` con tolerancia ≈ 1.2e-4; `power.prop.test` y `power.t.test` se llaman con `tol = 1e-10`; `power.t.test` usa la t no central (el motor implementa `pnt`, AS 243).

**Validación.** Conteos: enteros ≥ 0, denominadores > 0. Proporciones: 0–1 o 0–100 % (si > 1 se interpreta como porcentaje). Confianza 80–99.9 %. α 0.001–0.20. Poder 0.50–0.99. Columnas pegadas: separadores salto de línea, tabulador, «,» y «;»; coma decimal si no hay puntos; tokens no numéricos se cuentan y se omiten con aviso.

**Redondeo de pantalla** (el cálculo interno es en doble precisión sin redondear). Proporciones: 1 decimal en %. Razones: 2 decimales (3 cifras significativas si < 0.1). Valores p: «< 0.001» si menor; si no, 3 decimales. Tamaños de muestra: techo por grupo, una sola vez al final. NNT: entero hacia arriba en el titular, valor exacto en el detalle.

**Interfaz idéntica en todas.** Entradas + «Cargar ejemplo» + «Limpiar»; tabla de resultados (estimación, IC, método); pestañas «Ecuación» (KaTeX), «Explicación», «Interpretación», «R» (snippet + «Ejecutar en R» con comparación JS/R), «Referencias», «Métodos» (párrafo copiable); una gráfica; exportar JSON/CSV/Markdown. Todo ejemplo se etiqueta «Datos ilustrativos, no reales».

**Ejemplo transversal.** Prueba rápida de antígeno NS1 frente a RT-PCR para dengue en 200 pacientes febriles (ilustrativo): VP = 68, FP = 6, FN = 12, VN = 114. Los modelos (E) y los descriptivos (D6) usan `dengue_sim.csv`, un conjunto simulado de 150 filas generado por un script R del repositorio con `set.seed(1190)` (variables: `edad`, `sexo`, `dias_fiebre`, `plaquetas`, `hematocrito`, `ns1`, `grave` 0/1, `tiempo` en días, `evento` 0/1); así ningún «dato» se escribe a mano.

**Bloque I (umbrales de interpretación, reutilizados).**
- LR (Jaeschke, Guyatt & Sackett 1994): LR+ > 10 o LR− < 0.1 «cambios grandes, a menudo concluyentes»; 5–10 o 0.1–0.2 «moderados»; 2–5 o 0.2–0.5 «pequeños, a veces importantes»; 1–2 o 0.5–1 «rara vez importantes». Nota opcional con la regla de aproximación de McGee (J Gen Intern Med 2002), citada como método, sin reproducir tablas del libro.
- κ (Landis & Koch 1977): < 0 pobre; 0–0.20 leve; 0.21–0.40 aceptable; 0.41–0.60 moderada; 0.61–0.80 sustancial; 0.81–1 casi perfecta. Siempre con la advertencia «cortes convencionales, no derivados de la teoría; interprete con el IC».
- ICC (Koo & Li 2016, sobre el límite inferior del IC): < 0.5 pobre; 0.5–0.75 moderada; 0.75–0.9 buena; > 0.9 excelente.
- φ y r (Cohen 1988): 0.1 pequeño, 0.3 mediano, 0.5 grande; advertir que son convenciones.
- Significación: nunca dicotomizar sin matices: «p = {p}; con α = 0.05 {se rechaza / no se rechaza} la hipótesis nula de {…}. La magnitud y el IC importan más que el valor p».

---

## A. Pruebas diagnósticas

### A1 · `dx-tabla-2x2` · Rendimiento de una prueba diagnóstica (tabla 2×2) / Diagnostic test accuracy (2×2 table) · N1

2. **Entradas.** $a,b,c,d$; nivel de confianza; método de IC para proporciones. Ejemplo: 68 / 6 / 12 / 114.
3. **Salidas.**

| Medida | Estimador | IC por defecto | Alternativas |
|---|---|---|---|
| Sn, Sp, VPP, VPN, prevalencia, exactitud | proporciones | Wilson | CP, AC, Wald, Jeffreys |
| LR+, LR− | $Sn/(1-Sp)$, $(1-Sn)/Sp$ | log (Simel 1991) | — |
| DOR | $ad/(bc)$ | log (Woolf 1955; Glas 2003) | — |
| J de Youden | $Sn+Sp-1$ | Wald (delta) | bootstrap (fase 2) |

Comprobación manual del ejemplo (puntuales): Sn 0.850, Sp 0.950, VPP 0.919, VPN 0.905, LR+ 17.0, LR− 0.158, DOR 107.7, J 0.80, exactitud 0.91. Los IC provienen del oráculo R.
4. **Ecuaciones.**
$$Sn=\frac{a}{a+c},\quad Sp=\frac{d}{b+d},\quad VPP=\frac{a}{a+b},\quad VPN=\frac{d}{c+d},\quad LR^{+}=\frac{Sn}{1-Sp},\quad LR^{-}=\frac{1-Sn}{Sp},\quad DOR=\frac{ad}{bc}$$
$$IC(LR^{+})=\exp\!\left[\ln LR^{+}\pm z_{1-\alpha/2}\sqrt{\tfrac{1}{a}-\tfrac{1}{a+c}+\tfrac{1}{b}-\tfrac{1}{b+d}}\right],\qquad IC(LR^{-})=\exp\!\left[\ln LR^{-}\pm z\sqrt{\tfrac{1}{c}-\tfrac{1}{a+c}+\tfrac{1}{d}-\tfrac{1}{b+d}}\right]$$
$$IC(DOR)=\exp\!\left[\ln DOR\pm z\sqrt{\tfrac1a+\tfrac1b+\tfrac1c+\tfrac1d}\right],\qquad IC(J)=J\pm z\sqrt{\tfrac{Sn(1-Sn)}{a+c}+\tfrac{Sp(1-Sp)}{b+d}}$$
Wilson para $\hat p=x/m$: $\dfrac{\hat p+\frac{z^2}{2m}\pm z\sqrt{\frac{\hat p(1-\hat p)}{m}+\frac{z^2}{4m^2}}}{1+z^2/m}$.
5. **Casos límite.** $b=0$: LR+ = ∞ («sin falsos positivos»), IC con Haldane-Anscombe. $a=0$: Sn = 0, LR+ = 0. $c=0$: LR− = 0. Aviso si $a+c<10$ o $b+d<10$ («IC muy amplios»). Aviso permanente: «VPP y VPN dependen de la prevalencia de esta muestra; si el diseño es de casos y controles no son válidos: use A3». Aviso si alguna celda < 5: «IC de Wald no recomendado» (queda oculto salvo selección explícita).
6. **R.** Snippet ejecutable = el ejemplo §3.2 del plan del motor (base R + `binom` + `jsonlite`), con dos ajustes: `methods = "wilson"` por defecto (parametrizado por el selector) y el IC de Youden añadido:
```r
library(binom); library(jsonlite)
vp <- 68; fp <- 6; fn <- 12; vn <- 114; nivel <- 0.95; corr <- 0     # corr <- 0.5: Haldane-Anscombe
a <- vp + corr; b <- fp + corr; c <- fn + corr; d <- vn + corr; z <- qnorm(1 - (1 - nivel) / 2)
ic_prop <- function(x, n) { ci <- binom.confint(x, n, conf.level = nivel, methods = "wilson"); c(ci$mean, ci$lower, ci$upper) }
se <- ic_prop(vp, vp + fn); sp <- ic_prop(vn, vn + fp); vpp <- ic_prop(vp, vp + fp); vpn <- ic_prop(vn, vn + fn)
ic_lr <- function(lr, x1, n1, x2, n2) { ee <- sqrt((1 - x1/n1)/x1 + (1 - x2/n2)/x2); c(lr, exp(log(lr) - z*ee), exp(log(lr) + z*ee)) }   # Simel 1991
lr_pos <- ic_lr((a/(a + c))/(b/(b + d)), a, a + c, b, b + d); lr_neg <- ic_lr((c/(a + c))/(d/(b + d)), c, a + c, d, b + d)
youden_ee <- sqrt(se[1]*(1 - se[1])/(vp + fn) + sp[1]*(1 - sp[1])/(vn + fp))
res <- list(n = vp + fp + fn + vn, se = se, sp = sp, vpp = vpp, vpn = vpn, lr_pos = lr_pos, lr_neg = lr_neg,
            youden = c(se[1] + sp[1] - 1, se[1] + sp[1] - 1 - z*youden_ee, se[1] + sp[1] - 1 + z*youden_ee))   # + prev, exactitud, dor como en §3.2
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
# Equivalente en RStudio: epiR::epi.tests(as.table(matrix(c(vp, fp, fn, vn), 2, byrow = TRUE)), method = "wilson", conf.level = nivel)  [verificar nombre del método]
```
Oráculo secundario local (`Rscript`): `epiR::epi.tests` para Sn, Sp, VPP, VPN, LR y DOR.
7. **Referencias.** Yerushalmy J. Public Health Rep 1947;62:1432–49 (Sn/Sp). Youden WJ. Cancer 1950;3:32–35. Vecchio TJ. N Engl J Med 1966;274:1171–3 (valores predictivos y prevalencia). Simel DL, Samsa GP, Matchar DB. J Clin Epidemiol 1991;44:763–70. Glas AS et al. J Clin Epidemiol 2003;56:1129–35 (DOR). Woolf B. Ann Hum Genet 1955;19:251–3. Didácticas: Altman DG, Bland JM. BMJ 1994;308:1552 y BMJ 1994;309:102; Deeks JJ, Altman DG. BMJ 2004;329:168–9; McGee S. Evidence-Based Physical Diagnosis, Elsevier, 5.ª ed. [verificar año].
8. **Interpretación (plantillas).** «De cada 100 personas con la enfermedad, la prueba detecta {Sn %} (IC95 % {lo}–{hi}); de cada 100 sin la enfermedad, descarta correctamente {Sp %} ({lo}–{hi}).» «Un resultado positivo multiplica la razón de posibilidades preprueba por {LR+}: {texto Bloque I}.» «En esta muestra (prevalencia {P %}), {VPP %} de los positivos están realmente enfermos y {VPN %} de los negativos realmente sanos; estas dos cifras cambian con la prevalencia.» «DOR = {DOR}: la probabilidad de un positivo es {DOR} veces mayor en enfermos que en sanos.»
9. **Gráfica.** Barras horizontales de Sn, Sp, VPP, VPN, exactitud con IC (datos: estimación, lo, hi); LR± como panel logarítmico secundario con línea en 1.
10. **Métodos.** «Se calcularon sensibilidad, especificidad, valores predictivos, cocientes de verosimilitud (LR) y razón de momios diagnóstica (DOR) a partir de la tabla 2×2 frente al estándar de referencia. Los IC95 % de las proporciones se obtuvieron con el método de Wilson (Newcombe 1998); los de LR y DOR, con el método logarítmico (Simel et al. 1991; Glas et al. 2003). Cálculos realizados con Bioestadística abierta (UDG-CA-1190), verificados contra epiR (R {versión}).»

### A2 · `dx-probabilidad-postprueba` · Probabilidad postprueba (teorema de Bayes, nomograma de Fagan) / Post-test probability (Fagan nomogram) · N1

2. **Entradas.** Probabilidad preprueba $P$ (0–100 %); LR+ y LR− (o Sn y Sp, de las que se derivan); opcional IC de los LR (se propagan con $P$ fija). Ejemplo: $P$ = 30 % (febril en temporada de dengue), LR+ = 17, LR− = 0.158 (de A1).
3. **Salidas.** Odds pre, odds post, probabilidad postprueba si positivo y si negativo, ganancia absoluta en puntos porcentuales, IC de la postprueba si se dieron IC de LR.
4. **Ecuación.** $O_{pre}=\dfrac{P}{1-P},\qquad O_{post}=O_{pre}\times LR,\qquad P_{post}=\dfrac{O_{post}}{1+O_{post}}$.
5. **Casos límite.** $P=0$ o $P=1$: resultado fijo con aviso «la evidencia no cambia certezas». LR = 1: «la prueba no aporta información». LR = ∞: $P_{post}=1$. Aviso si $P<1\,\%$ o $>99\,\%$: escala del nomograma comprimida.
6. **R.** Sin función de paquete; oráculo transcrito: `post <- function(p, lr) { o <- p/(1-p)*lr; o/(1+o) }`.
7. **Referencias.** Bayes T. Philos Trans R Soc 1763;53:370–418. Fagan TJ. N Engl J Med 1975;293:257. Jaeschke R, Guyatt GH, Sackett DL. JAMA 1994;271:703–7. Didáctica: Straus SE, Glasziou P, Richardson WS, Haynes RB. Evidence-Based Medicine, 5.ª ed., Elsevier 2019.
8. **Interpretación.** «Partiendo de {P %} de probabilidad, un resultado positivo la eleva a {Ppos %} (+{Δ} puntos) y uno negativo la reduce a {Pneg %} (−{Δ} puntos). {Frase Bloque I}. Decidir si se cruza el umbral de tratamiento o de prueba adicional corresponde al clínico.»
9. **Gráfica.** Nomograma de Fagan: tres ejes verticales (preprueba en escala logit, LR en escala log, postprueba en logit) con la recta que une $P$, LR y $P_{post}$; una recta por resultado (positivo, negativo). Datos: $P$, LR+, LR−, $P_{post}$.
10. **Métodos.** «La probabilidad postprueba se calculó con el teorema de Bayes en forma de razones de posibilidades (odds preprueba × LR) y se representó con el nomograma de Fagan (1975).»

### A3 · `dx-desde-sn-sp` · Valores predictivos a partir de Sn, Sp y prevalencia / Predictive values from Sn, Sp and prevalence · N1

2. **Entradas.** Sn, Sp, prevalencia $P$; opcional $n_D$ (enfermos) y $n_{\bar D}$ (sanos) del estudio de origen para IC. Ejemplo: 0.85, 0.95, 0.30, $n_D$ = 80, $n_{\bar D}$ = 120.
3. **Salidas.** VPP, VPN (IC logit de Mercaldo 2007 si hay $n$), LR±, probabilidad postprueba, tabla de frecuencias naturales por 1000 pacientes (VP, FP, FN, VN esperados), curvas VPP/VPN frente a prevalencia.
4. **Ecuaciones.**
$$VPP=\frac{Sn\cdot P}{Sn\cdot P+(1-Sp)(1-P)},\qquad VPN=\frac{Sp(1-P)}{Sp(1-P)+(1-Sn)P}$$
$$SE[\operatorname{logit}VPP]=\sqrt{\frac{1-Sn}{Sn\,n_D}+\frac{Sp}{(1-Sp)\,n_{\bar D}}},\qquad SE[\operatorname{logit}VPN]=\sqrt{\frac{1-Sp}{Sp\,n_{\bar D}}+\frac{Sn}{(1-Sn)\,n_D}}$$
5. **Casos límite.** Sn o Sp = 1 → SE indefinida: usar el logit ajustado de Mercaldo (0.5 en las celdas) con aviso. $P=1$: VPN indefinido; $P=0$: VPP indefinido (mensaje). Aviso: «la prevalencia debe ser la de la población donde se usará la prueba, no la del estudio de validación».
6. **R.** Transcripción en R de las fórmulas; verificación cruzada: construir la tabla $a=Sn\,n_D$, etc., y comparar VPP/VPN puntuales con `epiR::epi.tests`.
7. **Referencias.** Vecchio 1966 (arriba). Mercaldo ND, Lau KF, Zhou XH. Stat Med 2007;26:2170–83. Gigerenzer G, Edwards A. BMJ 2003;327:741–4 (frecuencias naturales). Didáctica: Fletcher RH, Fletcher SW, Fletcher GS. Clinical Epidemiology: The Essentials, 5.ª ed., LWW 2014.
8. **Interpretación.** «Si la prueba se aplica a 1000 personas con prevalencia de {P %}, habrá {VP} verdaderos positivos y {FP} falsos positivos: {VPP %} de los positivos estarán enfermos. De los negativos, {VPN %} estarán sanos.»
9. **Gráfica.** Curvas de VPP y VPN en función de la prevalencia (0–100 %) con marcador en $P$.
10. **Métodos.** «Los valores predictivos se derivaron de la sensibilidad, la especificidad y la prevalencia supuesta mediante el teorema de Bayes; los IC95 % se calcularon con el método logit de Mercaldo et al. (2007).»

---

## B. Asociación y efecto en tablas 2×2

### B1 · `asoc-2x2-efecto` · Medidas de asociación y efecto (RR, OR, RRA, RRR, NNT) / 2×2 measures of association and effect · N1

2. **Entradas.** $a,b,c,d$; diseño (cohorte o ensayo: todo; casos y controles: solo OR; transversal: razón de prevalencias en lugar de RR); confianza; método de IC de la RRA (Newcombe híbrido por defecto, Wald alternativo). Ejemplo (ilustrativo): hidratación temprana vs tardía en dengue con signos de alarma, desenlace dengue grave: $a$ = 12, $b$ = 88, $c$ = 30, $d$ = 70.
3. **Salidas.** $p_1=a/n_1$, $p_0=c/n_0$ (Wilson); RR (Katz 1978); OR (Woolf 1955); RRA (Newcombe 1998 método 10 / Wald); RRR $=1-RR$ con IC $[1-RR_{hi},\,1-RR_{lo}]$; NNT o NND $=1/|RRA|$ con IC invertido (Altman 1998).
4. **Ecuaciones.**
$$RR=\frac{p_1}{p_0},\ IC=\exp\!\left[\ln RR\pm z\sqrt{\tfrac1a-\tfrac1{n_1}+\tfrac1c-\tfrac1{n_0}}\right];\qquad OR=\frac{ad}{bc},\ IC=\exp\!\left[\ln OR\pm z\sqrt{\tfrac1a+\tfrac1b+\tfrac1c+\tfrac1d}\right]$$
$$RRA=p_1-p_0;\quad IC_{Newcombe}:\ \left[RRA-\sqrt{(p_1-l_1)^2+(u_0-p_0)^2},\ RRA+\sqrt{(u_1-p_1)^2+(p_0-l_0)^2}\right],\ (l_i,u_i)=\text{límites de Wilson}$$
$$IC_{Wald}(RRA)=RRA\pm z\sqrt{\tfrac{p_1(1-p_1)}{n_1}+\tfrac{p_0(1-p_0)}{n_0}};\qquad NNT=\frac{1}{|RRA|},\ IC(NNT)=\left[\frac{1}{|RRA|_{hi}},\frac{1}{|RRA|_{lo}}\right]$$
5. **Casos límite.** Celda 0 → Haldane-Anscombe para RR y OR (no para RRA). IC de RRA que incluye 0 → NNT se reporta «NNTB {x} a ∞ a NNTH {y}» (notación de Altman 1998). Aviso si $p_0=0$ (RR indefinido). Diseño casos-controles: ocultar RR, RRA, NNT con explicación. Aviso «OR ≈ RR solo si el desenlace es infrecuente (< 10 %)» cuando $p_0>0.10$.
6. **R.** Snippet ejecutable en base R + `PropCIs` (log-Wald escrito a mano; `epiR` solo comentado):
```r
library(PropCIs); library(jsonlite)
a <- 12; b <- 88; c <- 30; d <- 70; nivel <- 0.95; corr <- 0; z <- qnorm(1 - (1 - nivel)/2)
a <- a + corr; b <- b + corr; c <- c + corr; d <- d + corr; n1 <- a + b; n0 <- c + d; p1 <- a/n1; p0 <- c/n0
rr <- p1/p0; rr_ee <- sqrt(1/a - 1/n1 + 1/c - 1/n0)                     # Katz 1978
or <- (a*d)/(b*c); or_ee <- sqrt(1/a + 1/b + 1/c + 1/d)                 # Woolf 1955
rra <- p1 - p0; rra_ic <- diffscoreci(a, n1, c, n0, conf.level = nivel)$conf.int   # Newcombe 1998, método 10
nnt <- 1/abs(rra); nnt_ic <- sort(1/abs(rra_ic))                        # Altman 1998; si rra_ic cruza 0, la UI muestra NNTB–∞–NNTH
res <- list(p1 = p1, p0 = p0, rr = c(rr, exp(log(rr) - z*rr_ee), exp(log(rr) + z*rr_ee)),
            or = c(or, exp(log(or) - z*or_ee), exp(log(or) + z*or_ee)), rra = c(rra, rra_ic[1], rra_ic[2]),
            rrr = c(1 - rr, 1 - exp(log(rr) + z*rr_ee), 1 - exp(log(rr) - z*rr_ee)), nnt = c(nnt, nnt_ic[1], nnt_ic[2]))
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
# Opcional: fisher.test(matrix(c(a, b, c, d), 2, byrow = TRUE))$conf.int   # OR condicional (IC central, uniroot tol ≈ 1.2e-4)
# Equivalente en RStudio: epiR::epi.2by2(as.table(matrix(c(12, 88, 30, 70), 2, byrow = TRUE)), method = "cohort.count", conf.level = 0.95)
```
Oráculo secundario local: `epiR::epi.2by2` (`$massoc.detail$RR.strata.wald`, `OR.strata.wald`, `ARisk.strata.wald`, `NNT.strata.wald` [verificar nombres]).
7. **Referencias.** Cornfield J. J Natl Cancer Inst 1951;11:1269–75 (OR). Woolf 1955. Katz D, Baptista J, Azen SP, Pike MC. Biometrics 1978;34:469–74. Newcombe RG. Stat Med 1998;17:873–90. Laupacis A, Sackett DL, Roberts RS. N Engl J Med 1988;318:1728–33 (NNT). Cook RJ, Sackett DL. BMJ 1995;310:452–4. Altman DG. BMJ 1998;317:1309–12. Haldane JBS. Ann Hum Genet 1956;20:309–11; Anscombe FJ. Biometrika 1956;43:461–4. Didáctica: Altman DG. Practical Statistics for Medical Research, Chapman & Hall 1991, cap. 10; Altman DG, Machin D, Bryant TN, Gardner MJ. Statistics with Confidence, 2.ª ed., BMJ Books 2000.
8. **Interpretación.** «El riesgo fue {p1 %} en expuestos y {p0 %} en no expuestos: RR = {RR} (IC95 % {lo}–{hi}), es decir, {RRR %} {menos / más} riesgo relativo y {|RRA| puntos} de diferencia absoluta. Hay que {tratar / exponer} a {NNT} personas para {evitar / producir} un evento adicional (IC95 % {lo}–{hi}).» Si el IC del RR incluye 1: «los datos son compatibles tanto con reducción como con aumento del riesgo».
9. **Gráfica.** Dos barras de riesgo ($p_1$, $p_0$) con IC de Wilson y anotación de RRA y NNT; panel secundario tipo forest (RR y OR en escala log con línea en 1).
10. **Métodos.** «Se estimaron el riesgo relativo (IC95 % por el método de Katz), la razón de momios (método de Woolf), la reducción absoluta del riesgo (IC95 % híbrido de Newcombe, método 10) y el número necesario a tratar (recíproco de la RRA y de sus límites, Altman 1998).»

### B2 · `asoc-chi2-fisher` · Pruebas de independencia en 2×2 (χ², Yates, Fisher, φ) / 2×2 tests of independence · N1

2. **Entradas.** $a,b,c,d$; opción de mostrar p unilateral. Ejemplo: la tabla de B1; ejemplo secundario «n pequeño»: 3 / 7 / 9 / 1.
3. **Salidas.** Frecuencias esperadas $E_{ij}=n_i m_j/n$; χ² de Pearson (gl = 1) con p; χ² con corrección de Yates; χ² de «N−1» (Campbell 2007) como opción; Fisher exacto bilateral (suma de probabilidades ≤ observada, como `fisher.test`), unilateral opcional; φ con signo; recomendación automática de prueba.
4. **Ecuaciones.**
$$\chi^2=\frac{n(ad-bc)^2}{n_1n_0m_1m_0},\qquad \chi^2_{Yates}=\frac{n\left(|ad-bc|-\tfrac n2\right)^2}{n_1n_0m_1m_0},\qquad \phi=\frac{ad-bc}{\sqrt{n_1n_0m_1m_0}}$$
$$P(a)=\frac{\binom{m_1}{a}\binom{m_0}{n_1-a}}{\binom{n}{n_1}},\qquad p_{Fisher}=\sum_{a':\,P(a')\le P(a)}P(a')$$
5. **Casos límite y reglas.** Yates: implementar como R (corrección $\min(0.5,|O-E|)$; si $|ad-bc|<n/2$ el estadístico es 0), mostrando la fórmula clásica con nota. Regla de Cochran (1954): si algún $E_{ij}<5$ → «se recomienda Fisher»; si $n<20$ → Fisher siempre; si todos $E\ge5$ → Pearson sin corrección (Campbell 2007 y Grizzle 1967 muestran que Yates es conservadora). Empates en Fisher: tolerancia relativa $1+10^{-7}$ como en `fisher.test`. Margen 0 → χ² indefinido, Fisher p = 1, φ = NaN con mensaje. IC del OR condicional (MLE de Fisher) queda para fase 2.
6. **R.**
```r
library(jsonlite)
m <- matrix(c(12, 88, 30, 70), nrow = 2, byrow = TRUE); n <- sum(m)
esperados <- outer(rowSums(m), colSums(m))/n
chi <- chisq.test(m, correct = FALSE); yates <- chisq.test(m, correct = TRUE)   # Yates acotada a min(0.5, |O − E|), como R
fisher <- fisher.test(m)                                                          # p bilateral «minlike»
phi <- (m[1,1]*m[2,2] - m[1,2]*m[2,1]) / sqrt(prod(rowSums(m)) * prod(colSums(m)))
res <- list(esperados = as.vector(esperados), chi2 = unname(chi$statistic), p_chi2 = chi$p.value,
            chi2_yates = unname(yates$statistic), p_yates = yates$p.value, p_fisher = fisher$p.value, phi = phi,
            chi2_n1 = unname(chi$statistic) * (n - 1)/n)                          # Campbell 2007 (opcional)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
# Opcional: exact2x2::exact2x2(m, tsmethod = "minlike")   # mismo p que fisher.test; "central" = 2 × p unilateral mínima
# Equivalente en RStudio: DescTools::Phi(m)  [verificar]
```
7. **Referencias.** Pearson K. Philos Mag 1900;50:157–75. Yates F. J R Stat Soc Suppl 1934;1:217–35. Fisher RA. Statistical Methods for Research Workers, 5.ª ed., Oliver & Boyd 1934 [verificar edición]; Fisher RA. J R Stat Soc 1935;98:39–82. Cochran WG. Biometrics 1954;10:417–51. Campbell I. Stat Med 2007;26:3661–75. Pearson K. Drapers' Company Research Memoirs, Biometric Series I, 1904 (φ) [verificar]; Yule GU. J R Stat Soc 1912;75:579–652. Didáctica: Altman 1991, cap. 10.
8. **Interpretación.** «La proporción con el desenlace fue {p1 %} frente a {p0 %}. Prueba {recomendada}: p = {p}. {Frase de significación del Bloque I}. φ = {φ}: asociación {pequeña/mediana/grande} según la convención de Cohen.» Si $E<5$: «Con frecuencias esperadas menores de 5, la aproximación χ² es dudosa; se reporta la prueba exacta de Fisher».
9. **Gráfica.** Barras apiladas o agrupadas de observados frente a esperados por celda.
10. **Métodos.** «La asociación se evaluó con la prueba χ² de Pearson (con corrección de Yates cuando se indica) o con la prueba exacta de Fisher bilateral cuando alguna frecuencia esperada fue menor de 5 (Cochran 1954). La fuerza de la asociación se resumió con el coeficiente φ.»

### B3 · `asoc-mcnemar` · Proporciones pareadas: prueba de McNemar / McNemar test for paired proportions · N1

2. **Entradas.** Tabla 2×2 pareada: concordantes $a$ (+,+) y $d$ (−,−), discordantes $b$ (+,−) y $c$ (−,+). Ejemplo (ilustrativo): dos pruebas rápidas aplicadas a los mismos 150 pacientes: $a$ = 40, $b$ = 15, $c$ = 5, $d$ = 90.
3. **Salidas.** χ² de McNemar sin corrección; con corrección de Edwards (1948); p exacto binomial (por defecto si $b+c<25$); mid-p opcional; diferencia pareada $\hat\delta=(b-c)/n$ con IC de Wald (por defecto) o de Agresti-Min 2005 (0.5 sumado a cada celda) como alternativa; OR pareado $b/c$ con IC exacto derivado del IC de Clopper-Pearson de $b/(b+c)$.
4. **Ecuaciones.**
$$\chi^2=\frac{(b-c)^2}{b+c},\qquad \chi^2_{c}=\frac{(|b-c|-1)^2}{b+c},\qquad p_{exacta}=\min\!\left(1,\ 2\sum_{k=0}^{\min(b,c)}\binom{b+c}{k}\tfrac{1}{2^{\,b+c}}\right)$$
$$\hat\delta=\frac{b-c}{n},\qquad SE_{Wald}=\frac{\sqrt{(b+c)-(b-c)^2/n}}{n}$$
5. **Casos límite.** $b+c=0$: sin discordancias, prueba indefinida (mensaje). $b=c$: p = 1. $b+c<25$: mostrar exacto como principal y χ² como secundario; $b+c\ge25$: χ² con corrección como principal. Aviso «la prueba usa solo los pares discordantes ({b+c})».
6. **R.**
```r
x <- matrix(c(40, 15, 5, 90), nrow = 2, byrow = TRUE)
mcnemar.test(x, correct = TRUE); mcnemar.test(x, correct = FALSE)
binom.test(15, 15 + 5, p = 0.5)$p.value            # exacto
exact2x2::exact2x2(x, paired = TRUE)               # [verificar] equivale a exact2x2::mcnemar.exact
PropCIs::diffpropci.Wald.mp(15, 5, 150, 0.95); PropCIs::diffpropci.mp(15, 5, 150, 0.95)   # Wald / Agresti-Min
```
7. **Referencias.** McNemar Q. Psychometrika 1947;12:153–7. Edwards AL. Psychometrika 1948;13:185–7. Agresti A, Min Y. Stat Med 2005;24:729–40. Newcombe RG. Stat Med 1998;17:2635–50 (IC pareados, fase 2). Didáctica: Altman 1991, §10.7; Fleiss JL, Levin B, Paik MC. Statistical Methods for Rates and Proportions, 3.ª ed., Wiley 2003, cap. 13.
8. **Interpretación.** «Entre los {n} pares, {b} cambiaron en una dirección y {c} en la otra: la prueba A fue positiva en {p1 %} y la B en {p2 %} (diferencia {δ} puntos, IC95 % {lo}–{hi}). Prueba de McNemar {exacta / con corrección}: p = {p}.»
9. **Gráfica.** Dos barras con los pares discordantes $b$ y $c$ (y línea del valor esperado bajo H0, $(b+c)/2$).
10. **Métodos.** «Las proporciones pareadas se compararon con la prueba de McNemar (versión exacta binomial cuando hubo menos de 25 pares discordantes; en caso contrario, χ² con corrección de continuidad de Edwards). La diferencia de proporciones pareadas se acompañó de su IC95 %.»

---

## C. Tamaño de muestra y poder

### C0 · Bloque común de tamaño de muestra (aplica a C1–C7)

- Parámetros comunes: α (0.05; uni o bilateral, bilateral por defecto), poder $1-\beta$ (0.80; opciones 0.90, 0.95), razón de asignación $r=n_2/n_1$ (1), pérdidas previstas $L$ (0–50 %). Ajuste: $n_{aj}=\lceil n/(1-L)\rceil$ (Lwanga & Lemeshow 1991). Se muestran los valores de $z_{1-\alpha/2}$ y $z_{1-\beta}$ usados.
- **Modo inverso (poder dado $n$)** en cada calculadora, con la fórmula normal: $1-\beta=\Phi\!\left(\dfrac{|\Delta|}{SE(n)}-z_{1-\alpha/2}\right)$ con el $SE(n)$ propio del diseño (para dos proporciones se usa la forma de Fleiss con varianza agrupada bajo H0, idéntica a `power.prop.test`).
- Redondeo: techo por grupo, una sola vez al final; si $r\neq1$, $n_2=\lceil r\,n_1\rceil$.
- Gráfica común: curva de poder frente a $n$ (de $n/4$ a $2n$) con el punto elegido; en modo estimación, curva de amplitud del IC frente a $n$.
- Avisos comunes: «las cifras dependen de los supuestos (proporciones, DE, correlación) tomados de estudios previos o pilotos; documente su origen».
- Referencias comunes: Neyman J, Pearson ES. Philos Trans R Soc A 1933;231:289–337. Cohen J. Statistical Power Analysis for the Behavioral Sciences, 2.ª ed., Erlbaum 1988. Lwanga SK, Lemeshow S. Sample Size Determination in Health Studies, OMS 1991. Hulley SB et al. Designing Clinical Research, 4.ª ed., LWW 2013 (didáctica). Chow SC et al. Sample Size Calculations in Clinical Research, 3.ª ed., CRC 2018.
- Plantilla de Métodos común: «El tamaño de muestra se calculó para {objetivo} suponiendo {supuestos}, con α = {α} ({uni/bi}lateral) y poder de {1−β}, mediante {fórmula y referencia}; se añadió {L %} por pérdidas previstas. Cálculo realizado con Bioestadística abierta y verificado con {función R}.»

### C1 · `n-una-proporcion` · Estimar una proporción (con corrección por población finita) / Sample size for one proportion · N1

2. **Entradas.** $p$ esperada (0.5 si se desconoce), precisión absoluta $d$ (semiamplitud) o relativa $\varepsilon$ ($d=\varepsilon p$), confianza, $N$ (población finita, opcional). Ejemplo: $p$ = 0.30 (prevalencia de dengue entre febriles, ilustrativa), $d$ = 0.05, 95 %, $N$ = 2000 opcional.
3. **Salidas.** $n_0$, $n$ con CPF, $n_{aj}$; modo inverso: precisión alcanzable con $n$ dado.
4. **Ecuaciones.** $n_0=\dfrac{z_{1-\alpha/2}^2\,p(1-p)}{d^2},\qquad n=\dfrac{n_0}{1+(n_0-1)/N}$ (Cochran 1977). La CPF se aplica a $n_0$ sin redondear.
5. **Reglas.** Comprobación manual: con los valores del ejemplo sin CPF, $n_0=322.7\to323$. Aviso si $p\pm d$ sale de [0, 1] o si $n_0p<5$: «con proporciones extremas la fórmula de Wald subestima; considere la precisión basada en Wilson (presize)». Aviso si $N<10n_0$: la CPF cambia mucho el resultado.
6. **R.** Snippet en base R (la fórmula escrita): `z <- qnorm(1 - (1 - nivel)/2); n0 <- z^2 * p * (1 - p) / d^2; n <- if (is.na(N)) n0 else n0 / (1 + (n0 - 1)/N); res <- list(n0 = n0, n = n, n_ajustado = n / (1 - perdidas))` (la UI aplica el techo). Equivalente en RStudio (comentado, oráculo local): `presize::prec_prop(p = 0.30, conf.width = 0.10, conf.level = 0.95, method = "wald")` [verificar argumentos]; `epiR::epi.sssimpleestb(N = 2000, Py = 0.30, epsilon = 0.05, error = "absolute", conf.level = 0.95)` [verificar].
7. **Referencias.** Cochran WG. Sampling Techniques, 3.ª ed., Wiley 1977. Lwanga & Lemeshow 1991. Newcombe 1998 (para la alternativa Wilson).
8. **Interpretación.** «Con {n} participantes, una proporción observada cercana a {p %} tendría un IC95 % de aproximadamente ±{d} puntos.»
9. **Gráfica.** Semiamplitud del IC frente a $n$ (curva) con el punto elegido.
10. **Métodos.** Plantilla C0 con «estimar una proporción de {p} con precisión absoluta de ±{d} (fórmula normal de Cochran 1977{, corregida para una población de N})».

### C2 · `n-una-media` · Estimar una media / Sample size for one mean · N1

2. **Entradas.** DE esperada $\sigma$, precisión $d$, confianza, $N$ opcional; opción «usar t» (iterativa). Ejemplo: $\sigma$ = 60 (plaquetas ×10³/µL), $d$ = 10.
3. **Salidas.** $n$ (normal), $n_t$ (iterando con $t_{n-1}$), CPF, $n_{aj}$; inverso: $d$ alcanzable.
4. **Ecuación.** $n=\left(\dfrac{z_{1-\alpha/2}\,\sigma}{d}\right)^2$; variante $n=\left(\dfrac{t_{n-1,1-\alpha/2}\,\sigma}{d}\right)^2$ resuelta por iteración.
5. **Reglas.** Aviso si $n<30$: «use la variante t». Aviso sobre asimetría: «si la variable es muy asimétrica considere transformar o estimar la mediana».
6. **R.** Snippet en base R: `n_z <- (qnorm(1 - (1 - nivel)/2) * sigma / d)^2`; variante t por punto fijo: `n_t <- n_z; for (i in 1:50) n_t <- (qt(1 - (1 - nivel)/2, ceiling(n_t) - 1) * sigma / d)^2` (TS itera igual, con el mismo techo dentro del bucle para que coincida). Equivalente en RStudio (comentado): `presize::prec_mean(mean = 95, sd = 60, conf.width = 20, conf.level = 0.95)` [verificar]; `epiR::epi.sssimpleestc(N = NA, xbar = 95, sigma = 60, epsilon = 10, error = "absolute")` [verificar].
7. **Referencias.** Cochran 1977; Student. Biometrika 1908;6:1–25 (distribución t).
8. **Interpretación.** «Con {n} sujetos, la media se estimará con un IC95 % de aproximadamente ±{d} unidades si la DE real es {σ}.»
9/10. Como C1.

### C3 · `n-dos-proporciones` · Comparar dos proporciones independientes (Fleiss) / Two independent proportions · N1

2. **Entradas.** $p_1$, $p_2$, α, lateralidad, poder, $r$, corrección de continuidad (sí/no; por defecto sí), pérdidas. Ejemplo: curación 0.70 vs 0.85, α = 0.05 bilateral, poder 0.80, $r$ = 1.
3. **Salidas.** $n_1$, $n_2$ sin y con corrección (Fleiss, Tytun & Ury 1980), total, $n_{aj}$; alternativa Cohen (h, arcoseno) en un desplegable; inverso: poder dado $n_1,n_2$.
4. **Ecuaciones.**
$$n_1=\frac{\left[z_{1-\alpha/2}\sqrt{(r+1)\bar p\bar q}+z_{1-\beta}\sqrt{r\,p_1q_1+p_2q_2}\right]^2}{r\,(p_1-p_2)^2},\qquad \bar p=\frac{p_1+r\,p_2}{r+1},\ \bar q=1-\bar p,\ n_2=r\,n_1$$
$$n_1'=\frac{n_1}{4}\left[1+\sqrt{1+\frac{2(r+1)}{r\,n_1\,|p_1-p_2|}}\right]^2\ \text{(corrección de continuidad)};\qquad 1-\beta=\Phi\!\left(\frac{|p_1-p_2|\sqrt{n}-z_{1-\alpha/2}\sqrt{2\bar p\bar q}}{\sqrt{p_1q_1+p_2q_2}}\right)\ (r=1)$$
5. **Reglas.** Aviso si $|p_1-p_2|<0.01$ ($n$ enorme). Aviso si algún $n_ip_i<5$: «la aproximación normal es dudosa; considere un método exacto». Explicar que la versión con corrección aproxima la prueba de Fisher y la sin corrección la χ² de Pearson.
6. **R.** `power.prop.test(p1 = 0.70, p2 = 0.85, sig.level = 0.05, power = 0.80, tol = 1e-10)$n` (Fleiss sin corrección, verificado en el código fuente de R 4.5.2: varianza agrupada $(p_1+p_2)(1-\bar p)$ bajo H0; con `tol = 1e-10` el `n` sin redondear coincide con TS a 1e-8). Corrección de continuidad y $r\neq1$: la fórmula de Fleiss, Levin & Paik 2003 (§4.2) escrita en el propio snippet (`n_cc <- n/4 * (1 + sqrt(1 + 2*(r + 1)/(r*n*abs(p1 - p2))))^2`). Alternativa en el snippet: `pwr::pwr.2p.test(h = pwr::ES.h(0.70, 0.85), power = 0.80)` (Cohen h). Comentado como equivalente en RStudio: `epiR::epi.sscompb(treat = 0.85, control = 0.70, power = 0.80, r = 1)` [verificar si aplica corrección].
7. **Referencias.** Fleiss JL. Statistical Methods for Rates and Proportions, 2.ª ed., Wiley 1981; Fleiss, Levin & Paik 2003. Casagrande JT, Pike MC, Smith PG. Biometrics 1978;34:483–6. Fleiss JL, Tytun A, Ury HK. Biometrics 1980;36:343–6. Cohen 1988 (h). Lachin JM. Control Clin Trials 1981;2:93–113.
8. **Interpretación.** «Para detectar una diferencia de {p1 %} frente a {p2 %} con poder de {1−β} y α = {α}, se requieren {n1} y {n2} participantes por grupo ({total} en total; {n_aj} con {L %} de pérdidas).»
9/10. Gráfica y Métodos de C0 («comparar dos proporciones independientes con la fórmula de Fleiss (1981) con corrección de continuidad de Fleiss, Tytun y Ury (1980)»).

### C4 · `n-dos-medias` · Comparar dos medias independientes / Two independent means · N1

2. **Entradas.** Diferencia $\delta$, DE común $\sigma$ (o $d$ de Cohen $=\delta/\sigma$), α, lateralidad, poder, $r$, pérdidas. Ejemplo: $\delta$ = 1 día de estancia, $\sigma$ = 3 días.
3. **Salidas.** $n_1,n_2$ por el método exacto de la t no central (idéntico a `power.t.test`, ya que el motor implementa `pnt`, AS 243 de Lenth 1989), total, $n_{aj}$; como fila secundaria didáctica, la aproximación normal con corrección de Guenther 1981; inverso: poder exacto (t no central) y aproximado (normal).
4. **Ecuaciones.** Exacta: $n$ es la menor solución de $1-\beta = P\!\left(T'_{\nu,\lambda} > t_{\nu,1-\alpha/2}\right)$, con $\nu=n_1+n_2-2$ y parámetro de no centralidad $\lambda=\dfrac{\delta}{\sigma\sqrt{1/n_1+1/n_2}}$ (para $r=1$, $\lambda=\delta\sqrt{n/2}/\sigma$). Aproximación clásica mostrada: $n_1=\dfrac{(1+1/r)\,(z_{1-\alpha/2}+z_{1-\beta})^2\sigma^2}{\delta^2}+\dfrac{z_{1-\alpha/2}^2}{4}$ (el último término es la corrección de Guenther); $1-\beta\approx\Phi\!\left(\dfrac{|\delta|}{\sigma\sqrt{1/n_1+1/n_2}}-z_{1-\alpha/2}\right)$.
5. **Reglas.** TS resuelve $n$ con Brent sobre `pnt` a `tol = 1e-10`, como el snippet; la aproximación normal difiere en ≤ 1–2 por grupo y se etiqueta «aproximación». Aviso si $n<10$ por grupo. Para $r\neq1$ se fija $n_2 = r\,n_1$ y se resuelve en $n_1$ con $\nu=n_1(1+r)-2$.
6. **R.** `power.t.test(delta = 1, sd = 3, sig.level = 0.05, power = 0.80, type = "two.sample", tol = 1e-10)$n`; `pwr::pwr.t.test(d = 1/3, power = 0.80)`; `pwr::pwr.t2n.test(n1 = …, n2 = …, d = 1/3)` para el poder con $r\neq1$.
7. **Referencias.** Student 1908. Guenther WC. Am Stat 1981;35:243–4. Cohen 1988. Altman 1991, §15.
8. **Interpretación.** «Para detectar una diferencia de {δ} unidades (d de Cohen = {d}) se requieren {n1} y {n2} participantes por grupo.»
9/10. Como C0.

### C5 · `n-medias-pareadas` · Comparar medias pareadas (antes/después) / Paired means · N1

2. **Entradas.** $\delta$ media de las diferencias; DE de las diferencias $\sigma_d$ o bien $\sigma$ y correlación $\rho$ ($\sigma_d=\sigma\sqrt{2(1-\rho)}$); α, poder, pérdidas. Ejemplo: $\delta$ = 0.5, $\sigma_d$ = 1.5.
3/4. Exacta (por defecto, igual que `power.t.test(type = "paired")`): $n$ mínimo con $1-\beta = P(T'_{n-1,\lambda} > t_{n-1,1-\alpha/2})$, $\lambda=\delta\sqrt n/\sigma_d$. Aproximación clásica mostrada: $n=\dfrac{(z_{1-\alpha/2}+z_{1-\beta})^2\sigma_d^2}{\delta^2}+\dfrac{z_{1-\alpha/2}^2}{2}$ (Guenther para una muestra); poder inverso como C4 con $SE=\sigma_d/\sqrt n$.
5. **Reglas.** Aviso si se introduce $\rho$: «si no conoce ρ, 0.5 es un supuesto habitual pero debe justificarse». $\rho\to1$ hace $\sigma_d\to0$: bloquear $\rho\ge0.99$.
6. **R.** `power.t.test(delta = 0.5, sd = 1.5, power = 0.80, type = "paired", tol = 1e-10)$n`; `pwr::pwr.t.test(d = 0.5/1.5, power = 0.80, type = "paired")`.
7. Student 1908; Guenther 1981; Cohen 1988. 8–10 como C4 adaptando «pares».

### C6 · `n-prueba-diagnostica` · Sensibilidad y especificidad (Buderer 1996) / Sample size for sensitivity and specificity · N1

2. **Entradas.** Sn y Sp esperadas, prevalencia $P$, semiamplitud $w$ del IC, confianza, pérdidas. Ejemplo: 0.85, 0.95, 0.30, $w$ = 0.05.
3. **Salidas.** Enfermos necesarios $n_D$ y total $N_{Sn}=n_D/P$; sanos necesarios $n_{\bar D}$ y total $N_{Sp}=n_{\bar D}/(1-P)$; $N=\max$; alternativa basada en Wilson (fase 2, presize).
4. **Ecuaciones.** $n_D=\dfrac{z_{1-\alpha/2}^2\,Sn(1-Sn)}{w^2},\quad N_{Sn}=\dfrac{n_D}{P};\qquad n_{\bar D}=\dfrac{z_{1-\alpha/2}^2\,Sp(1-Sp)}{w^2},\quad N_{Sp}=\dfrac{n_{\bar D}}{1-P}$. Un solo techo al final.
5. **Reglas.** Aviso si Sn o Sp ≥ 0.95: «Wald subestima; prefiera Wilson o Clopper-Pearson (opción)». Aviso si $P<0.05$: $N$ grande, considerar diseño con muestreo por estado de enfermedad. Sn, Sp ≠ 0, 1.
6. **R.** Snippet en base R: `z <- qnorm(1 - (1 - nivel)/2); n_d <- z^2 * sn * (1 - sn) / w^2; n_nd <- z^2 * sp * (1 - sp) / w^2; res <- list(n_d = n_d, N_sn = n_d / prev, n_nd = n_nd, N_sp = n_nd / (1 - prev))`. Equivalente en RStudio (comentado, oráculo local): `presize::prec_sens(sens = 0.85, prev = 0.30, conf.width = 0.10, method = "wald")`; `presize::prec_spec(spec = 0.95, prev = 0.30, conf.width = 0.10, method = "wald")` [verificar nombres de argumentos].
7. **Referencias.** Buderer NM. Acad Emerg Med 1996;3:895–900. Simel et al. 1991 (alternativa por LR). Didáctica: Bujang MA, Adnan TH. J Clin Diagn Res 2016;10:YE01–6 [verificar].
8. **Interpretación.** «Para estimar Sn ≈ {Sn} con IC95 % de ±{w} se necesitan {nD} enfermos, es decir, {N_Sn} pacientes consecutivos con prevalencia de {P %}; para Sp, {N_Sp}. Se recomienda reclutar {N}.»
9. **Gráfica.** $N$ total frente a la prevalencia (curvas para Sn y Sp) con marcador.
10. **Métodos.** C0 con «estimar la sensibilidad y la especificidad con precisión ±{w} según Buderer (1996), incorporando una prevalencia esperada de {P}».

### C7 · `n-correlacion` · Detectar una correlación / Sample size for a correlation coefficient · N1

2. **Entradas.** $r$ esperado, α, lateralidad, poder, pérdidas. Ejemplo: $r$ = 0.30.
3/4. $n=\left(\dfrac{z_{1-\alpha/2}+z_{1-\beta}}{C}\right)^2+3,\qquad C=\tfrac12\ln\dfrac{1+r}{1-r}$ (transformación z de Fisher). Inverso: $1-\beta=\Phi\!\left(|C|\sqrt{n-3}-z_{1-\alpha/2}\right)$.
5. **Reglas.** $|r|<0.05$ → aviso de $n$ muy grande; $|r|\ge0.99$ bloqueado. El snippet imprime dos campos: `n_clasico` (la fórmula mostrada, coincidencia exacta con TS) y `n_pwr` (`pwr.r.test`, que añade la corrección de sesgo $r/(2(n-1))$ y usa el cuantil t; puede diferir en 1–2 sujetos y se muestra como «comparación»).
6. **R.** `library(pwr); C <- atanh(r); n_clasico <- ((qnorm(1 - alfa/2) + qnorm(poder)) / C)^2 + 3; n_pwr <- pwr.r.test(r = 0.30, sig.level = 0.05, power = 0.80)$n`. Equivalente en RStudio (comentado): `presize::prec_cor(r = 0.30, conf.width = …)` para precisión [verificar].
7. **Referencias.** Fisher RA. Biometrika 1915;10:507–21; Fisher RA. Metron 1921;1:3–32 (transformación z). Cohen 1988. Hulley et al. 2013 (tabla 6C).
8. «Para detectar una correlación de al menos {r} con poder {1−β} se requieren {n} pares de observaciones.» 9/10 como C0.

---

## D. Concordancia y descriptivos

### D1 · `kappa-cohen` · Kappa de Cohen (simple y ponderada) / Cohen's kappa (unweighted and weighted) · N1

2. **Entradas.** Tabla $k\times k$ ($2\le k\le10$) o dos columnas pegadas (mismas categorías; orden ordinal editable); ponderación: ninguna, lineal, cuadrática; confianza. Ejemplo (ilustrativo): dos clínicos clasifican 100 casos de dengue en «sin signos de alarma / con signos de alarma / grave»: filas evaluador A, columnas B: [40, 8, 2; 6, 25, 4; 1, 3, 11].
3. **Salidas.** $p_o$, $p_e$, κ (o κ_w), SE (Fleiss, Cohen & Everitt 1969) e IC de Wald, z y p frente a κ = 0 (SE bajo H0), acuerdo máximo posible $\kappa_{max}$ opcional, PABAK e índices de prevalencia y sesgo (Byrt 1993) para $k=2$.
4. **Ecuaciones.** Con pesos de acuerdo $w_{ij}$ ($w_{ii}=1$; lineal $w_{ij}=1-\frac{|i-j|}{k-1}$; cuadrática $w_{ij}=1-\left(\frac{i-j}{k-1}\right)^2$; simple: $w_{ij}=1$ si $i=j$, 0 si no):
$$p_o=\sum_{ij}w_{ij}p_{ij},\qquad p_e=\sum_{ij}w_{ij}\,p_{i\cdot}p_{\cdot j},\qquad \hat\kappa_w=\frac{p_o-p_e}{1-p_e}$$
$$SE(\hat\kappa_w)=\frac{1}{(1-p_e)\sqrt n}\sqrt{\sum_{ij}p_{ij}\left[w_{ij}-(\bar w_{i\cdot}+\bar w_{\cdot j})(1-\hat\kappa_w)\right]^2-\left[\hat\kappa_w-p_e(1-\hat\kappa_w)\right]^2},\quad \bar w_{i\cdot}=\sum_j p_{\cdot j}w_{ij},\ \bar w_{\cdot j}=\sum_i p_{i\cdot}w_{ij}$$
Comprobación ejecutada en R 4.5.2 con la fórmula anterior escrita en base R y cruzada con `vcd::Kappa` (coincidencia a 6 decimales) para la tabla del ejemplo: sin ponderar κ = 0.6088 (EE 0.0690); lineal κ = 0.6489 (EE 0.0663); cuadrática κ = 0.6944 (EE 0.0715). `vcd` está instalado localmente y sirve como oráculo secundario adicional.
5. **Reglas.** Categorías con fila y columna vacías se eliminan con aviso. Acuerdo perfecto: κ = 1, SE = 0. IC truncado a [−1, 1]. Aviso de «paradoja de kappa» si $p_o\ge0.80$ y κ < 0.40 (mostrar PABAK). Ponderación solo si las categorías son ordinales (aviso). $n<30$: aviso de SE asintótico.
6. **R.**
```r
library(irr); library(jsonlite)
x <- matrix(c(40, 8, 2, 6, 25, 4, 1, 3, 11), nrow = 3, byrow = TRUE); nivel <- 0.95; k <- nrow(x); n <- sum(x)
tipo <- "unweighted"                                    # "equal" (lineal) | "squared" (cuadrática)
w <- switch(tipo, unweighted = diag(k), equal = 1 - abs(outer(1:k, 1:k, "-"))/(k - 1), squared = 1 - (outer(1:k, 1:k, "-")/(k - 1))^2)
p <- x/n; pi <- rowSums(p); pj <- colSums(p); po <- sum(w*p); pe <- sum(w*outer(pi, pj)); kappa <- (po - pe)/(1 - pe)
wi <- as.vector(w %*% pj); wj <- as.vector(t(w) %*% pi)                                   # medias ponderadas de fila y columna
ee <- sqrt(sum(p*(w - outer(wi, wj, "+")*(1 - kappa))^2) - (kappa - pe*(1 - kappa))^2)/((1 - pe)*sqrt(n))   # Fleiss, Cohen & Everitt 1969
z <- qnorm(1 - (1 - nivel)/2)
ratings <- cbind(rep(1:k, rowSums(x)), unlist(lapply(1:k, function(i) rep(1:k, x[i, ]))))   # tabla → pares para irr
k2 <- kappa2(ratings, weight = tipo)                                                        # kappa y z frente a κ = 0
res <- list(po = po, pe = pe, kappa = c(kappa, kappa - z*ee, kappa + z*ee), ee = ee, z_h0 = unname(k2$statistic), p_h0 = k2$p.value)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
# Equivalente en RStudio: DescTools::CohenKappa(x, weights = "Unweighted", conf.level = 0.95)   # "Equal-Spacing", "Fleiss-Cohen" [verificar]
```
7. **Referencias.** Cohen J. Educ Psychol Meas 1960;20:37–46. Cohen J. Psychol Bull 1968;70:213–20 (ponderada). Fleiss JL, Cohen J, Everitt BS. Psychol Bull 1969;72:323–7. Landis JR, Koch GG. Biometrics 1977;33:159–74. Byrt T, Bishop J, Carlin JB. J Clin Epidemiol 1993;46:423–9. Fleiss JL, Cohen J. Educ Psychol Meas 1973;33:613–9 (κ cuadrática ≈ ICC). Didáctica: Sim J, Wright CC. Phys Ther 2005;85:257–68; Altman 1991, §14.3.
8. **Interpretación.** «Los evaluadores coincidieron en {po %} de los casos; el acuerdo esperado por azar era {pe %}. κ = {κ} (IC95 % {lo}–{hi}): acuerdo {Landis-Koch} más allá del azar (cortes convencionales).» Si PABAK difiere mucho: «la prevalencia desigual de categorías reduce κ; PABAK = {PABAK}».
9. **Gráfica.** Matriz de acuerdo $k\times k$ tipo mapa de calor con la diagonal resaltada; κ con IC sobre una barra con las bandas de Landis-Koch.
10. **Métodos.** «La concordancia interobservador se evaluó con el coeficiente kappa de Cohen ({ponderación}) con IC95 % basado en el error estándar asintótico de Fleiss, Cohen y Everitt (1969); la magnitud se interpretó según Landis y Koch (1977).»

### D2 · `icc` · Coeficiente de correlación intraclase / Intraclass correlation coefficient · N2 (fase 2)

Entradas: matriz sujetos × evaluadores (≥ 2 columnas), modelo (unidireccional, bidireccional aleatorio, bidireccional mixto), tipo (consistencia, acuerdo absoluto), unidad (individual, promedio). Salidas: ICC con IC basado en F (Shrout & Fleiss 1979; McGraw & Wong 1996), tabla ANOVA, notación de Koo & Li (ICC(2,1), etc.). R: `irr::icc(ratings, model = "twoway", type = "agreement", unit = "single")`. Referencias: Shrout PE, Fleiss JL. Psychol Bull 1979;86:420–8; McGraw KO, Wong SP. Psychol Methods 1996;1:30–46; Koo TK, Li MY. J Chiropr Med 2016;15:155–63. Nota: es cerrado dado `qf`, podría pasar a N1 después. Interpretación: Bloque I (Koo & Li). Gráfica: puntos por sujeto conectando evaluadores.

### D3 · `ic-proporcion` · Intervalo de confianza de una proporción / Confidence interval for a proportion · N1

2. **Entradas.** $x$, $n$, confianza. Ejemplo: 68 / 80.
3. **Salidas.** Tabla con Wilson (por defecto), Wilson con corrección de continuidad (Newcombe método 4), Clopper-Pearson, Agresti-Coull, Jeffreys, Wald; amplitud de cada uno; recomendación.
4. **Ecuaciones.** Wald: $\hat p\pm z\sqrt{\hat p(1-\hat p)/n}$. Wilson: arriba (A1). Agresti-Coull: $\tilde n=n+z^2,\ \tilde p=\dfrac{x+z^2/2}{\tilde n},\ \tilde p\pm z\sqrt{\tilde p(1-\tilde p)/\tilde n}$. Clopper-Pearson: $\left[B_{\alpha/2}(x,\,n-x+1),\ B_{1-\alpha/2}(x+1,\,n-x)\right]$ (cuantiles beta; 0 si $x=0$, 1 si $x=n$). Jeffreys: $B_{\alpha/2}(x+\tfrac12,\,n-x+\tfrac12)$ y $B_{1-\alpha/2}(\cdot)$, con extremos 0/1 cuando $x=0$ o $x=n$.
5. **Reglas.** $x=0$ o $x=n$: Wald da amplitud 0 (marcar «inválido»). Con $n<40$ recomendar Wilson o Jeffreys (Brown et al. 2001); Clopper-Pearson etiquetado «conservador, garantiza cobertura».
6. **R.** Snippet: `binom::binom.confint(68, 80, conf.level = nivel, methods = c("wilson", "exact", "agresti-coull", "asymptotic"))` más Wilson con corrección de continuidad escrito a mano (Newcombe 1998, método 4) y Jeffreys escrito a mano con colas iguales: `qbeta(c((1 - nivel)/2, 1 - (1 - nivel)/2), x + 0.5, n - x + 0.5)` (límite 0 si $x=0$, 1 si $x=n$). Trampa fijada por el motor: `binom.confint(methods = "bayes")` y `binom.bayes` devuelven por defecto el intervalo de máxima densidad (`type = "highest"`), no el Jeffreys de colas iguales de Brown, Cai y DasGupta; nunca usarlos como oráculo de Jeffreys. `PropCIs::scoreci(68, 80, nivel)` y `PropCIs::exactci(68, 80, nivel)` como contraste; `res` con un vector de longitud 3 por método. Equivalente en RStudio (comentado, oráculo local): `DescTools::BinomCI(68, 80, method = c("wilson", "wilsoncc", "clopper-pearson", "agresti-coull", "jeffreys", "wald"))` [verificar].
7. **Referencias.** Wilson EB. J Am Stat Assoc 1927;22:209–12. Clopper CJ, Pearson ES. Biometrika 1934;26:404–13. Agresti A, Coull BA. Am Stat 1998;52:119–26. Newcombe RG. Stat Med 1998;17:857–72. Brown LD, Cai TT, DasGupta A. Stat Sci 2001;16:101–33. Didáctica: Altman et al. Statistics with Confidence 2000, cap. 6.
8. **Interpretación.** «{x} de {n} ({p %}). Con 95 % de confianza la proporción poblacional está entre {lo} y {hi} (Wilson). Los distintos métodos difieren sobre todo con n pequeño o proporciones cercanas a 0 o 1.»
9. **Gráfica.** Intervalos horizontales de los seis métodos alineados (tipo forest) con la estimación puntual.
10. **Métodos.** «Los IC95 % de proporciones se calcularon con el método de Wilson (score) (Wilson 1927; Newcombe 1998).»

### D4 · `ic-media` · Intervalo de confianza de una media (t) / Confidence interval for a mean · N1

2. **Entradas.** Media, DE y $n$, o columna pegada; confianza. Ejemplo: 95, 40, 50 (plaquetas ×10³/µL).
3. **Salidas.** EEM, $t_{n-1}$, IC de la media; opcional IC de la DE (χ²); recordatorio IC ≠ rango de los datos.
4. **Ecuación.** $\bar x\pm t_{n-1,\,1-\alpha/2}\dfrac{s}{\sqrt n}$; IC de $\sigma$: $\left[s\sqrt{\tfrac{n-1}{\chi^2_{n-1,1-\alpha/2}}},\ s\sqrt{\tfrac{n-1}{\chi^2_{n-1,\alpha/2}}}\right]$.
5. **Reglas.** $n\ge2$; $n<30$: aviso «supone normalidad aproximada»; DE = 0: IC degenerado con aviso.
6. **R.** `t.test(x, conf.level = nivel)$conf.int`; con resumen: `media + c(-1, 1) * qt(1 - (1 - nivel)/2, n - 1) * de / sqrt(n)`; IC de la DE: `de * sqrt((n - 1) / qchisq(c(1 - (1 - nivel)/2, (1 - nivel)/2), n - 1))`. Equivalente en RStudio (comentado): `DescTools::MeanCI(x)`.
7. **Referencias.** Student 1908. Didáctica: Altman 1991, §8.4; Gardner MJ, Altman DG. BMJ 1986;292:746–50.
8. «La media fue {x̄} (DE {s}); el IC95 % {lo}–{hi} indica el rango de medias poblacionales compatibles con los datos; no describe la dispersión individual (para eso, media ± 2 DE ≈ {…}).»
9. **Gráfica.** Punto con IC y banda tenue de ±1 DE para contrastar ambos conceptos.
10. «La media se acompañó de su IC95 % basado en la distribución t de Student con n−1 grados de libertad.»

### D5 · `media-de-mediana` · Media y DE a partir de mediana, rango o IQR / Mean and SD from median, range or IQR · N1

2. **Entradas.** Escenario S1 ($a$, $m$, $b$), S2 ($q_1$, $m$, $q_3$) o S3 (los cinco), y $n$. Ejemplo (ilustrativo): días de fiebre, $n$ = 45, mín 2, $q_1$ 4, mediana 6, $q_3$ 9, máx 21.
3. **Salidas.** Media: Luo 2018 (por defecto), Wan 2014, Hozo 2005 (S1). DE: Wan 2014 (por defecto), Hozo 2005 (S1), Shi 2020 (S3, opcional). Índice de asimetría del resumen $(b-m)/(m-a)$ y $(q_3-m)/(m-q_1)$ con aviso.
4. **Ecuaciones.** Media (Luo 2018): S1 $\bar x\approx w_1\frac{a+b}{2}+(1-w_1)m,\ w_1=\frac{4}{4+n^{0.75}}$; S2 $\bar x\approx w_2\frac{q_1+q_3}{2}+(1-w_2)m,\ w_2=0.70+\frac{0.39}{n}$; S3 $\bar x\approx w_3\frac{a+b}{2}+w_4\frac{q_1+q_3}{2}+(1-w_3-w_4)m,\ w_3=\frac{2.2}{2.2+n^{0.75}},\ w_4=0.70-\frac{0.72}{n^{0.55}}$. Wan 2014: S1 $\frac{a+2m+b}{4}$; S2 $\frac{q_1+m+q_3}{3}$; S3 $\frac{a+2q_1+2m+2q_3+b}{8}$. DE (Wan 2014): S1 $\frac{b-a}{\xi(n)},\ \xi(n)=2\Phi^{-1}\!\left(\frac{n-0.375}{n+0.25}\right)$; S2 $\frac{q_3-q_1}{\eta(n)},\ \eta(n)=2\Phi^{-1}\!\left(\frac{0.75n-0.125}{n+0.25}\right)$; S3 $\frac12\left[\frac{b-a}{\xi(n)}+\frac{q_3-q_1}{\eta(n)}\right]$. Hozo 2005 (S1): media $\frac{a+2m+b}{4}$ si $n\le25$, $m$ si $n>25$; DE $\sqrt{\frac1{12}\left[\frac{(a-2m+b)^2}{4}+(b-a)^2\right]}$ si $n\le15$, $\frac{b-a}{4}$ si $15<n\le70$, $\frac{b-a}{6}$ si $n>70$.
5. **Reglas.** Validar $a\le q_1\le m\le q_3\le b$ y $n\ge2$ (S2/S3 requieren $n\ge4$). Aviso fuerte si asimetría marcada: «las fórmulas suponen normalidad; el resultado puede sesgarse (Cochrane Handbook §6.5.2)». Mostrar siempre los tres métodos para transparencia.
6. **R.** Sin paquete en la lista (el paquete `estmeansd` implementa Wan/Luo, no disponible): transcripción en `tests/oracle/R/medsd.R`; validar contra los ejemplos numéricos publicados en Wan 2014 y Luo 2018.
7. **Referencias.** Hozo SP, Djulbegovic B, Hozo I. BMC Med Res Methodol 2005;5:13. Wan X, Wang W, Liu J, Tong T. BMC Med Res Methodol 2014;14:135. Luo D, Wan X, Liu J, Tong T. Stat Methods Med Res 2018;27:1785–805. Shi J et al. Res Synth Methods 2020;11:641–54 [verificar]. Didáctica: Higgins JPT et al. Cochrane Handbook, versión 6, §6.5.2.
8. «A partir de mediana {m} e IQR {q1}–{q3} en {n} pacientes, la media estimada es {x̄} (Luo 2018) y la DE {s} (Wan 2014). Use estas cifras solo para metaanálisis o comparaciones aproximadas.»
9. **Gráfica.** Diagrama de caja esquemático con los valores reportados y la media estimada como punto, más la curva normal implícita.
10. «La media y la DE no reportadas se estimaron a partir de la mediana y el rango intercuartílico con los métodos de Luo et al. (2018) y Wan et al. (2014).»

### D6 · `descriptivos-columna` · Descriptivos de una variable pegada / Descriptive statistics for a pasted column · N1

2. **Entradas.** Texto pegado (una columna); opciones: tipo de cuantil (7 por defecto, 6 alternativo), regla de bins (Sturges por defecto, Freedman-Diaconis), Shapiro-Wilk (activable). Ejemplo: 40 valores de la columna `plaquetas` de `dengue_sim.csv`.
3. **Salidas.** $n$, faltantes, media, DE ($n-1$), EEM, IC95 % (t), mediana, $Q_1$, $Q_3$, IQR, mín, máx, rango, CV, asimetría $G_1$ y curtosis $G_2$ (Joanes & Gill 1998, «tipo 2», el de SPSS/SAS), media geométrica si todos > 0, W de Shapiro-Wilk con p ($3\le n\le5000$, Royston 1995), valores atípicos por reglas de Tukey.
4. **Ecuaciones.** $s=\sqrt{\frac{\sum(x_i-\bar x)^2}{n-1}}$; $G_1=\frac{\sqrt{n(n-1)}}{n-2}\cdot\frac{m_3}{m_2^{3/2}}$, $G_2=\frac{n-1}{(n-2)(n-3)}\left[(n+1)\left(\frac{m_4}{m_2^2}-3\right)+6\right]$ con $m_k=\frac1n\sum(x_i-\bar x)^k$; $W=\dfrac{\left(\sum a_i x_{(i)}\right)^2}{\sum(x_i-\bar x)^2}$.
5. **Reglas.** $n<3$: sin SW ni $G_2$ ($n<4$). Constante: DE = 0, SW indefinida. Coma decimal detectada por regla de la sección 0. Atípicos: $<Q_1-1.5\,IQR$ o $>Q_3+1.5\,IQR$.
6. **R.** Snippet en base R: `mean(x); sd(x); quantile(x, c(.25, .5, .75), type = 7); shapiro.test(x); t.test(x)$conf.int` y $G_1$, $G_2$ escritos a mano: `m <- function(k) mean((x - mean(x))^k); g1 <- m(3)/m(2)^1.5; G1 <- g1*sqrt(n*(n - 1))/(n - 2); g2 <- m(4)/m(2)^2 - 3; G2 <- ((n + 1)*g2 + 6)*(n - 1)/((n - 2)*(n - 3))`. Equivalente en RStudio (comentado, oráculo local): `DescTools::Skew(x, method = 2); DescTools::Kurt(x, method = 2)` [verificar numeración de métodos]; `e1071::skewness(x, type = 2)`.
7. **Referencias.** Tukey JW. Exploratory Data Analysis, Addison-Wesley 1977. Shapiro SS, Wilk MB. Biometrika 1965;52:591–611. Royston P. Appl Stat 1995;44:547–51 (AS R94); Royston P. Stat Comput 1992;2:117–9. Hyndman RJ, Fan Y. Am Stat 1996;50:361–5. Joanes DN, Gill CA. The Statistician 1998;47:183–9. Sturges HA. J Am Stat Assoc 1926;21:65–6. Freedman D, Diaconis P. Z Wahrsch Verw Gebiete 1981;57:453–76. Didáctica: Altman 1991, cap. 3.
8. «Se describieron {n} valores: media {x̄} (DE {s}), mediana {m} (IQR {q1}–{q3}), rango {mín}–{máx}. Asimetría {G1}: distribución {aproximadamente simétrica / con cola a la derecha / izquierda}. Shapiro-Wilk: W = {W}, p = {p}: {no hay evidencia contra / hay evidencia contra} la normalidad; con n grande, p pequeños no implican desviaciones relevantes.»
9. **Gráfica.** Histograma con curva normal superpuesta y diagrama de caja debajo (atípicos como puntos).
10. «Las variables continuas se resumieron como media (DE) o mediana (IQR) según su distribución, evaluada con la prueba de Shapiro-Wilk y la inspección gráfica.»

---

## E. Modelos (webR)

Entrada común: texto pegado TSV/CSV con encabezado; detección de tipo por columna (numérica, categórica); selección de variables por menús; categórica → variables indicadoras con categoría de referencia elegible (por defecto la primera alfabética). Datos con NA se excluyen por fila con conteo mostrado. Salida común: tabla de coeficientes, n usado, «Ejecutar» reproduce exactamente el snippet mostrado (`jsonlite::toJSON` para el puente). Ejemplo común: `dengue_sim.csv`. Los snippets de E usan solo base R y `survival`; `pROC` y `DescTools` quedan como equivalentes comentados y oráculo local (contrato de la sección 0). E3 (Kaplan-Meier y log-rank) pasa a N1: el motor lo implementa en TS (plan del motor §1.6) y `survival` sirve de verificación.

### E1 · `reg-logistica` · Regresión logística binaria (simple y multivariable) / Binary logistic regression · N2

2. **Entradas.** Desenlace binario (0/1, sí/no, verdadero/falso detectados), 1–10 predictores, escala de predictores continuos (por unidad o por k unidades), tipo de IC (Wald por defecto, perfil de verosimilitud opcional), grupos de Hosmer-Lemeshow (10). Ejemplo: `grave ~ edad + sexo + plaquetas + ns1`.
3. **Salidas.** $\hat\beta$, SE, z, p, OR e IC; eventos, EPV (eventos por variable) con aviso si < 10 (Peduzzi 1996; Vittinghoff & McCulloch 2007 para 5–9); $-2\ell$, AIC, prueba de razón de verosimilitud global; Hosmer-Lemeshow ($\hat C$, gl = G−2, p); AUC con IC de DeLong (pROC); R² de Nagelkerke opcional.
4. **Ecuaciones.** $\operatorname{logit}\pi_i=\ln\dfrac{\pi_i}{1-\pi_i}=\beta_0+\sum_j\beta_jx_{ij};\quad OR_j=e^{\beta_j};\quad IC=\exp(\hat\beta_j\pm z_{1-\alpha/2}\,SE_j);\quad \hat C=\sum_{g=1}^{G}\dfrac{(O_g-E_g)^2}{E_g(1-E_g/n_g)}$.
5. **Reglas.** Separación completa (aviso de `glm`, $|\hat\beta|>10$ o SE enormes): mensaje «separación; considere regresión penalizada de Firth (fase 2)». Predictor continuo con OR ≈ 1.00: ofrecer reescalar. Categórica con nivel de < 5 eventos: aviso. Colinealidad: VIF > 5 aviso (calculado en R como $1/(1-R_j^2)$).
6. **R.**
```r
library(jsonlite)
fit <- glm(grave ~ edad + sexo + plaquetas + ns1, family = binomial, data = d)
or <- cbind(exp(coef(fit)), exp(confint.default(fit)))                 # OR con IC de Wald
# or_perfil <- exp(confint(fit))                                        # perfil de verosimilitud (stats >= 4.4), opción
hl <- function(p, y, g = 10) {                                          # Hosmer-Lemeshow 1980, deciles de riesgo
  grupo <- cut(p, unique(quantile(p, seq(0, 1, length.out = g + 1))), include.lowest = TRUE)
  o <- tapply(y, grupo, sum); e <- tapply(p, grupo, sum); n <- tapply(y, grupo, length)
  C <- sum((o - e)^2 / (e * (1 - e/n))); c(C = C, gl = length(o) - 2, p = pchisq(C, length(o) - 2, lower.tail = FALSE))
}
auc_delong <- function(p, y) {                                          # AUC = Mann-Whitney; EE de DeLong 1988
  x1 <- p[y == 1]; x0 <- p[y == 0]; m <- length(x1); n <- length(x0)
  v10 <- sapply(x1, function(a) mean((a > x0) + 0.5*(a == x0))); v01 <- sapply(x0, function(b) mean((x1 > b) + 0.5*(x1 == b)))
  auc <- mean(v10); ee <- sqrt(var(v10)/m + var(v01)/n); c(auc, auc - qnorm(0.975)*ee, auc + qnorm(0.975)*ee)
}
res <- list(coef = coef(fit), ee = sqrt(diag(vcov(fit))), or = or[, 1], or_lo = or[, 2], or_hi = or[, 3],
            eventos = sum(d$grave), epv = sum(d$grave)/(length(coef(fit)) - 1), aic = AIC(fit),
            lrt = fit$null.deviance - fit$deviance, hl = hl(fitted(fit), d$grave), auc = auc_delong(fitted(fit), d$grave))
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
# Equivalente en RStudio: pROC::ci.auc(pROC::roc(d$grave, fitted(fit), quiet = TRUE)); DescTools::HosmerLemeshowTest(fitted(fit), d$grave, ngr = 10)  [verificar]
```
7. **Referencias.** Berkson J. J Am Stat Assoc 1944;39:357–65. Cox DR. J R Stat Soc B 1958;20:215–42. Hosmer DW, Lemeshow S. Commun Stat Theory Methods 1980;9:1043–69. Peduzzi P et al. J Clin Epidemiol 1996;49:1373–9. Vittinghoff E, McCulloch CE. Am J Epidemiol 2007;165:710–8. Hanley JA, McNeil BJ. Radiology 1982;143:29–36. DeLong ER et al. Biometrics 1988;44:837–45. Robin X et al. BMC Bioinformatics 2011;12:77. Didáctica: Hosmer DW, Lemeshow S, Sturdivant RX. Applied Logistic Regression, 3.ª ed., Wiley 2013.
8. «Ajustando por las demás variables, cada {unidad} adicional de {x} se asocia con una razón de momios de {OR} (IC95 % {lo}–{hi}), es decir, {(OR−1)×100 %} {más/menos} posibilidades del desenlace. {Si IC incluye 1: no se puede excluir ausencia de asociación}. El modelo discrimina con AUC = {AUC} ({pobre/aceptable/buena/excelente} por convención de Hosmer-Lemeshow: 0.7, 0.8, 0.9); calibración: HL p = {p}.»
9. **Gráfica.** Forest de OR ajustados en escala logarítmica con línea en 1 (datos: OR, lo, hi por término).
10. «Se ajustó un modelo de regresión logística binaria (Hosmer, Lemeshow y Sturdivant 2013) con {desenlace} como variable dependiente y {predictores} como covariables; se reportan OR ajustados con IC95 % de Wald. La bondad de ajuste se evaluó con la prueba de Hosmer-Lemeshow y la discriminación con el área bajo la curva ROC (IC de DeLong). Análisis en R {versión} mediante webR.»

### E2 · `reg-cox` · Regresión de Cox (riesgos proporcionales) / Cox proportional hazards regression · N2

2. **Entradas.** Tiempo (> 0), evento (1 = evento, 0 = censura), 1–10 covariables, método de empates (Efron por defecto; Breslow para comparar con SPSS/Stata). Ejemplo: `Surv(tiempo, evento) ~ edad + plaquetas + ns1`.
3. **Salidas.** HR, IC95 % de Wald, p; pruebas globales (verosimilitud, Wald, score); concordancia de Harrell; eventos y EPV; prueba de proporcionalidad de Grambsch-Therneau (`cox.zph`, global y por término) con nota interpretativa.
4. **Ecuaciones.** $h(t\mid x)=h_0(t)\exp\!\left(\sum_j\beta_jx_j\right);\quad HR_j=e^{\beta_j};\quad IC=\exp(\hat\beta_j\pm z\,SE_j)$; verosimilitud parcial $L(\beta)=\prod_{i:\delta_i=1}\dfrac{e^{\beta^\top x_i}}{\sum_{l\in R(t_i)}e^{\beta^\top x_l}}$.
5. **Reglas.** Tiempos ≤ 0 → error; evento no 0/1 → error; < 10 eventos por covariable → aviso; `cox.zph` global p < 0.05 → aviso «el supuesto de proporcionalidad es dudoso: el HR es un promedio a lo largo del tiempo; considere estratificar o covariables dependientes del tiempo». Aviso si cero eventos en un nivel categórico.
6. **R.**
```r
library(survival)
fit <- coxph(Surv(tiempo, evento) ~ edad + plaquetas + ns1, data = d, ties = "efron")
summary(fit)$conf.int; summary(fit)$concordance; cox.zph(fit)
```
7. **Referencias.** Cox DR. J R Stat Soc B 1972;34:187–220. Schoenfeld D. Biometrika 1982;69:239–41. Grambsch PM, Therneau TM. Biometrika 1994;81:515–26. Harrell FE et al. JAMA 1982;247:2543–6 (índice C). Didáctica: Therneau TM, Grambsch PM. Modeling Survival Data, Springer 2000; Bradburn MJ et al. Br J Cancer 2003;89:431–6 (serie tutorial).
8. «Cada {unidad} de {x} se asocia con un riesgo instantáneo {HR} veces mayor (IC95 % {lo}–{hi}) ajustando por las demás covariables. Supuesto de proporcionalidad: p = {p} ({sin evidencia de violación / posible violación}).»
9. **Gráfica.** Forest de HR en escala log con línea en 1.
10. «Se ajustó un modelo de riesgos proporcionales de Cox (1972) con {covariables}; se reportan HR con IC95 %. El supuesto de proporcionalidad se verificó con los residuos de Schoenfeld escalados (Grambsch y Therneau 1994). Empates tratados con el método de Efron.»

### E3 · `kaplan-meier` · Curva de Kaplan-Meier y prueba de log-rank / Kaplan-Meier curve and log-rank test · N1 (TS, plan del motor §1.6; `survival` como verificación)

2. **Entradas.** Tiempo, evento, grupo opcional (≤ 6 niveles), tipo de IC (log-log de Kalbfleisch-Prentice por defecto, explícito en el snippet; log como opción), tiempos de interés para $S(t)$ (por ejemplo 7 y 14 días), ponderación del test (log-rank ρ = 0; Peto-Peto ρ = 1 opcional). Ejemplo: `Surv(tiempo, evento) ~ ns1`.
3. **Salidas.** Tabla de vida (t, en riesgo, eventos, censuras, $\hat S$, SE de Greenwood, IC), mediana de supervivencia con IC (concepto de Brookmeyer-Crowley; regla de `quantile.survfit`: primer tiempo con $\hat S<0.5$; si la curva vale exactamente 0.5 en un tramo, el punto medio de ese tramo; IC por el primer cruce de cada banda con 0.5 con la misma regla), $\hat S(t^*)$ en los tiempos pedidos, χ² de log-rank con gl = k−1 y p (con $k$ grupos, forma cuadrática $(O-E)^\top V^{-}(O-E)$), tabla de pacientes en riesgo por intervalos. En empates, los eventos preceden a las censuras (convención de `survfit`).
4. **Ecuaciones.** $\hat S(t)=\prod_{t_i\le t}\left(1-\dfrac{d_i}{n_i}\right);\quad \widehat{Var}[\hat S(t)]=\hat S(t)^2\sum_{t_i\le t}\dfrac{d_i}{n_i(n_i-d_i)};\quad \chi^2_{LR}=\dfrac{(O_1-E_1)^2}{V_1},\ E_1=\sum_i\dfrac{d_i n_{1i}}{n_i},\ V_1=\sum_i\dfrac{n_{1i}n_{0i}d_i(n_i-d_i)}{n_i^2(n_i-1)}$.
5. **Reglas.** Mediana no alcanzada → «NA (no alcanzada)». Grupo con < 5 eventos → aviso. Curvas que se cruzan → aviso «log-rank pierde poder; el HR no resume bien». $S(t^*)$ más allá del último tiempo observado → no definido.
6. **R.**
```r
library(survival); library(jsonlite)
sf <- survfit(Surv(tiempo, evento) ~ ns1, data = d, conf.type = "log-log")   # explícito: el default de R es "log"
s7 <- summary(sf, times = c(7, 14), extend = TRUE); med <- summary(sf)$table[, c("median", "0.95LCL", "0.95UCL")]
lr <- survdiff(Surv(tiempo, evento) ~ ns1, data = d, rho = 0)
res <- list(tiempos = sf$time, n_riesgo = sf$n.risk, eventos = sf$n.event, s = sf$surv, ee = sf$std.err, lo = sf$lower, hi = sf$upper,
            s_t = s7$surv, s_t_lo = s7$lower, s_t_hi = s7$upper, mediana = med, chisq = lr$chisq, gl = length(lr$n) - 1,
            p = pchisq(lr$chisq, length(lr$n) - 1, lower.tail = FALSE), observados = lr$obs, esperados = lr$exp)
cat(toJSON(res, auto_unbox = TRUE, digits = NA))
```
Nota: `sf$std.err` en `survfit` es el EE de $\ln\hat S$ (Greenwood en escala log), no el de $\hat S$; el campo TS equivalente debe usar la misma escala para comparar.
7. **Referencias.** Kaplan EL, Meier P. J Am Stat Assoc 1958;53:457–81. Greenwood M. Reports on Public Health and Medical Subjects 33, HMSO 1926. Mantel N. Cancer Chemother Rep 1966;50:163–70. Peto R, Peto J. J R Stat Soc A 1972;135:185–207. Brookmeyer R, Crowley J. Biometrics 1982;38:29–41. Kalbfleisch JD, Prentice RL. The Statistical Analysis of Failure Time Data, Wiley 1980. Didáctica: Bland JM, Altman DG. BMJ 1998;317:1572; BMJ 2004;328:1073.
8. «A los {t*} días, la supervivencia estimada fue {S %} (IC95 % {lo}–{hi}) en {grupo A} y {S %} en {grupo B}. La mediana fue {m} frente a {m} días. Log-rank: χ² = {χ²}, p = {p}.»
9. **Gráfica.** Curvas escalonadas por grupo con bandas de IC, marcas de censura y tabla de pacientes en riesgo debajo (datos: tabla de vida por grupo).
10. «Las funciones de supervivencia se estimaron con el método de Kaplan-Meier (1958) con IC95 % basados en la fórmula de Greenwood, y se compararon con la prueba de log-rank (Mantel 1966; Peto y Peto 1972).»

### E4 · `reg-lineal` · Regresión lineal múltiple / Multiple linear regression · N2

2. **Entradas.** Variable dependiente continua, 1–10 predictores. Ejemplo: `plaquetas ~ dias_fiebre + edad + sexo`.
3. **Salidas.** Coeficientes, SE, t, p, IC95 % (t con $n-p-1$ gl), $R^2$, $R^2$ ajustado, F global, error estándar residual, Shapiro-Wilk de residuos, VIF; para un solo predictor, r de Pearson con IC (Fisher z).
4. **Ecuaciones.** $y_i=\beta_0+\sum_j\beta_jx_{ij}+\varepsilon_i,\ \varepsilon_i\sim N(0,\sigma^2);\quad \hat\beta=(X^\top X)^{-1}X^\top y;\quad IC=\hat\beta_j\pm t_{n-p-1,1-\alpha/2}SE_j;\quad R^2=1-\dfrac{SS_{res}}{SS_{tot}}$.
5. **Reglas.** $n<10$ por predictor → aviso. VIF > 5 → aviso de colinealidad. Residuos con SW p < 0.05 o patrón en residuos vs ajustados → aviso «considere transformar y».
6. **R.** `fit <- lm(plaquetas ~ dias_fiebre + edad + sexo, data = d); summary(fit); confint(fit); shapiro.test(residuals(fit))`.
7. **Referencias.** Legendre AM. Nouvelles méthodes pour la détermination des orbites des comètes, 1805 (mínimos cuadrados). Galton F. J Anthropol Inst 1886;15:246–63 (regresión). Pearson K. Philos Trans R Soc A 1896;187:253–318 [verificar] (r). Fisher 1921 (z). Didáctica: Altman 1991, cap. 11–12; Harrell FE. Regression Modeling Strategies, 2.ª ed., Springer 2015.
8. «Por cada {unidad} de {x}, {y} cambia en promedio {β} unidades (IC95 % {lo}–{hi}), manteniendo constantes las demás variables. El modelo explica {R² %} de la variabilidad de {y}.»
9. **Gráfica.** Simple: dispersión con recta e IC95 % de la media; múltiple: residuos frente a ajustados.
10. «Se ajustó un modelo de regresión lineal múltiple por mínimos cuadrados con {y} como variable dependiente; se reportan coeficientes con IC95 %. Los supuestos se verificaron mediante inspección de residuos y la prueba de Shapiro-Wilk.»

---

## F. Orden de construcción priorizado (dependencias)

1. **Primitivas numéricas** (sección G) con sus fixtures de distribuciones: todo lo demás depende de ellas.
2. **Núcleo de proporciones**: los seis IC de D3 como módulo `propCI` → calculadora **D3** (primera en salir, sirve para validar Wilson/CP que reutilizan A1, B1, B3, C6).
3. **Núcleo 2×2**: parser, validación, Haldane, χ²/Fisher/φ → **A1**, **B1**, **B2** (comparten componente de tabla).
4. **A3** y **A2** (reutilizan A1 y el nomograma; sin dependencias nuevas).
5. **B3** McNemar (binomial exacta + IC pareados).
6. **Parser de columnas** → **D4**, **D6** (cuantiles, Tukey, Sturges, SW port), **D5** (solo `qnorm`).
7. **Bloque C0** (z, poder inverso, pérdidas, curva de poder; `pnt` AS 243 + Brent para C4/C5) → **C1, C2, C3, C4, C5, C6, C7** en ese orden (C6 reutiliza C1; C7 solo necesita `atanh`).
8. **D1** kappa (tabla k×k, pesos, SE de Fleiss).
9. **E3** Kaplan-Meier y log-rank en TS (reutiliza el parser de columnas de D6 con dos o tres columnas; `survival` solo para verificar).
10. **Infraestructura webR** (carga diferida, puente jsonlite, tipado de columnas) → **E1** (valida el puente con `glm`) → **E2** → **E4** → **D2** ICC (cerrado dado `qf`; puede quedar en TS si el motor lo prefiere).

## G. Primitivas numéricas compartidas (biblioteca TS)

| Primitiva | Uso | Algoritmo recomendado / referencia |
|---|---|---|
| `pnorm` | todos los IC z, poder | Cody 1969 (Math Comp 23:631–7) / SPECFUN 1993, como `pnorm.c` de R; exactitud ~1e-16 hasta colas extremas. AS 66 (Hill 1973) solo como fallback simple (1e-7). |
| `qnorm` | z críticos, Wan/Luo | Wichura MJ. AS 241 (PPND16), Appl Stat 1988;37:477–84; 1e-16. |
| `lgamma`, `lchoose` | binomial, hipergeométrica, beta | Lanczos (g = 7, 9 coeficientes; Numerical Recipes 3.ª ed. §6.1) o port de `lgammafn` de R (Stirling + `lgammacor`). |
| `ibeta` $I_x(a,b)$ | pt, pf, pbinom, Clopper-Pearson, Jeffreys | Fracción continua de Lentz modificado (Thompson & Barnett 1986; NR §6.4 `betacf`) con cambio de simetría en $x>(a+1)/(a+b+2)$; para $a,b>10^5$ referirse a TOMS 708 (Didonato & Morris 1992), lo que usa `pbeta` de R. |
| `qbeta` | Clopper-Pearson, Jeffreys, qf | El motor invierte su propia CDF con Brent (`tol = 1e-14·max(1,|x|)`), lo que garantiza `pbeta(qbeta(p)) = p`; AS 109 (Cran, Martin & Thomas 1977) queda como referencia alternativa. |
| `pt`, `qt` | D4, E4, C2 variante t | `pt` vía `ibeta`: $P(T\le t)=1-\tfrac12I_{\nu/(\nu+t^2)}(\nu/2,\tfrac12)$; `qt` por Brent sobre `pt` (Hill GW, Algorithm 396, Commun ACM 1970;13:619–20 como corchete inicial opcional). |
| `pnt` (t no central) | C4, C5 (idéntico a `power.t.test`) | AS 243 de Lenth: Lenth RV. Appl Stat 1989;38:185–9; R `nmath/pnt.c`; `errmax 1e-12`. Ya previsto por el motor (§1.3). |
| `pchisq`, `qchisq` | B2, B3, D1 (p de z²), E | Gamma incompleta regularizada (serie / Lentz; NR `gammp`/`gammq`; AS 239, Shea 1988); `qchisq` por Brent sobre `pchisq` (AS 91, Best & Roberts 1975, como arranque opcional). |
| `pf`, `qf` | D2, E4 | $I_{d_1x/(d_1x+d_2)}(d_1/2,d_2/2)$; inversa vía `qbeta`. |
| `dbinom`, `pbinom` | B3 exacto, fixtures | logaritmos con `lchoose` (o Loader 2000 para n grande); cdf por `ibeta`. |
| `dhyper` | Fisher | $\exp[\text{lchoose}(m_1,a)+\text{lchoose}(m_0,n_1-a)-\text{lchoose}(n,n_1)]$ sobre el soporte $[\max(0,n_1-m_0),\min(n_1,m_1)]$; empates con `relErr = 1 + 1e-7` como `fisher.test`. |
| Shapiro-Wilk | D6, E4 | Port de AS R94 (Royston 1995; `swilk.c` de R es GPL: portar el algoritmo publicado, no copiar el C sin respetar licencia). |
| Raíces (`uniroot`) | poder inverso, $n$ con t, Miettinen-Nurminen (fase 2) | Brent 1973 (NR `zbrent`), tolerancia 1e-10. |
| Cuantiles tipo 7 y 6, cercas de Tukey, bins Sturges/FD | D6 | Hyndman & Fan 1996. |
| Utilidades | todo | `logit`, `expit`, `atanh`, sumas compensadas (Kahan/Neumaier) para momentos de D6. |

Referencia de contraste para todas: implementaciones de R (`nmath`), documentadas en el código de cada función.

## H. Estrategia de pruebas

**Mecánica.** El mismo snippet R de cada calculadora (sección 0, contrato de snippets) se ejecuta con `Rscript` para generar `tests/fixtures/*.json`; `toJSON(auto_unbox = TRUE, digits = NA)` escribe `Inf`, `-Inf`, `NaN` y `NA` como las cadenas `"Inf"`, `"-Inf"`, `"NaN"`, `"NA"` (verificado por el motor con jsonlite 2.0.0) y el comparador TS las mapea a `Infinity`, `-Infinity`, `NaN`, `null`. Un script aparte genera la rejilla de distribuciones. Las pruebas (`node --test` sobre los módulos `.ts`, según el motor) cargan el JSON y comparan campo a campo con el `Resultado` TS (mismos nombres de campo). Los oráculos secundarios (`epiR`, `DescTools`, `presize`, `pROC`) corren solo en local, en un script separado, y sus discrepancias se registran como notas, no como fallos. Cada fixture registra `R.version.string` y versiones de paquetes. Además de fixtures, tests de propiedades: el IC contiene la estimación; Wilson ∈ [0, 1]; intercambiar filas y columnas invierte RR/OR y conserva χ² y Fisher; el poder crece con $n$; la Sn de A1 coincide con D3 aplicado a $a/(a+c)$; el OR de E1 con un predictor binario coincide con $ad/bc$ y su IC de Wald con el de Woolf (B1).

**Tolerancias.**

| Tipo | Tolerancia |
|---|---|
| `pnorm`, `qnorm` sobre rejilla de 60 puntos (incluye colas 1e-12) | relativa 1e-12 |
| `pt`, `qt`, `pchisq`, `qchisq`, `pbeta`, `qbeta`, `pf`, `qf` | relativa 1e-9 |
| Estimadores e IC de forma cerrada (Wilson, Wald, log, Newcombe, Simel, κ, Hozo/Wan/Luo) | absoluta 1e-9 |
| IC vía cuantiles (Clopper-Pearson, Jeffreys, t) | absoluta 1e-8 |
| Valores p (χ², McNemar, SW) | relativa 1e-6 y absoluta 1e-12 |
| p de Fisher y binomial exacta | relativa 1e-9 |
| Tamaños de muestra (C1, C2, C3, C6, C7 `n_clasico`) vs fórmula escrita en el snippet | `n` sin redondear: absoluta 1e-9; techo: entero exacto |
| C3 vs `power.prop.test(tol = 1e-10)`, C4/C5 vs `power.t.test(tol = 1e-10)` (t no central con `pnt`) | `n` sin redondear: relativa 1e-8; techo: entero exacto |
| C7 `n_pwr` vs `pwr.r.test` (método distinto, mostrado como comparación) | ±1 tras el techo, documentado |
| Poder inverso vs `power.prop.test` / `power.t.test` | absoluta 1e-8 |
| OR condicional y su IC de `fisher.test` (si se implementa; R lo resuelve con `uniroot` a ≈ 1.2e-4) | relativa 1e-4 |
| Kaplan-Meier ($\hat S$, EE en escala log, IC log-log, mediana) y log-rank (χ², esperados) vs `survfit`/`survdiff` | absoluta 1e-9 |
| W de Shapiro-Wilk y su p | absoluta 1e-8 tras el port de AS R94 |
| Salidas webR | el mismo código R corre en ambos lados: identidad 1e-10; los tests cubren parser, tipado de columnas y formato |

**Casos por calculadora (entradas; los esperados los genera R).**

- **A1**: (1) 68/6/12/114; (2) 68/0/12/120 (LR+ ∞, Haldane); (3) 5/1/2/7 ($n$ pequeño); (4) 0/6/80/114 (Sn = 0); (5) 80/0/0/120 (prueba perfecta).
- **A2**: $P$ = 0.30 con LR 17; $P$ = 0.01 con LR 0.1; $P$ = 0.999 con LR 100; LR = 1; $P$ = 0.
- **A3**: 0.85/0.95/0.30 con $n_D$ 80 y $n_{\bar D}$ 120; $P$ = 0.001; Sn = 1 (logit ajustado); $P$ = 1 (VPN indefinido).
- **B1**: 12/88/30/70; 0/100/30/70 (Haldane); 10/90/12/88 (IC de RRA incluye 0, notación NNTB-∞-NNTH); modo casos-controles; 1200/8800/3000/7000.
- **B2**: 12/88/30/70; 3/7/9/1 (esperados < 5); tabla con $|ad-bc|<n/2$ (Yates cae a 0, por ejemplo 5/5/5/6); 0/10/10/0 (φ = −1); 4/6/6/4 (empates en Fisher).
- **B3**: 40/15/5/90; $b=c$ = 10; $b+c$ = 0; $b$ = 1, $c$ = 0; $b$ = 200, $c$ = 100.
- **C1–C7**: por calculadora, caso base del ejemplo; variante (CPF, corrección de continuidad, $r$ = 2, unilateral, t iterativa según aplique); caso extremo ($p$ = 0.02 y $d$ = 0.05; $|p_1-p_2|$ = 0.01; Sn = 0.99; $r$ = 0.10); modo inverso con $n$ dado; pérdidas 20 %.
- **D1**: tabla 3×3 del ejemplo con las tres ponderaciones; 2×2 40/10/5/45; diagonal pura (κ = 1, SE = 0); tabla con κ < 0; 90/5/5/0 (paradoja, PABAK).
- **D3**: 68/80; 0/20; 20/20; 1/1000; 500/1000, seis métodos cada uno.
- **D4**: 95/40/50; $n$ = 2; columna con NA y coma decimal; DE = 0.
- **D5**: S3 con $n$ = 45; S1 con $n$ = 10; S2 con $n$ = 200; $n$ = 25 y 26 (frontera de Hozo); resumen muy asimétrico (solo aviso).
- **D6**: 40 valores simulados; duplicados y tokens no numéricos; $n$ = 3; columna constante; coma decimal.
- **E1**: predictor binario único (identidad con B1); multivariable del ejemplo; conjunto con separación; EPV < 10.
- **E2**: covariable binaria única (coherencia con log-rank de E3); multivariable; Efron vs Breslow; conjunto con violación de proporcionalidad.
- **E3** (en TS, contra `survfit`/`survdiff`): dos grupos; un grupo; sin censuras; todo censurado tras el último evento (mediana NA); empates evento/censura en el mismo tiempo; un grupo sin eventos; $n=1$; meseta con $\hat S=0.5$ exacto (regla del punto medio de `survfit`); tres grupos (gl = 2); $S(7)$ y $S(14)$ con `extend = TRUE`.
- **E4**: simple; múltiple con categórica; predictores colineales; $n$ = 8.
