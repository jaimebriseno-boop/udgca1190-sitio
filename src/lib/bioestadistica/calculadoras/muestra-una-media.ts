/**
 * Calculadora C2 · Tamaño de muestra para estimar una media con precisión
 * absoluta: variante normal, variante t de Student por punto fijo, corrección
 * por población finita, ajuste por pérdidas previstas y modo inverso.
 *
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-una-media.yml.
 *
 * Convención del grupo `muestra`: las salidas viajan SIN redondear, igual que
 * el JSON de R; el techo se aplica una sola vez, aquí en `presentar()`.
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
import { ajustarPerdidas, techo } from '../metodos/muestra-comun.ts';
import {
  SIN_DATO,
  conCpf,
  hayDato,
  nMedia,
  nMediaT,
  precisionMedia,
  precisionMediaT,
} from '../metodos/muestra-estimacion.ts';
import { zNivel } from '../metodos/proporciones.ts';
import { rellenar } from '../nucleo/plantillas.ts';

export interface EntradasMuestraUnaMedia extends Entradas {
  /** Desviación estándar esperada de la variable. */
  sigma: number;
  /** Precisión absoluta: semiamplitud del intervalo de confianza, en las unidades de la variable. */
  d: number;
  nivel: number;
  /** Población finita de la que se muestrea; 0 = no capturada (población no acotada). */
  poblacion: number;
  /** Pérdidas previstas (0 a 0.5); vacío = 0. */
  perdidas: number;
  /** Modo inverso: tamaño ya disponible; 0 = no capturado. */
  n_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = ['z', 'n_z', 'n_t', 'n', 'n_ajustado', 'd_dado'] as const;
export type SalidaMuestraUnaMedia = (typeof SALIDAS)[number];

/** Puntos de la curva de precisión frente a n (60 tramos = 61 puntos; el mínimo del contrato es 40). */
const PASOS_CURVA = 60;

/** Por debajo de 30 sujetos la aproximación normal se queda corta y toca usar la t. */
const N_PEQUENO = 30;

/** La corrección por población finita deja de ser anecdótica cuando N < 10·n_z. */
const FACTOR_CPF_IMPORTANTE = 10;

/**
 * Formato de las cantidades en las unidades de la variable (σ, precisión):
 * cuatro cifras significativas, como en `descriptivos` y `media-desde-mediana`,
 * para que una desviación de 60 no se lea «60.000» ni una de 0.35 se pierda.
 */
const PISTA_VALOR = 'sig4';

/**
 * Techo de presentación de un tamaño de muestra, en participantes. `techo()`
 * tolera 1e-9 absoluto para que 322.00000000001 no suba a 323, y esa tolerancia
 * hunde a 0 un tamaño positivo pero diminuto (σ minúscula frente a d, o una
 * proporción esperada casi nula). Ni un estudio se hace con 0 participantes ni
 * `ceiling()` de R devuelve 0 ahí: el suelo de la presentación es 1.
 */
function participantes(n: number): number {
  const redondeado = techo(n);
  return n > 0 && redondeado < 1 ? 1 : redondeado;
}

/** Precisión absoluta alcanzable con `n` sujetos, con la misma corrección que `n(d)`. */
function precisionCon(e: EntradasMuestraUnaMedia, n: number, nivel: number): number {
  return precisionMedia(e.sigma, n, e.poblacion, nivel);
}

/**
 * Salida del modo inverso: la precisión que alcanzaría el tamaño ya disponible,
 * o `NaN` («no definido») cuando no se capturó ninguno. Es la misma rama que
 * `if (n_dado >= 2) … else NA_real_` del snippet.
 */
function precisionDelNDado(e: EntradasMuestraUnaMedia, nivel: number): number {
  return hayDato(e.n_dado) ? precisionCon(e, e.n_dado, nivel) : Number.NaN;
}

