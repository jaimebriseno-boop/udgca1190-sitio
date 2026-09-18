/**
 * Tolerancias de comparación contra el oráculo R, documentadas clase por clase.
 *
 * Regla de igualdad (`comparar.ts`): `|a − b| ≤ abs + rel · max(|a|, |b|)`.
 *
 * El suelo `abs` no es decorativo: jsonlite 2.0.0 con `digits = NA` imprime 15
 * cifras significativas, así que un valor del fixture ya llega redondeado con un
 * error relativo de hasta ~5e-15 respecto al doble que calculó R. Además, R y
 * TypeScript evalúan las mismas fórmulas en órdenes idénticos pero con constantes
 * que pueden diferir en un ulp, y eso genera artefactos como el límite inferior
 * de Wilson en x = 0, que en R vale −1.16e-17 en vez de 0.
 *
 * | Clase        | rel   | abs   | Motivo                                                        |
 * |--------------|-------|-------|---------------------------------------------------------------|
 * | `cerrado`    | 1e-12 | 1e-14 | Solo aritmética en doble (Wilson, Wald, Agresti-Coull, κ, RR). |
 * | `cuantil`    | 1e-9  | 1e-12 | `qnorm`, `qt`, `qbeta`, `qchisq`: inversión por Brent y funciones incompletas. |
 * | `exacto`     | 1e-8  | 1e-15 | p-valores exactos (Fisher, McNemar exacto): sumas de pmf en escala logarítmica. |
 * | `fisher_or`  | 5e-4  | 1e-6  | OR condicional de `fisher.test`: R resuelve con `uniroot` a tol ≈ 1.2e-4. |
 * | `potencia`   | 1e-8  | 1e-8  | `power.*.test` y `pwr::*`: iterativos en ambos lados (uniroot con tol 1e-10). |
 * | `modelo`     | 1e-6  | 1e-8  | glm, coxph y lm: `epsilon` de IRLS en R.                      |
 * | `shapiro`    | 1e-10 | 1e-12 | W de Shapiro-Wilk y su p: port de AS R94 (Royston 1995) con los polinomios publicados; medido 6.7e-16 en W y 2.2e-13 en p sobre 44 columnas (n de 3 a 5,000). |
 */
import type { PerfilTolerancia, Tolerancia } from '../../src/lib/bioestadistica/nucleo/comparar.ts';

/** Forma cerrada: solo sumas, productos y raíces en doble. */
export const cerrado: Tolerancia = { rel: 1e-12, abs: 1e-14 };

/** Cuantiles y funciones de distribución (`qnorm`, `qbeta`, `qt`, `qchisq`, `pchisq`). */
export const cuantil: Tolerancia = { rel: 1e-9, abs: 1e-12 };

/** p-valores exactos calculados como sumas de funciones de masa. */
export const exacto: Tolerancia = { rel: 1e-8, abs: 1e-15 };

/** OR condicional de `fisher.test` y su intervalo: el oráculo es menos preciso que TypeScript. */
export const fisher_or: Tolerancia = { rel: 5e-4, abs: 1e-6 };

/** Tamaños de muestra y potencia resueltos por iteración. */
// La revisión de H3 midió el uso real de este perfil sobre los fixtures: la
// diferencia máxima TS-vs-R de todo lo resuelto por uniroot es 1.4e-10 (0.0001 %
// de un presupuesto de 1e-6). Con 1e-8 el peor caso usa un 1.4 % y una regresión
// del buscador de raíces ya no pasa inadvertida. Apretar una tolerancia sí está
// permitido; aflojarla, nunca.
export const potencia: Tolerancia = { rel: 1e-8, abs: 1e-8 };

/** Coeficientes de modelos ajustados por IRLS o Newton-Raphson. */
export const modelo: Tolerancia = { rel: 1e-6, abs: 1e-8 };

/**
 * Estadístico W de Shapiro-Wilk y su valor p (AS R94 portado desde la
 * publicación, no desde el C de R). La especificación admitía 1e-8; el port
 * coincide con R a 6.7e-16 (W) y 2.2e-13 (p) y el perfil se fija un orden de
 * magnitud por encima de lo medido para que una regresión del port no pase.
 */
export const shapiro: Tolerancia = { rel: 1e-10, abs: 1e-12 };

/** Proporciones de una tabla 2×2 (Sn, Sp, VPP, VPN, prevalencia, exactitud). */
const PROPORCIONES_2X2 = ['sn', 'sp', 'vpp', 'vpn', 'prev', 'exactitud'] as const;

