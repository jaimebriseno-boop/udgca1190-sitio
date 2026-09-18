/**
 * Calculadora C5 · Tamaño de muestra para comparar medias pareadas
 * (antes/después) por el método exacto de la t no central, idéntico a
 * `power.t.test(type = "paired")`, con la desviación estándar de las
 * diferencias capturada directamente o derivada de σ y ρ, aproximación normal
 * de Guenther, ajuste por pérdidas y modo inverso (poder dados n pares).
 *
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-medias-pareadas.yml.
 */
import type {
  Contexto,
  Curva,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { LATERALIDADES, ajustarPerdidas, techo, validarComun, zAlfa, zPoder } from '../metodos/muestra-comun.ts';
import type { Lateralidad } from '../metodos/muestra-comun.ts';
import {
  N_MINIMO,
  dCohen,
  deDiferencias,
  nNormalPareadas,
  nPareadas,
  poderNormal,
  poderPareadas,
} from '../metodos/muestra-medias.ts';

export interface EntradasMuestraMediasPareadas extends Entradas {
  /** Media de las diferencias que importa; el signo no cambia el resultado. */
  delta: number;
  /** DE de las diferencias. 0 = «no capturada»: entonces se deriva de σ y ρ. */
  de_dif: number;
  /** DE de cada medición. 0 = «no capturada». */
  sigma: number;
  /** Correlación entre las dos mediciones; 0 (el valor por omisión) = mediciones sin relación. */
  rho: number;
  alfa: number;
  /** 'bilateral' o 'unilateral'. */
  lateralidad: string;
  poder: number;
  /** Pérdidas previstas; ausente = 0. */
  perdidas: number;
  /** Modo inverso: pares ya disponibles. 0 = «no capturado». */
  n_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = [
  'de_dif',
  'z_alfa',
  'z_beta',
  'd_cohen',
  'n',
  'n_normal',
  'n_ajustado',
  'poder_dado',
  'poder_dado_normal',
] as const;

/** Por debajo de 10 pares la prueba t se apoya mucho en el supuesto de normalidad. */
export const N_POCO = 10;

/** d de Cohen a partir de la cual el efecto pedido es enorme y conviene revisar las unidades. */
export const D_ENORME = 2;

/** Puntos de la curva de poder: 49 (la especificación pide al menos 40). */
const PASOS_CURVA = 48;

/** ¿Es una de las dos lateralidades declaradas en el YAML? */
function esLateralidad(v: unknown): v is Lateralidad {
  return typeof v === 'string' && (LATERALIDADES as readonly string[]).includes(v);
}

/** ¿La DE de las diferencias se capturó tal cual, o hay que derivarla de σ y ρ? */
export function directa(e: EntradasMuestraMediasPareadas): boolean {
  return Number.isFinite(e.de_dif) && e.de_dif > 0;
}

/**
 * DE de las diferencias que se usó: la capturada si la hay, o `σ·√(2(1 − ρ))`.
 * Es EXACTAMENTE la regla que lleva escrita el snippet de R, y por eso `de_dif`
 * es una salida más y no un parámetro silencioso.
 */
export function deDifUsada(e: EntradasMuestraMediasPareadas): number {
  return directa(e) ? e.de_dif : deDiferencias(e.sigma, e.rho);
}

/** Pares del modo inverso, o `NaN` si no se capturaron (el sentinel 0 del YAML). */
function nDadoDe(e: EntradasMuestraMediasPareadas): number {
  return Number.isFinite(e.n_dado) && e.n_dado >= N_MINIMO ? e.n_dado : Number.NaN;
}

export function calcular(e: EntradasMuestraMediasPareadas): Resultado<'muestra-medias-pareadas'> {
  const lateralidad = e.lateralidad as Lateralidad;
  validarComun(e.alfa, e.poder, e.perdidas);
  const deDif = deDifUsada(e);
  if (!(deDif > 0)) {
    throw new RangeError('entrada_invalida: la desviación estándar de las diferencias debe ser > 0');
  }

  const za = zAlfa(e.alfa, lateralidad);
  const zb = zPoder(e.poder);
  const d = dCohen(e.delta, deDif);

  const n = nPareadas(e.delta, deDif, e.alfa, lateralidad, e.poder);
  const nNormal = nNormalPareadas(e.delta, deDif, e.alfa, lateralidad, e.poder);
  const nAjustado = ajustarPerdidas(n, e.perdidas);

  const nDado = nDadoDe(e);
  const conInverso = Number.isFinite(nDado);
  const poderDado = conInverso ? poderPareadas(nDado, e.delta, deDif, e.alfa, lateralidad) : Number.NaN;
  const poderDadoNormal = conInverso
    ? poderNormal(e.delta, deDif / Math.sqrt(nDado), e.alfa, lateralidad)
    : Number.NaN;

  const valores: Record<string, Estimacion> = {
    de_dif: { valor: deDif, metodo: directa(e) ? 'puntual' : 'delta' },
    z_alfa: { valor: za, metodo: 'puntual' },
    z_beta: { valor: zb, metodo: 'puntual' },
    d_cohen: { valor: d, metodo: 'puntual' },
    n: { valor: n, metodo: 't-no-central' },
    n_normal: { valor: nNormal, metodo: 'normal' },
    n_ajustado: { valor: nAjustado, metodo: 't-no-central' },
    poder_dado: { valor: poderDado, metodo: 't-no-central' },
    poder_dado_normal: { valor: poderDadoNormal, metodo: 'normal' },
  };

  const avisos: Resultado['avisos'] = [{ codigo: 'supuestos', severidad: 'info' }];
  if (!directa(e)) avisos.push({ codigo: 'rho_supuesta', severidad: 'info', params: { rho: e.rho } });
  if (Number.isFinite(n) && n < N_POCO) {
    avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n: techo(n) } });
  }
  if (lateralidad === 'unilateral') avisos.push({ codigo: 'unilateral', severidad: 'info' });
  if (d > D_ENORME) avisos.push({ codigo: 'delta_grande', severidad: 'aviso' });

  return {
    calculadora: 'muestra-medias-pareadas',
    version: 1,
    entradas: {
      delta: e.delta,
      de_dif: e.de_dif,
      sigma: e.sigma,
      rho: e.rho,
      alfa: e.alfa,
      lateralidad,
      poder: e.poder,
      perdidas: e.perdidas,
      n_dado: e.n_dado,
    },
    valores,
    bandas: {
      lateralidad,
      de_dif: directa(e) ? 'directa' : 'derivada',
      perdidas: e.perdidas > 0 ? 'con' : 'sin',
      inverso: conInverso ? 'con' : 'sin',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMuestraMediasPareadas, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const v = s.valores;
  const noAplica = textos.etiquetas.no_aplica;

  /** Celda de un tamaño de muestra: el techo en el titular y el valor sin redondear en la nota. */
  const celdaN = (x: number, nota?: string): { valor: string; nota?: string } => {
    if (!Number.isFinite(x)) return { valor: fmt.num(x, 'int'), nota };
    // Dos decimales por encima de 1 y tres cifras significativas por debajo,
    // como fijaron C1 y C2: con un solo decimal, 277.97 se leería «278.0», que
    // es el techo, y el detalle dejaría de explicar de dónde sale la cifra.
    const exacto = `${textos.etiquetas.exacto}: ${fmt.num(x, x < 1 ? 'sig3' : 'dec2')}`;
    return { valor: fmt.entero(techo(x)), nota: nota ? `${nota} · ${exacto}` : exacto };
  };

  const nDado = nDadoDe(e);
  const vars: Record<string, string | number> = {
    delta: fmt.num(e.delta, 'sig4'),
    de_dif: fmt.num(v.de_dif.valor, 'sig4'),
    sigma: fmt.num(e.sigma, 'sig4'),
    rho: fmt.num(e.rho, 'dec2'),
    alfa: fmt.num(e.alfa, 'dec3'),
    poder: fmt.num(e.poder, 'pct0'),
    perdidas: fmt.num(e.perdidas, 'pct0'),
    lateralidad_texto: textos.etiquetas[`lateralidad.${String(e.lateralidad)}`],
    d_cohen: fmt.num(v.d_cohen.valor, 'dec3'),
    z_alfa: fmt.num(v.z_alfa.valor, 'dec3'),
    z_beta: fmt.num(v.z_beta.valor, 'dec3'),
    n_techo: fmt.entero(techo(v.n.valor)),
    n_normal_techo: fmt.entero(techo(v.n_normal.valor)),
    n_ajustado_techo: fmt.entero(techo(v.n_ajustado.valor)),
    n_dado: Number.isFinite(nDado) ? fmt.entero(nDado) : noAplica,
    poder_dado: fmt.num(v.poder_dado.valor, 'pct1'),
    poder_dado_normal: fmt.num(v.poder_dado_normal.valor, 'pct1'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  vars.perdidas_frase = rellenar(textos.interpretacion[`metodos_perdidas.${s.bandas.perdidas}`], vars);
  vars.de_frase = rellenar(textos.interpretacion[`metodos_de.${s.bandas.de_dif}`], vars);

  // El orden de inserción es el de SALIDAS: es el que recorren la tabla, el CSV y el Markdown.
  const celdas: Presentacion['celdas'] = {
    de_dif: {
      valor: fmt.num(v.de_dif.valor, 'sig4'),
      nota: directa(e) ? textos.etiquetas.nota_directa : textos.etiquetas.nota_derivada,
    },
    z_alfa: { valor: fmt.num(v.z_alfa.valor, 'dec3') },
    z_beta: { valor: fmt.num(v.z_beta.valor, 'dec3') },
    d_cohen: { valor: fmt.num(v.d_cohen.valor, 'dec3') },
    n: { ...celdaN(v.n.valor, textos.etiquetas.nota_exacta), clase: 'destacada' },
    n_normal: celdaN(v.n_normal.valor, textos.etiquetas.nota_normal),
    n_ajustado:
      e.perdidas > 0 ? celdaN(v.n_ajustado.valor, fmt.num(e.perdidas, 'pct0')) : celdaN(v.n_ajustado.valor),
    poder_dado: Number.isFinite(v.poder_dado.valor)
      ? { valor: fmt.num(v.poder_dado.valor, 'pct1'), nota: textos.etiquetas.nota_exacta, clase: 'destacada' }
      : { valor: noAplica },
    poder_dado_normal: Number.isFinite(v.poder_dado_normal.valor)
      ? { valor: fmt.num(v.poder_dado_normal.valor, 'pct1'), nota: textos.etiquetas.nota_normal }
      : { valor: noAplica },
  };

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`de_dif.${s.bandas.de_dif}`], vars),
    rellenar(textos.interpretacion.aproximacion, vars),
    rellenar(textos.interpretacion[`perdidas.${s.bandas.perdidas}`], vars),
    rellenar(textos.interpretacion[`inverso.${s.bandas.inverso}`], vars),
  ];

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((a) => a.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

/**
 * Curva de poder frente al número de pares, de n/4 a 2n, con la fórmula EXACTA
 * de la t no central (la misma que resolvió el tamaño), el marcador en el n
 * elegido y una línea horizontal en el poder objetivo.
 */
export function grafica(s: Resultado, e: EntradasMuestraMediasPareadas, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const lateralidad = e.lateralidad as Lateralidad;
  const v = s.valores;
  const deDif = v.de_dif.valor;

  const base = Number.isFinite(v.n.valor)
    ? v.n.valor
    : Number.isFinite(v.n_normal.valor)
      ? v.n_normal.valor
      : 100;
  const desde = Math.max(N_MINIMO, base / 4);
  const hasta = Math.max(2 * base, desde + PASOS_CURVA);
  const paso = (hasta - desde) / PASOS_CURVA;

  const puntos: Array<[number, number]> = [];
  for (let i = 0; i <= PASOS_CURVA; i += 1) {
    const n = desde + i * paso;
    puntos.push([n, poderPareadas(n, e.delta, deDif, e.alfa, lateralidad)]);
  }

  const marca = Number.isFinite(v.n.valor) ? techo(v.n.valor) : techo(base);
  const curvas: Curva[] = [{ id: 'poder', etiqueta: textos.etiquetas.curva_poder, puntos, destacada: true }];

  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.eje_poder,
    resumen: `${textos.etiquetas.eje_n}: ${fmt.entero(marca)}; ${textos.etiquetas.eje_poder}: ${fmt.num(e.poder, 'pct0')}.`,
    curvas,
    ejeX: { etiqueta: textos.etiquetas.eje_n, dominio: [desde, hasta], pista: 'int' },
    ejeY: { etiqueta: textos.etiquetas.eje_poder, dominio: [0, 1], pista: 'pct0' },
    marcador: {
      x: marca,
      etiqueta: `${textos.etiquetas.marcador_n}: ${fmt.entero(marca)}`,
      valores: { poder: poderPareadas(marca, e.delta, deDif, e.alfa, lateralidad) },
    },
    referenciaY: { valor: e.poder, etiqueta: `${textos.etiquetas.referencia_poder}: ${fmt.num(e.poder, 'pct0')}` },
  };
}

export const definicion: Definicion<EntradasMuestraMediasPareadas> = {
  id: 'muestra-medias-pareadas',
  motor: 'ts',
  claves: [
    'resumen',
    'de_dif.directa',
    'de_dif.derivada',
    'aproximacion',
    'perdidas.con',
    'perdidas.sin',
    'inverso.con',
    'inverso.sin',
    'metodos_de.directa',
    'metodos_de.derivada',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['supuestos', 'rho_supuesta', 'n_pequeno', 'unilateral', 'delta_grande'],
  salidas: SALIDAS,
  /**
   * Las entradas opcionales llegan al snippet SIEMPRE con un valor que R
   * entiende. `de_dif`, `sigma` y `n_dado` usan 0 como «no capturado» porque
   * cero es imposible para las tres (el YAML exige DE > 0 y n ≥ 2), y así el
   * caso «derivada desde σ y ρ» viaja a los fixtures y lo valida R en vez de
   * quedarse solo en las pruebas de TypeScript. `rho` no necesita sentinel: 0 es un
   * supuesto legítimo (dos mediciones sin relación), así que una ρ vacía vale 0
   * y solo entra en la cuenta cuando hay una σ que la acompañe.
   */
  derivar(e) {
    const numero = (v: unknown, ausente: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : ausente;
    return {
      de_dif: numero(e.de_dif, 0),
      sigma: numero(e.sigma, 0),
      rho: numero(e.rho, 0),
      perdidas: numero(e.perdidas, 0),
      n_dado: numero(e.n_dado, 0),
    };
  },
  validar(e) {
    const err: Record<string, string> = {};
    if (typeof e.delta !== 'number' || !Number.isFinite(e.delta)) err.delta = 'err_requerido';
    else if (e.delta === 0) err.delta = 'err_rango';

    // La DE de las diferencias manda; sin ella basta con σ, porque ρ = 0 (el
    // valor por omisión) es un supuesto legítimo: dos mediciones sin relación.
    // Si no hay ninguna de las dos se reclama sobre `de_dif`, que es el campo
    // que resuelve el problema de un solo golpe.
    const conDeDif = typeof e.de_dif === 'number' && Number.isFinite(e.de_dif) && e.de_dif > 0;
    const conSigma = typeof e.sigma === 'number' && Number.isFinite(e.sigma) && e.sigma > 0;
    if (!conDeDif && !conSigma) err.de_dif = 'err_requerido';
    if (typeof e.rho !== 'number' || !Number.isFinite(e.rho)) err.rho = 'err_numero';
    else if (!(e.rho >= 0 && e.rho <= 0.98)) err.rho = e.rho < 0 ? 'err_min' : 'err_max';

    if (!(e.alfa >= 0.001 && e.alfa <= 0.2)) err.alfa = e.alfa < 0.001 ? 'err_min' : 'err_max';
    if (!esLateralidad(e.lateralidad)) err.lateralidad = 'err_opcion';
    if (!(e.poder >= 0.5 && e.poder <= 0.99)) err.poder = e.poder < 0.5 ? 'err_min' : 'err_max';
    if (!(e.perdidas >= 0 && e.perdidas <= 0.5)) err.perdidas = e.perdidas < 0 ? 'err_min' : 'err_max';
    // Entero de 0 o más. 0 y 1 significan lo mismo, «sin modo inverso»: uno
    // solo no permite estimar una varianza, así que no se reclama, se ignora.
    if (typeof e.n_dado !== 'number' || !Number.isFinite(e.n_dado)) err.n_dado = 'err_numero';
    else if (e.n_dado < 0) err.n_dado = 'err_min';
    else if (!Number.isInteger(e.n_dado)) err.n_dado = 'err_entero';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
