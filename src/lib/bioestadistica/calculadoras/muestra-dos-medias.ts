/**
 * Calculadora C4 · Tamaño de muestra para comparar dos medias independientes
 * por el método exacto de la t no central (idéntico a `power.t.test`), con
 * razón de asignación r, aproximación normal de Guenther como fila didáctica,
 * ajuste por pérdidas y modo inverso (poder dado n).
 *
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-dos-medias.yml.
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
  eeDosMedias,
  n1DosMedias,
  n1NormalDosMedias,
  nPowerTTestDosMuestras,
  poderDosMedias,
  poderNormal,
} from '../metodos/muestra-medias.ts';

export interface EntradasMuestraDosMedias extends Entradas {
  /** Diferencia de medias que importa; el signo no cambia el resultado. */
  delta: number;
  /** Desviación estándar común del desenlace (> 0). */
  sigma: number;
  alfa: number;
  /** 'bilateral' o 'unilateral'. */
  lateralidad: string;
  poder: number;
  /** Razón de asignación n₂/n₁. */
  r: number;
  /** Pérdidas previstas; ausente = 0. */
  perdidas: number;
  /** Modo inverso: n₁ ya disponible. 0 = «no capturado» (llega a R como tal y el poder sale `NA`). */
  n_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = [
  'z_alfa',
  'z_beta',
  'd_cohen',
  'n1',
  'n2',
  'n_total',
  'n_ptt',
  'n1_normal',
  'n2_normal',
  'n_ajustado',
  'poder_dado',
  'poder_dado_normal',
] as const;

/** Por debajo de 10 por grupo la prueba t se apoya mucho en el supuesto de normalidad. */
export const N_POCO = 10;

/** d de Cohen a partir de la cual el efecto pedido es enorme y conviene revisar las unidades. */
export const D_ENORME = 2;

/** Puntos de la curva de poder: 49 (la especificación pide al menos 40). */
const PASOS_CURVA = 48;

/** ¿Es una de las dos lateralidades declaradas en el YAML? */
function esLateralidad(v: unknown): v is Lateralidad {
  return typeof v === 'string' && (LATERALIDADES as readonly string[]).includes(v);
}

/** n₁ del modo inverso, o `NaN` si no se capturó (el sentinel 0 del YAML). */
function nDadoDe(e: EntradasMuestraDosMedias): number {
  return Number.isFinite(e.n_dado) && e.n_dado >= N_MINIMO ? e.n_dado : Number.NaN;
}