/**
 * Perfil por calculadora. La clave es el valor de `tol` en cada caso del fixture
 * (por omisión, el slug de la calculadora).
 *
 * `ic-proporcion`: Wilson, Wilson con corrección de continuidad, Agresti-Coull y
 * Wald son forma cerrada a partir de un único `qnorm`, y la proporción puntual es
 * una división; Clopper-Pearson y Jeffreys invierten la beta incompleta con
 * `qbeta`, así que se quedan en el perfil `cuantil` por omisión.
 *
 * `prueba-diagnostica-2x2`: todo es forma cerrada (Wilson, Agresti-Coull o Wald
 * para las proporciones; log-Wald de Simel y Woolf para las razones; delta para
 * Youden). Los casos que eligen Clopper-Pearson o Jeffreys usan el perfil
 * `prueba-diagnostica-2x2-beta`, donde solo las seis proporciones pasan a
 * `cuantil`; las razones y el índice de Youden siguen en `cerrado`.
 *
 * `probabilidad-posprueba` y `valores-predictivos`: aritmética de momios, logit
 * y `exp`/`log` con un único `qnorm`: forma cerrada.
 *
 * `efecto-2x2`: RR de Katz, OR de Woolf, RRA de Newcombe (método 10, límites
 * de Wilson) o de Wald, RRR y NNT de Altman: todo forma cerrada con un `qnorm`.
 *
 * `chi-cuadrada-fisher`: los estadísticos χ² y φ son forma cerrada; sus valores
 * p pasan por `pchisq` (`cuantil`); el p de Fisher es una suma de `dhyper` en
 * escala logarítmica (`exacto`); el OR condicional y su intervalo los resuelve
 * R con `uniroot` a tolerancia ≈ 1.2e-4 (`fisher_or`).
 *
 * `mcnemar`: χ² sin y con corrección de Edwards y la diferencia pareada (Wald,
 * Agresti-Min) son forma cerrada; los p de χ² pasan por `pchisq`; el p exacto
 * es una suma binomial (`exacto`); el OR pareado b/c lleva el intervalo
 * derivado de Clopper-Pearson (`qbeta`, `cuantil`).
 *
 * `ic-media`: intervalos por `qt` y `qchisq` (`cuantil`); el EEM es una división.
 *
 * `media-desde-mediana`: Luo 2018, Wan 2014 y Hozo 2005 son forma cerrada; las
 * de Wan usan `qnorm` (≤ 3 ulp respecto a R).
 *
 * `descriptivos`: momentos, cuantiles tipo 7, cercas de Tukey y media
 * geométrica son forma cerrada; el IC de la media pasa por `qt`; W y p de
 * Shapiro-Wilk usan el perfil `shapiro`.
 */
export const TOL: Record<string, PerfilTolerancia> = {
  'ic-proporcion': {
    defecto: cuantil,
    campos: {
      p: cerrado,
      wilson: cerrado,
      wilson_cc: cerrado,
      agresti_coull: cerrado,
      wald: cerrado,
    },
  },
  'prueba-diagnostica-2x2': { defecto: cerrado },
  'prueba-diagnostica-2x2-beta': {
    defecto: cerrado,
    campos: Object.fromEntries(PROPORCIONES_2X2.map((campo) => [campo, cuantil])),
  },
  'probabilidad-posprueba': { defecto: cerrado },
  'valores-predictivos': { defecto: cerrado },
  'efecto-2x2': { defecto: cerrado },
  'chi-cuadrada-fisher': {
    defecto: cerrado,
    campos: { p_chi2: cuantil, p_yates: cuantil, p_n1: cuantil, p_fisher: exacto, or_cond: fisher_or },
  },
  mcnemar: {
    defecto: cerrado,
    campos: { p_chi2: cuantil, p_edwards: cuantil, p_exacta: exacto, or_pareado: cuantil },
  },
  'ic-media': { defecto: cuantil, campos: { eem: cerrado } },
  'media-desde-mediana': { defecto: cerrado },
  descriptivos: { defecto: cerrado, campos: { media: cuantil, sw_w: shapiro, sw_p: shapiro } },
  // Tamaño de muestra (H3). Las fórmulas cerradas con un `qnorm` van en `cerrado`;
  // lo que en R resuelve `uniroot` (`power.prop.test`, `power.t.test` con
  // `tol = 1e-10`, `pwr.r.test` con su tolerancia por omisión) va en `potencia`,
  // y lo que pasa por `qt` o `pnt`, en `cuantil`.
  'muestra-una-proporcion': { defecto: cerrado },
  'muestra-una-media': { defecto: cerrado, campos: { n_t: cuantil } },
  'muestra-dos-proporciones': { defecto: cerrado, campos: { n_ppt: potencia, n_pwr_h: potencia } },
  'muestra-dos-medias': {
    defecto: potencia,
    campos: { z_alfa: cerrado, z_beta: cerrado, d_cohen: cerrado, n1_normal: cerrado, n2_normal: cerrado, poder_dado_normal: cerrado },
  },
  'muestra-medias-pareadas': {
    defecto: potencia,
    campos: { z_alfa: cerrado, z_beta: cerrado, de_dif: cerrado, n_normal: cerrado, poder_dado_normal: cerrado },
  },
  'muestra-prueba-diagnostica': { defecto: cerrado },
  'muestra-correlacion': { defecto: cerrado, campos: { n_pwr: potencia } },
  // Concordancia y supervivencia (H3, segunda oleada): κ, su EE de Fleiss-Cohen-
  // Everitt, PABAK y los índices de Byrt son forma cerrada; el p frente a κ = 0
  // pasa por `pnorm`. Kaplan-Meier: productos y Greenwood en doble; el IC
  // log-log usa un `qnorm`; el p del log-rank pasa por `pchisq`.
  // z_h0 y p_h0 (prueba frente a κ = 0 como `irr::kappa2`) son una resta de
  // cantidades casi iguales y con p_e → 1 amplificaban un ulp hasta 1.5e-8; la
  // revisión de H3 propuso un perfil propio, pero el constructor reprodujo la
  // agrupación de sumas de kappa2 (conteos enteros, división entre n al final)
  // y los dos casos `pe_casi_uno*` coinciden bit a bit: todo sigue en `cerrado`.
  kappa: { defecto: cerrado },
  'kaplan-meier': { defecto: cerrado, campos: { p_logrank: cuantil } },
};
