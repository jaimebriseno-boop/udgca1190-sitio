/**
 * Valores predictivos a partir de sensibilidad, especificidad y prevalencia
 * (calculadora A3 de la especificación), con el intervalo logit de Mercaldo,
 * Lau y Zhou (2007) cuando se conocen los tamaños del estudio de validación, y
 * frecuencias naturales por cada 1,000 personas (Gigerenzer y Edwards 2003).
 *
 * Misma aritmética y mismo orden que el snippet de R de la calculadora
 * `valores-predictivos`. Con Sn o Sp en 0 o 1 el error estándar del logit no
 * existe (división entre cero): se usa entonces el «logit ajustado» de Mercaldo
 * (0.5 sumado a cada celda del estudio de validación, n + 1 por grupo), siempre
 * de forma explícita (`ajustado`) y con aviso en la interfaz.
 *
 * Referencias: Vecchio TJ. N Engl J Med 1966;274:1171-3 · Mercaldo ND, Lau KF,
 * Zhou XH. Stat Med 2007;26:2170-83 · Gigerenzer G, Edwards A. BMJ
 * 2003;327:741-4.
 */
import { zNivel } from './proporciones.ts';
import type { Estimacion } from '../nucleo/tipos.ts';

/** Lanza `RangeError` si Sn, Sp o la prevalencia no están en [0, 1]. */
export function validarSnSpPrev(sn: number, sp: number, prev: number): void {
  for (const v of [sn, sp, prev]) {
    if (!(v >= 0 && v <= 1)) throw new RangeError('entrada_invalida: Sn, Sp y prevalencia deben estar entre 0 y 1');
  }
}

/** Lanza `RangeError` si un tamaño de grupo no es un entero ≥ 0 (0 = no disponible). */
export function validarTamanos(nD: number, nND: number): void {
  for (const v of [nD, nND]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('entrada_invalida: los tamaños del estudio deben ser enteros ≥ 0');
  }
}

/** VPP = Sn·P / (Sn·P + (1 − Sp)(1 − P)). */
export function vppDe(sn: number, sp: number, prev: number): number {
  return (sn * prev) / (sn * prev + (1 - sp) * (1 - prev));
}

/** VPN = Sp(1 − P) / (Sp(1 − P) + (1 − Sn)P). */
export function vpnDe(sn: number, sp: number, prev: number): number {
  return (sp * (1 - prev)) / (sp * (1 - prev) + (1 - sn) * prev);
}

export function logit(p: number): number {
  return Math.log(p / (1 - p));
}

export function expit(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** ¿Sn o Sp en un extremo (0 o 1)? Entonces el logit estándar no tiene error estándar. */
export function requiereAjuste(sn: number, sp: number): boolean {
  return sn === 0 || sn === 1 || sp === 0 || sp === 1;
}

/**
 * Límites del intervalo logit (Mercaldo 2007) de VPP y VPN con `nD` enfermos y
 * `nND` sanos en el estudio de validación. Con `ajustado`, Sn y Sp se
 * reemplazan por (Sn·nD + 0.5)/(nD + 1) y (Sp·nND + 0.5)/(nND + 1), y los
 * tamaños por nD + 1 y nND + 1, exactamente como el snippet de R.
 */
export function limitesLogitMercaldo(
  sn: number,
  sp: number,
  prev: number,
  nD: number,
  nND: number,
  nivel: number,
  ajustado: boolean,
): { vpp: [number, number]; vpn: [number, number] } {
  const z = zNivel(nivel);
  const s = ajustado ? (sn * nD + 0.5) / (nD + 1) : sn;
  const e = ajustado ? (sp * nND + 0.5) / (nND + 1) : sp;
  const d = ajustado ? nD + 1 : nD;
  const nd = ajustado ? nND + 1 : nND;
  const vpp = vppDe(s, e, prev);
  const vpn = vpnDe(s, e, prev);
  const eeVpp = Math.sqrt((1 - s) / (s * d) + e / ((1 - e) * nd));
  const eeVpn = Math.sqrt((1 - e) / (e * nd) + s / ((1 - s) * d));
  return {
    vpp: [expit(logit(vpp) - z * eeVpp), expit(logit(vpp) + z * eeVpp)],
    vpn: [expit(logit(vpn) - z * eeVpn), expit(logit(vpn) + z * eeVpn)],
  };
}

export interface OpcionesPredictivos {
  nivel?: number;
  /** Enfermos y sanos del estudio de validación; 0 en cualquiera = sin intervalo. */
  nD?: number;
  nND?: number;
}

export interface ValoresPredictivos {
  vpp: Estimacion;
  vpn: Estimacion;
  lr_pos: Estimacion;
  lr_neg: Estimacion;
  /** Frecuencias naturales esperadas por cada 1,000 personas. */
  vp_mil: Estimacion;
  fp_mil: Estimacion;
  fn_mil: Estimacion;
  vn_mil: Estimacion;
  /** ¿Se usó el logit ajustado? */
  ajustado: boolean;
}

/** Valores predictivos, razones de verosimilitud y frecuencias naturales por 1,000. */
export function valoresPredictivos(sn: number, sp: number, prev: number, op: OpcionesPredictivos = {}): ValoresPredictivos {
  validarSnSpPrev(sn, sp, prev);
  const nivel = op.nivel ?? 0.95;
  const nD = op.nD ?? 0;
  const nND = op.nND ?? 0;
  validarTamanos(nD, nND);
  const vpp = vppDe(sn, sp, prev);
  const vpn = vpnDe(sn, sp, prev);
  const conIc = nD > 0 && nND > 0;
  const ajustado = conIc && requiereAjuste(sn, sp);
  let estVpp: Estimacion = { valor: vpp, metodo: 'puntual' };
  let estVpn: Estimacion = { valor: vpn, metodo: 'puntual' };
  if (conIc) {
    const ic = limitesLogitMercaldo(sn, sp, prev, nD, nND, nivel, ajustado);
    const metodo = ajustado ? 'logit-mercaldo-ajustado' : 'logit-mercaldo';
    estVpp = { valor: vpp, ic: ic.vpp, nivel, metodo };
    estVpn = { valor: vpn, ic: ic.vpn, nivel, metodo };
  }
  const por = 1000;
  return {
    vpp: estVpp,
    vpn: estVpn,
    lr_pos: { valor: sn / (1 - sp), metodo: 'puntual' },
    lr_neg: { valor: (1 - sn) / sp, metodo: 'puntual' },
    vp_mil: { valor: por * prev * sn, metodo: 'puntual' },
    fp_mil: { valor: por * (1 - prev) * (1 - sp), metodo: 'puntual' },
    fn_mil: { valor: por * prev * (1 - sn), metodo: 'puntual' },
    vn_mil: { valor: por * (1 - prev) * sp, metodo: 'puntual' },
    ajustado,
  };
}