export function calcular(e: EntradasMuestraUnaMedia, nivel: number): Resultado<'muestra-una-media'> {
  const { sigma, d, poblacion, perdidas, n_dado: nDado } = e;
  const z = zNivel(nivel);
  const nZ = nMedia(sigma, d, nivel);
  const nT = nMediaT(sigma, d, nivel);
  const n = conCpf(nZ, poblacion);
  const nAjustado = ajustarPerdidas(n, perdidas);
  const dDado = precisionDelNDado(e, nivel);

  const valores: Record<string, Estimacion> = {
    z: { valor: z, metodo: 'normal' },
    n_z: { valor: nZ, metodo: 'normal' },
    n_t: { valor: nT, metodo: 't' },
    n: { valor: n, metodo: 'normal' },
    n_ajustado: { valor: nAjustado, metodo: 'normal' },
    d_dado: { valor: dDado, metodo: 'normal' },
  };

  const conPoblacion = hayDato(poblacion);
  const avisos: Resultado['avisos'] = [];
  if (nZ < N_PEQUENO) avisos.push({ codigo: 'n_pequeno', severidad: 'aviso' });
  if (conPoblacion && poblacion < FACTOR_CPF_IMPORTANTE * nZ) {
    avisos.push({ codigo: 'cpf_importante', severidad: 'info', params: { poblacion } });
  }
  // El reclutamiento con pérdidas puede pasarse de la población declarada: pedir
  // más muestra de la que existe no tiene sentido y la CPF sola no lo impide.
  if (conPoblacion && nAjustado > poblacion) {
    avisos.push({ codigo: 'supera_poblacion', severidad: 'aviso', params: { poblacion } });
  }
  // La fórmula supone simetría: el recordatorio va siempre, como el de supuestos.
  avisos.push({ codigo: 'asimetria', severidad: 'info' });
  avisos.push({ codigo: 'supuestos', severidad: 'info' });

  return {
    calculadora: 'muestra-una-media',
    version: 1,
    entradas: { sigma, d, nivel, poblacion, perdidas, n_dado: nDado },
    valores,
    bandas: {
      cpf: conPoblacion ? 'con' : 'sin',
      perdidas: perdidas > 0 ? 'con' : 'sin',
      inverso: hayDato(nDado) ? 'con' : 'sin',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMuestraUnaMedia, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const nivel = typeof e.nivel === 'number' ? e.nivel : ctx.nivel;
  const v = s.valores;
  const nZTecho = participantes(v.n_z.valor);
  // `n_t` ya es un entero por construcción (el menor que cumple la condición),
  // así que no pasa por el techo de la presentación: no hay nada que redondear.
  const nTMinimo = v.n_t.valor;

  const vars: Record<string, string | number> = {
    sigma: fmt.num(e.sigma, PISTA_VALOR),
    d: fmt.num(e.d, PISTA_VALOR),
    nivel: fmt.nivel(nivel),
    poblacion: fmt.entero(e.poblacion),
    perdidas: fmt.num(e.perdidas, 'pct0'),
    n_dado: fmt.entero(e.n_dado),
    n_dado_etiqueta: textos.etiquetas.n_dado,
    n_z_techo: fmt.entero(nZTecho),
    n_t_minimo: fmt.entero(nTMinimo),
    n_t_diferencia: fmt.entero(nTMinimo - nZTecho),
    n_techo: fmt.entero(participantes(v.n.valor)),
    n_ajustado_techo: fmt.entero(participantes(v.n_ajustado.valor)),
    d_dado: fmt.num(v.d_dado.valor, PISTA_VALOR),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // Las dos frases variables del párrafo de Métodos se rellenan antes, con las
  // mismas variables, y entran como un marcador más (patrón de A1 y B1).
  vars.frase_cpf = rellenar(textos.interpretacion[`metodos_cpf.${s.bandas.cpf}`], vars, ctx.refs);
  vars.frase_perdidas = rellenar(textos.interpretacion[`metodos_perdidas.${s.bandas.perdidas}`], vars, ctx.refs);

  /**
   * Celda de un tamaño de muestra: techo en el titular, valor exacto en el
   * detalle. Dos decimales, no uno: con un decimal, 277.97 se escribiría
   * «278.0», idéntico al techo, y el detalle dejaría de explicar de dónde sale.
   * Por debajo de 1, dos decimales dirían «0.00» y harían creer que no hace
   * falta nadie, así que ahí mandan las cifras significativas.
   */
  const celdaN = (valor: number): Presentacion['celdas'][string] => ({
    valor: fmt.entero(participantes(valor)),
    nota: `${textos.etiquetas.exacto}: ${fmt.num(valor, valor < 1 ? 'sig3' : 'dec2')}`,
  });

  // El orden de inserción es el de `SALIDAS`: la página pinta las celdas en el
  // orden del objeto, y ese orden es el del JSON de R y el de las etiquetas.
  const celdas: Presentacion['celdas'] = {
    z: { valor: fmt.num(v.z.valor, 'dec3'), nota: fmt.nivel(nivel) },
    n_z: celdaN(v.n_z.valor),
    // La variante t publica un entero, no un valor por redondear: el detalle
    // dice qué semiamplitud se alcanza de verdad con ese tamaño, que es lo que
    // hace comprobable que sea el mínimo (con un sujeto menos no se alcanza).
    n_t: {
      valor: fmt.entero(nTMinimo),
      nota: Number.isFinite(nTMinimo)
        ? `${textos.etiquetas.alcanzada}: ${fmt.num(precisionMediaT(e.sigma, nTMinimo, nivel), PISTA_VALOR)}`
        : undefined,
    },
    n: { ...celdaN(v.n.valor), clase: 'destacada' },
    n_ajustado: celdaN(v.n_ajustado.valor),
    d_dado: {
      valor: fmt.num(v.d_dado.valor, PISTA_VALOR),
      nota: hayDato(e.n_dado)
        ? `${textos.etiquetas.n_dado}: ${fmt.entero(e.n_dado)}`
        : textos.etiquetas.nota_sin_n,
    },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion.variante_t, vars),
    rellenar(textos.interpretacion[`cpf.${s.bandas.cpf}`], vars),
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
 * Curva de la precisión alcanzable frente al tamaño de muestra, de n/4 a 2n
 * alrededor del n calculado, con el n elegido marcado y la precisión objetivo
 * como línea de referencia. Con población finita el recorrido no pasa de N:
 * más allá del censo no hay muestra que tomar.
 */
export function grafica(s: Resultado, e: EntradasMuestraUnaMedia, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const nivel = typeof e.nivel === 'number' ? e.nivel : ctx.nivel;
  const n = s.valores.n.valor;
  const marca = participantes(n);

  const tope = hayDato(e.poblacion) ? e.poblacion : Number.POSITIVE_INFINITY;
  const hasta = Math.min(Math.max(Math.ceil(2 * n), marca, 2), tope);
  const desde = Math.max(1, Math.min(Math.max(2, Math.floor(n / 4)), marca, hasta - 1));

  const puntos: Array<[number, number]> = [];
  for (let i = 0; i <= PASOS_CURVA; i += 1) {
    const x = desde + ((hasta - desde) * i) / PASOS_CURVA;
    puntos.push([x, precisionCon(e, x, nivel)]);
  }
  const curvas: Curva[] = [{ id: 'precision', etiqueta: textos.etiquetas.curva_d, puntos, destacada: true }];

  const enMarca = precisionCon(e, marca, nivel);
  const alto = Math.max(e.d, ...puntos.map(([, y]) => y).filter((y) => Number.isFinite(y)));
  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.n,
    resumen: `${textos.etiquetas.curva_d} con ${fmt.entero(marca)} ${textos.etiquetas.eje_n}: ±${fmt.num(enMarca, PISTA_VALOR)}; ${textos.etiquetas.ref_objetivo} ±${fmt.num(e.d, PISTA_VALOR)}.`,
    curvas,
    ejeX: { etiqueta: textos.etiquetas.eje_n, dominio: [desde, hasta], pista: 'int' },
    ejeY: { etiqueta: textos.etiquetas.eje_d, dominio: [0, alto], pista: PISTA_VALOR },
    marcador: {
      x: marca,
      etiqueta: `${textos.etiquetas.marcador_n}: ${fmt.entero(marca)}`,
      valores: { precision: enMarca },
    },
    referenciaY: {
      valor: e.d,
      etiqueta: `${textos.etiquetas.ref_objetivo} ±${fmt.num(e.d, PISTA_VALOR)}`,
    },
  };
}

export const definicion: Definicion<EntradasMuestraUnaMedia> = {
  id: 'muestra-una-media',
  motor: 'ts',
  claves: [
    'resumen',
    'variante_t',
    'cpf.con',
    'cpf.sin',
    'perdidas.con',
    'perdidas.sin',
    'inverso.con',
    'inverso.sin',
    'metodos_cpf.con',
    'metodos_cpf.sin',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['n_pequeno', 'cpf_importante', 'supera_poblacion', 'asimetria', 'supuestos'],
  salidas: SALIDAS,
  /**
   * Las tres entradas opcionales llegan siempre al snippet de R con un número.
   * Un campo vacío vale 0: en la población significa «no acotada» y en el
   * tamaño disponible, «sin modo inverso». Un 0 capturado se conserva tal cual
   * (nunca se convierte en `NaN`): es el mismo valor que validó el fixture.
   */
  derivar(e) {
    return {
      poblacion: typeof e.poblacion === 'number' ? e.poblacion : SIN_DATO,
      perdidas: typeof e.perdidas === 'number' ? e.perdidas : 0,
      n_dado: typeof e.n_dado === 'number' ? e.n_dado : SIN_DATO,
    };
  },
  validar(e) {
    const err: Record<string, string> = {};
    if (typeof e.sigma !== 'number' || Number.isNaN(e.sigma)) err.sigma = 'err_numero';
    else if (!(Number.isFinite(e.sigma) && e.sigma >= 0.000001)) err.sigma = 'err_min';

    if (typeof e.d !== 'number' || Number.isNaN(e.d)) err.d = 'err_numero';
    else if (!(Number.isFinite(e.d) && e.d >= 0.000001)) err.d = 'err_min';

    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';

    // Enteros no negativos: 0 y 1 son el estado legítimo «sin dato» (ni una
    // población ni una muestra de un individuo admiten corrección ni intervalo).
    if (!Number.isInteger(e.poblacion) || e.poblacion < 0) {
      err.poblacion = Number.isInteger(e.poblacion) ? 'err_min' : 'err_entero';
    }
    if (typeof e.perdidas !== 'number' || Number.isNaN(e.perdidas)) err.perdidas = 'err_numero';
    else if (e.perdidas < 0 || e.perdidas > 0.5) err.perdidas = 'err_rango';

    if (!Number.isInteger(e.n_dado) || e.n_dado < 0) {
      err.n_dado = Number.isInteger(e.n_dado) ? 'err_min' : 'err_entero';
    }
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