export function calcular(e: EntradasMuestraDosMedias): Resultado<'muestra-dos-medias'> {
  const lateralidad = e.lateralidad as Lateralidad;
  // La biblioteca nunca calcula con entradas imposibles: α, poder y pérdidas
  // fuera de rango lanzan, igual que en el resto de la sección.
  validarComun(e.alfa, e.poder, e.perdidas);
  if (!(e.sigma > 0)) throw new RangeError('entrada_invalida: la desviación estándar debe ser > 0');
  if (!(e.r > 0)) throw new RangeError('entrada_invalida: la razón de asignación debe ser > 0');
  const za = zAlfa(e.alfa, lateralidad);
  const zb = zPoder(e.poder);
  const d = dCohen(e.delta, e.sigma);

  const n1 = n1DosMedias(e.delta, e.sigma, e.alfa, lateralidad, e.poder, e.r);
  const n2 = e.r * n1;
  const nTotal = n1 + n2;
  // `power.t.test` solo cubre grupos iguales; con r ≠ 1 la comparación no existe.
  const nPtt = e.r === 1 ? nPowerTTestDosMuestras(e.delta, e.sigma, e.alfa, lateralidad, e.poder) : Number.NaN;

  const n1Normal = n1NormalDosMedias(e.delta, e.sigma, e.alfa, lateralidad, e.poder, e.r);
  const n2Normal = e.r * n1Normal;
  const nAjustado = ajustarPerdidas(nTotal, e.perdidas);

  const nDado = nDadoDe(e);
  const conInverso = Number.isFinite(nDado);
  const poderDado = conInverso ? poderDosMedias(nDado, e.delta, e.sigma, e.alfa, lateralidad, e.r) : Number.NaN;
  const poderDadoNormal = conInverso
    ? poderNormal(e.delta, eeDosMedias(e.sigma, nDado, e.r * nDado), e.alfa, lateralidad)
    : Number.NaN;

  const valores: Record<string, Estimacion> = {
    z_alfa: { valor: za, metodo: 'puntual' },
    z_beta: { valor: zb, metodo: 'puntual' },
    d_cohen: { valor: d, metodo: 'puntual' },
    n1: { valor: n1, metodo: 't-no-central' },
    n2: { valor: n2, metodo: 't-no-central' },
    n_total: { valor: nTotal, metodo: 't-no-central' },
    n_ptt: { valor: nPtt, metodo: 't-no-central' },
    n1_normal: { valor: n1Normal, metodo: 'normal' },
    n2_normal: { valor: n2Normal, metodo: 'normal' },
    n_ajustado: { valor: nAjustado, metodo: 't-no-central' },
    poder_dado: { valor: poderDado, metodo: 't-no-central' },
    poder_dado_normal: { valor: poderDadoNormal, metodo: 'normal' },
  };

  const avisos: Resultado['avisos'] = [{ codigo: 'supuestos', severidad: 'info' }];
  if (Number.isFinite(n1) && n1 < N_POCO) {
    avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n1: techo(n1) } });
  }
  if (lateralidad === 'unilateral') avisos.push({ codigo: 'unilateral', severidad: 'info' });
  if (e.r !== 1) avisos.push({ codigo: 'r_distinto', severidad: 'info', params: { r: e.r } });
  if (d > D_ENORME) avisos.push({ codigo: 'delta_grande', severidad: 'aviso' });

  return {
    calculadora: 'muestra-dos-medias',
    version: 1,
    entradas: {
      delta: e.delta,
      sigma: e.sigma,
      alfa: e.alfa,
      lateralidad,
      poder: e.poder,
      r: e.r,
      perdidas: e.perdidas,
      n_dado: e.n_dado,
    },
    valores,
    bandas: {
      lateralidad,
      r: e.r === 1 ? 'r1' : 'r',
      perdidas: e.perdidas > 0 ? 'con' : 'sin',
      inverso: conInverso ? 'con' : 'sin',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMuestraDosMedias, ctx: Contexto): Presentacion {
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

  const n1 = v.n1.valor;
  const n2 = v.n2.valor;
  // El techo se aplica POR GRUPO, una sola vez: el total que hay que reclutar
  // es la suma de los dos techos, no el techo de la suma (DECISIONES, C3).
  const totalTecho = techo(n1) + techo(n2);
  // Lo mismo con las pérdidas: 317 repartido en 159 y 158 dejaría al segundo
  // grupo en 142.2 tras perder el 10 %, por debajo de los 143 que exige el
  // cálculo. Cada grupo se ajusta y se redondea por separado: 159 + 159 = 318.
  // El crudo n_total/(1 − L) sigue intacto en el detalle y en el JSON de R.
  const n1Ajustado = ajustarPerdidas(n1, e.perdidas);
  const n2Ajustado = ajustarPerdidas(n2, e.perdidas);
  const ajustadoTecho = techo(n1Ajustado) + techo(n2Ajustado);
  const nDado = nDadoDe(e);
  const nDado2 = techo(e.r * nDado);

  const vars: Record<string, string | number> = {
    delta: fmt.num(e.delta, 'sig4'),
    sigma: fmt.num(e.sigma, 'sig4'),
    alfa: fmt.num(e.alfa, 'dec3'),
    poder: fmt.num(e.poder, 'pct0'),
    // El poder como proporción, para el texto que reproduce la llamada a R:
    // «power = 0.80» es código válido y «power = 80 %» no lo sería.
    poder_dec: fmt.num(e.poder, 'dec2'),
    perdidas: fmt.num(e.perdidas, 'pct0'),
    r: fmt.num(e.r, 'sig4'),
    lateralidad_texto: textos.etiquetas[`lateralidad.${String(e.lateralidad)}`],
    d_cohen: fmt.num(v.d_cohen.valor, 'dec3'),
    z_alfa: fmt.num(v.z_alfa.valor, 'dec3'),
    z_beta: fmt.num(v.z_beta.valor, 'dec3'),
    n1_techo: fmt.entero(techo(n1)),
    n2_techo: fmt.entero(techo(n2)),
    n_total_techo: fmt.entero(totalTecho),
    n_ajustado_techo: fmt.entero(ajustadoTecho),
    n1_ajustado_techo: fmt.entero(techo(n1Ajustado)),
    n2_ajustado_techo: fmt.entero(techo(n2Ajustado)),
    n1_normal_techo: fmt.entero(techo(v.n1_normal.valor)),
    n_ptt_techo: Number.isFinite(v.n_ptt.valor) ? fmt.entero(techo(v.n_ptt.valor)) : noAplica,
    n_dado: Number.isFinite(nDado) ? fmt.entero(nDado) : noAplica,
    n_dado_2: Number.isFinite(nDado) ? fmt.entero(nDado2) : noAplica,
    poder_dado: fmt.num(v.poder_dado.valor, 'pct1'),
    poder_dado_normal: fmt.num(v.poder_dado_normal.valor, 'pct1'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  vars.perdidas_frase = rellenar(textos.interpretacion[`metodos_perdidas.${s.bandas.perdidas}`], vars);

  const c1 = celdaN(n1, textos.etiquetas.nota_exacta);
  const c2 = celdaN(n2, textos.etiquetas.nota_exacta);
  // El orden de inserción es el de SALIDAS: es el que recorren la tabla, el CSV y el Markdown.
  const celdas: Presentacion['celdas'] = {
    z_alfa: { valor: fmt.num(v.z_alfa.valor, 'dec3') },
    z_beta: { valor: fmt.num(v.z_beta.valor, 'dec3') },
    d_cohen: { valor: fmt.num(v.d_cohen.valor, 'dec3') },
    n1: { ...c1, clase: 'destacada' },
    n2: { ...c2, clase: 'destacada' },
    n_total: {
      valor: Number.isFinite(totalTecho) ? fmt.entero(totalTecho) : fmt.num(totalTecho, 'int'),
      nota: Number.isFinite(v.n_total.valor)
        ? `${textos.etiquetas.exacto}: ${fmt.num(v.n_total.valor, v.n_total.valor < 1 ? 'sig3' : 'dec2')}`
        : undefined,
    },
    // «No aplica» es solo el caso de grupos desiguales; con r = 1 y un diseño sin
    // solución el valor es «no definido», igual que n₁, y no un método que no encaje.
    n_ptt: e.r !== 1 ? { valor: noAplica, nota: textos.etiquetas.solo_r1 } : celdaN(v.n_ptt.valor),
    n1_normal: celdaN(v.n1_normal.valor, textos.etiquetas.nota_normal),
    n2_normal: celdaN(v.n2_normal.valor, textos.etiquetas.nota_normal),
    // El titular es la suma de los techos por grupo; la nota conserva el crudo.
    n_ajustado: {
      valor: Number.isFinite(ajustadoTecho) ? fmt.entero(ajustadoTecho) : fmt.num(ajustadoTecho, 'int'),
      nota: Number.isFinite(v.n_ajustado.valor)
        ? [
            ...(e.perdidas > 0 ? [fmt.num(e.perdidas, 'pct0')] : []),
            `${textos.etiquetas.exacto}: ${fmt.num(v.n_ajustado.valor, v.n_ajustado.valor < 1 ? 'sig3' : 'dec2')}`,
          ].join(' · ')
        : undefined,
    },
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
    rellenar(textos.interpretacion.aproximacion, vars),
    rellenar(textos.interpretacion[`comparacion.${s.bandas.r}`], vars),
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
 * Curva de poder frente al tamaño del grupo 1, de n/4 a 2n, con la fórmula
 * EXACTA de la t no central (la misma que resolvió el tamaño), el marcador en
 * el n elegido y una línea horizontal en el poder objetivo.
 */
export function grafica(s: Resultado, e: EntradasMuestraDosMedias, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const lateralidad = e.lateralidad as Lateralidad;
  const v = s.valores;

  // Si el efecto es tan pequeño que no hay solución exacta, la curva se dibuja
  // alrededor de la aproximación normal para que la gráfica siga informando.
  const base = Number.isFinite(v.n1.valor)
    ? v.n1.valor
    : Number.isFinite(v.n1_normal.valor)
      ? v.n1_normal.valor
      : 100;
  const desde = Math.max(N_MINIMO, base / 4);
  const hasta = Math.max(2 * base, desde + PASOS_CURVA);
  const paso = (hasta - desde) / PASOS_CURVA;

  const puntos: Array<[number, number]> = [];
  for (let i = 0; i <= PASOS_CURVA; i += 1) {
    const n = desde + i * paso;
    puntos.push([n, poderDosMedias(n, e.delta, e.sigma, e.alfa, lateralidad, e.r)]);
  }

  const marca = Number.isFinite(v.n1.valor) ? techo(v.n1.valor) : techo(base);
  const curvas: Curva[] = [
    { id: 'poder', etiqueta: textos.etiquetas.curva_poder, puntos, destacada: true },
  ];

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
      valores: { poder: poderDosMedias(marca, e.delta, e.sigma, e.alfa, lateralidad, e.r) },
    },
    referenciaY: { valor: e.poder, etiqueta: `${textos.etiquetas.referencia_poder}: ${fmt.num(e.poder, 'pct0')}` },
  };
}

export const definicion: Definicion<EntradasMuestraDosMedias> = {
  id: 'muestra-dos-medias',
  motor: 'ts',
  claves: [
    'resumen',
    'aproximacion',
    'comparacion.r1',
    'comparacion.r',
    'perdidas.con',
    'perdidas.sin',
    'inverso.con',
    'inverso.sin',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['supuestos', 'n_pequeno', 'unilateral', 'r_distinto', 'delta_grande'],
  salidas: SALIDAS,
  /**
   * Las dos entradas opcionales llegan al snippet de R SIEMPRE, con un valor
   * que R entiende: pérdidas vacías son 0 (no ajustar) y un n₁ vacío es 0,
   * valor imposible para un tamaño de muestra (el YAML exige ≥ 2), que el
   * snippet lee como «modo inverso apagado» y devuelve `NA_real_`. Se usa 0 y
   * no `NaN` porque así el caso «sin n dado» viaja a los fixtures y lo valida
   * R, en vez de quedarse solo en las pruebas de TypeScript.
   */
  derivar(e) {
    return {
      perdidas: typeof e.perdidas === 'number' && Number.isFinite(e.perdidas) ? e.perdidas : 0,
      n_dado: typeof e.n_dado === 'number' && Number.isFinite(e.n_dado) ? e.n_dado : 0,
    };
  },
  validar(e) {
    const err: Record<string, string> = {};
    if (typeof e.delta !== 'number' || !Number.isFinite(e.delta)) err.delta = 'err_requerido';
    else if (e.delta === 0) err.delta = 'err_rango';
    if (typeof e.sigma !== 'number' || !Number.isFinite(e.sigma)) err.sigma = 'err_requerido';
    else if (!(e.sigma > 0)) err.sigma = 'err_min';
    if (!(e.alfa >= 0.001 && e.alfa <= 0.2)) err.alfa = e.alfa < 0.001 ? 'err_min' : 'err_max';
    if (!esLateralidad(e.lateralidad)) err.lateralidad = 'err_opcion';
    if (!(e.poder >= 0.5 && e.poder <= 0.99)) err.poder = e.poder < 0.5 ? 'err_min' : 'err_max';
    if (!(e.r >= 0.1 && e.r <= 10)) err.r = typeof e.r === 'number' && e.r < 0.1 ? 'err_min' : 'err_max';
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
