/**
 * Bandas categóricas de interpretación (Bloque I de la especificación). Puras y
 * sin texto: la interfaz elige la plantilla `clave.banda` del YAML. Los cortes
 * son convenciones publicadas, no derivaciones teóricas; el contenido lo advierte.
 */

/** Razones de verosimilitud (Jaeschke, Guyatt y Sackett, JAMA 1994). */
export type BandaLr = 'grande' | 'moderado' | 'pequeno' | 'minimo' | 'nulo';
export const BANDAS_LR = ['grande', 'moderado', 'pequeno', 'minimo', 'nulo'] as const;

/** LR+: > 10 grande; 5–10 moderado; 2–5 pequeño; 1–2 mínimo; ≤ 1 nulo. ∞ es grande; NaN es nulo. */
export function bandaLrPos(lr: number): BandaLr {
  if (Number.isNaN(lr)) return 'nulo';
  if (lr > 10) return 'grande';
  if (lr >= 5) return 'moderado';
  if (lr >= 2) return 'pequeno';
  if (lr > 1) return 'minimo';
  return 'nulo';
}

/** LR−: < 0.1 grande; 0.1–0.2 moderado; 0.2–0.5 pequeño; 0.5–1 mínimo; ≥ 1 nulo. 0 es grande; NaN es nulo. */
export function bandaLrNeg(lr: number): BandaLr {
  if (Number.isNaN(lr)) return 'nulo';
  if (lr < 0.1) return 'grande';
  if (lr <= 0.2) return 'moderado';
  if (lr <= 0.5) return 'pequeno';
  if (lr < 1) return 'minimo';
  return 'nulo';
}

/** Kappa (Landis y Koch, Biometrics 1977). */
export type BandaKappa = 'pobre' | 'leve' | 'aceptable' | 'moderado' | 'sustancial' | 'casi_perfecto';
export const BANDAS_KAPPA = ['pobre', 'leve', 'aceptable', 'moderado', 'sustancial', 'casi_perfecto'] as const;

export function bandaKappa(k: number): BandaKappa {
  if (Number.isNaN(k) || k < 0) return 'pobre';
  if (k <= 0.2) return 'leve';
  if (k <= 0.4) return 'aceptable';
  if (k <= 0.6) return 'moderado';
  if (k <= 0.8) return 'sustancial';
  return 'casi_perfecto';
}

/** ICC sobre el LÍMITE INFERIOR del IC (Koo y Li, J Chiropr Med 2016). */
export type BandaIcc = 'pobre' | 'moderado' | 'bueno' | 'excelente';
export const BANDAS_ICC = ['pobre', 'moderado', 'bueno', 'excelente'] as const;

export function bandaIcc(limiteInferior: number): BandaIcc {
  if (Number.isNaN(limiteInferior) || limiteInferior < 0.5) return 'pobre';
  if (limiteInferior < 0.75) return 'moderado';
  if (limiteInferior < 0.9) return 'bueno';
  return 'excelente';
}

/** φ y r (Cohen 1988): 0.1 pequeño, 0.3 mediano, 0.5 grande; por debajo de 0.1, trivial. Usa |r|. */
export type BandaCohen = 'trivial' | 'pequeno' | 'mediano' | 'grande';
export const BANDAS_COHEN = ['trivial', 'pequeno', 'mediano', 'grande'] as const;

export function bandaCohen(r: number): BandaCohen {
  const a = Math.abs(r);
  if (Number.isNaN(a) || a < 0.1) return 'trivial';
  if (a < 0.3) return 'pequeno';
  if (a < 0.5) return 'mediano';
  return 'grande';
}

/**
 * Dirección del NNT según la reducción absoluta del riesgo RRA = p₁ − p₀
 * (p₁ = riesgo en expuestos/tratados): RRA < 0 → beneficio (NNTB);
 * RRA > 0 → daño (NNTH); 0 o NaN → nulo.
 */
export type DireccionNnt = 'beneficio' | 'dano' | 'nulo';

export function direccionNnt(rra: number): DireccionNnt {
  if (Number.isNaN(rra) || rra === 0) return 'nulo';
  return rra < 0 ? 'beneficio' : 'dano';
}

/** ¿El intervalo incluye el valor nulo (0 para diferencias, 1 para razones)? NaN → true (no se puede excluir). */
export function icCruzaNulo(ic: [number, number] | undefined, nulo: 0 | 1): boolean {
  if (!ic || Number.isNaN(ic[0]) || Number.isNaN(ic[1])) return true;
  return ic[0] <= nulo && nulo <= ic[1];
}

/** Valor p frente a α (por defecto 0.05): 'rechaza' | 'no_rechaza'; NaN → 'no_rechaza'. */
export function decisionP(p: number, alfa = 0.05): 'rechaza' | 'no_rechaza' {
  return !Number.isNaN(p) && p < alfa ? 'rechaza' : 'no_rechaza';
}
