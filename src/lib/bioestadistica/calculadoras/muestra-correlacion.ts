/**
 * Calculadora C7 · Tamaño de muestra para detectar una correlación de Pearson
 * con la transformación z de Fisher (y `pwr::pwr.r.test` como comparación).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-correlacion.yml.
 */
import type {
  Contexto,
  Curva,
  DatosGrafica,
  Definicion,
  Entradas,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { LATERALIDADES, techo } from '../metodos/muestra-comun.ts';
import type { Lateralidad } from '../metodos/muestra-comun.ts';
import {
  N_MINIMO_CORRELACION,
  R_MAXIMO,
  R_PEQUENA,
  SALIDAS_CORRELACION,
  muestraCorrelacion,
  poderClasico,
} from '../metodos/muestra-correlacion.ts';

export interface EntradasMuestraCorrelacion extends Entradas {
  r: number;
  alfa: number;
  /** 'bilateral' | 'unilateral'. */
  lateralidad: string;
  poder: number;
  /** Pérdidas previstas; vacío = 0. */
  perdidas: number;
  /** Pares ya disponibles para el modo inverso; vacío = 0 («no capturado»). */
  n_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_CORRELACION;

/**
 * Tamaños de muestra: el techo va en el titular y el valor exacto en la nota.
 * Dos decimales, no uno: con un decimal, 195.96 se escribiría «196.0», idéntico
 * al techo, y el detalle dejaría de explicar de dónde sale. Por debajo de 1, dos
 * decimales dirían «0.00» y harían creer que no hace falta nadie, así que ahí
 * mandan las cifras significativas. Convenio común a las siete calculadoras del
 * grupo `muestra`.
 */
const TAMANOS = ['n_clasico', 'n_pwr', 'n_ajustado'] as const;

/** Puntos de la curva de poder (de n/4 a 2n). */
const PASOS_CURVA = 60;

function esLateralidad(v: unknown): v is Lateralidad {
  return typeof v === 'string' && (LATERALIDADES as readonly string[]).includes(v);
}

/** Lateralidad declarada, con la bilateral como valor por omisión (lo garantiza `validar`). */
function lateralidadDe(e: EntradasMuestraCorrelacion): Lateralidad {
  return esLateralidad(e.lateralidad) ? e.lateralidad : 'bilateral';
}

export function calcular(e: EntradasMuestraCorrelacion): Resultado<'muestra-correlacion'> {
  const lateralidad = lateralidadDe(e);
  const perdidas = typeof e.perdidas === 'number' ? e.perdidas : 0;
  const nDado = typeof e.n_dado === 'number' ? e.n_dado : 0;
  const v = muestraCorrelacion({ r: e.r, alfa: e.alfa, lateralidad, poder: e.poder, perdidas, n_dado: nDado });

  // Las dos rutas responden a la misma pregunta; lo que se avisa es la
  // diferencia que verá el usuario, o sea la de los enteros ya redondeados.
  const dif = Math.abs(techo(v.n_pwr) - techo(v.n_clasico));

  const avisos: Resultado['avisos'] = [{ codigo: 'supuestos', severidad: 'info' }];
  if (Math.abs(e.r) < R_PEQUENA) avisos.push({ codigo: 'r_pequena', severidad: 'aviso' });
  if (lateralidad === 'unilateral') avisos.push({ codigo: 'unilateral', severidad: 'info' });
  // Una muestra de 1 a 3 pares es demasiado corta para la z de Fisher: el modo
  // inverso queda sin valor y hay que decir por qué.
  if (nDado > 0 && nDado < N_MINIMO_CORRELACION) {
    avisos.push({ codigo: 'n_dado_corto', severidad: 'aviso', params: { minimo: N_MINIMO_CORRELACION } });
  }
  if (dif >= 1) avisos.push({ codigo: 'pwr_difiere', severidad: 'info', params: { dif } });

  return {
    calculadora: 'muestra-correlacion',
    version: 1,
    entradas: { r: e.r, alfa: e.alfa, lateralidad, poder: e.poder, perdidas, n_dado: nDado },
    valores: {
      z_alfa: { valor: v.z_alfa, metodo: 'normal' },
      z_beta: { valor: v.z_beta, metodo: 'normal' },
      c_fisher: { valor: v.c_fisher, metodo: 'fisher-z' },
      n_clasico: { valor: v.n_clasico, metodo: 'fisher-z' },
      n_pwr: { valor: v.n_pwr, metodo: 'fisher-z' },
      n_ajustado: { valor: v.n_ajustado, metodo: 'fisher-z' },
      poder_dado: { valor: v.poder_dado, metodo: 'fisher-z' },
    },
    bandas: {
      perdidas: perdidas > 0 ? 'con' : 'sin',
      inverso: nDado >= N_MINIMO_CORRELACION ? 'con' : 'sin',
      // `pwr.r.test` se detiene cuando ni el mínimo de cuatro pares se queda por
      // debajo del poder pedido: entonces no hay comparación que mostrar.
      pwr: Number.isFinite(v.n_pwr) ? 'con' : 'sin',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMuestraCorrelacion, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const v = s.valores;
  const lateralidad = lateralidadDe(e);
  const perdidas = typeof e.perdidas === 'number' ? e.perdidas : 0;
  const nDado = typeof e.n_dado === 'number' ? e.n_dado : 0;

  /**
   * El techo se aplica UNA sola vez, aquí: la biblioteca nunca redondea. Un
   * valor no definido (el `n_pwr` que `pwr.r.test` no resuelve) se lee «no
   * definido», que es lo que escribe el formateador para `NaN`.
   */
  const conTecho = (k: (typeof TAMANOS)[number]): string =>
    Number.isFinite(v[k].valor) ? fmt.entero(techo(v[k].valor)) : fmt.num(v[k].valor, 'int');
  const exacto = (k: (typeof TAMANOS)[number]): string =>
    rellenar(textos.etiquetas.exacto, { valor: fmt.num(v[k].valor, v[k].valor < 1 ? 'sig3' : 'dec2') });
  /** Sin n disponible el poder inverso no existe: se lee «sin n disponible», no «no definido». */
  const poderDado = Number.isNaN(v.poder_dado.valor)
    ? textos.etiquetas.no_aplica
    : fmt.num(v.poder_dado.valor, 'pct1');

  const vars: Record<string, string | number> = {
    r: fmt.num(e.r, 'dec2'),
    alfa: fmt.num(e.alfa, 'dec3'),
    lateralidad: textos.etiquetas[`frase.${lateralidad}`],
    poder: fmt.num(e.poder, 'pct0'),
    perdidas: fmt.num(perdidas, 'pct0'),
    n_dado: fmt.entero(nDado),
    z_alfa: fmt.num(v.z_alfa.valor, 'dec3'),
    z_beta: fmt.num(v.z_beta.valor, 'dec3'),
    c_fisher: fmt.num(v.c_fisher.valor, 'dec4'),
    n_clasico_techo: conTecho('n_clasico'),
    n_clasico_exacto: fmt.num(v.n_clasico.valor, v.n_clasico.valor < 1 ? 'sig3' : 'dec2'),
    n_pwr_techo: conTecho('n_pwr'),
    n_ajustado_techo: conTecho('n_ajustado'),
    poder_dado: poderDado,
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // El párrafo de Métodos cambia según se prevean pérdidas y según pwr responda.
  vars.metodos_perdidas = rellenar(textos.interpretacion[`metodos_perdidas.${s.bandas.perdidas}`], vars);
  vars.metodos_pwr = rellenar(textos.interpretacion[`metodos_pwr.${s.bandas.pwr}`], vars, ctx.refs);

  // El orden de inserción es el de SALIDAS: la página pinta las celdas en el
  // orden del objeto, y ese orden es el del JSON de R y el de las etiquetas.
  const celdas: Presentacion['celdas'] = {
    z_alfa: { valor: fmt.num(v.z_alfa.valor, 'dec3') },
    z_beta: { valor: fmt.num(v.z_beta.valor, 'dec3') },
    c_fisher: { valor: fmt.num(v.c_fisher.valor, 'dec4') },
    n_clasico: { valor: conTecho('n_clasico'), nota: exacto('n_clasico'), clase: 'destacada' },
    n_pwr: { valor: conTecho('n_pwr'), nota: textos.etiquetas.nota_pwr, ...(s.bandas.pwr === 'sin' ? { clase: 'invalida' as const } : {}) },
    n_ajustado: { valor: conTecho('n_ajustado'), nota: exacto('n_ajustado'), clase: 'destacada' },
    poder_dado: { valor: poderDado },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`comparacion.${s.bandas.pwr}`], vars),
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
 * Curva de poder frente al número de pares, por la fórmula clásica, de n/4 a
 * 2n: el punto marcado es el tamaño calculado y la línea horizontal, el poder
 * objetivo. La curva arranca en cuatro pares porque por debajo la z de Fisher
 * no existe (el error estándar va con 1/√(n − 3)).
 *
 * Con una correlación grande y exigencias flojas (r = 0.90, α = 0.20
 * unilateral, poder 0.50) la fórmula devuelve n = 3.33, por debajo de ese
 * mínimo. El marcador se lleva entonces a los cuatro pares, que es justo el
 * techo que muestra la tabla: dejarlo en 3.33 lo sacaba del dominio del eje y
 * su rótulo se dibujaba fuera del lienzo.
 */
export function grafica(s: Resultado, e: EntradasMuestraCorrelacion, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const v = s.valores;
  const c = v.c_fisher.valor;
  const za = v.z_alfa.valor;
  const n = Math.max(v.n_clasico.valor, N_MINIMO_CORRELACION);
  const desde = Math.max(N_MINIMO_CORRELACION, n / 4);
  const hasta = 2 * n;

  const puntos: Array<[number, number]> = [];
  for (let i = 0; i <= PASOS_CURVA; i += 1) {
    const x = desde + ((hasta - desde) * i) / PASOS_CURVA;
    puntos.push([x, poderClasico(c, x, za)]);
  }

  const curvas: Curva[] = [{ id: 'poder', etiqueta: textos.etiquetas.curva_poder, puntos, destacada: true }];

  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.n_clasico,
    resumen: `${textos.etiquetas.marcador_n} ${fmt.entero(techo(v.n_clasico.valor))} ${textos.etiquetas.eje_n}; ${textos.etiquetas.ref_poder} ${fmt.num(e.poder, 'pct0')}.`,
    curvas,
    ejeX: { etiqueta: textos.etiquetas.eje_n, dominio: [desde, hasta], pista: 'int' },
    ejeY: { etiqueta: textos.etiquetas.eje_poder, dominio: [0, 1], pista: 'pct0' },
    marcador: {
      x: n,
      etiqueta: textos.etiquetas.marcador_n,
      valores: { poder: poderClasico(c, n, za) },
    },
    referenciaY: { valor: e.poder, etiqueta: textos.etiquetas.ref_poder },
  };
}

export const definicion: Definicion<EntradasMuestraCorrelacion> = {
  id: 'muestra-correlacion',
  motor: 'ts',
  claves: [
    'resumen',
    'comparacion.con',
    'comparacion.sin',
    'perdidas.con',
    'perdidas.sin',
    'inverso.con',
    'inverso.sin',
    'metodos_pwr.con',
    'metodos_pwr.sin',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['supuestos', 'r_pequena', 'unilateral', 'pwr_difiere', 'n_dado_corto'],
  salidas: SALIDAS,
  // Unas pérdidas vacías valen 0 y un n no capturado vale 0 («no disponible»,
  // igual que los tamaños del estudio de validación en `valores-predictivos`):
  // así el snippet de R siempre tiene sus marcadores y la URL conserva lo
  // capturado. R devuelve `NA_real_` para el poder inverso cuando n_dado < 4.
  derivar(e) {
    return {
      perdidas: typeof e.perdidas === 'number' ? e.perdidas : 0,
      n_dado: typeof e.n_dado === 'number' ? e.n_dado : 0,
    };
  },
  validar(e) {
    const err: Record<string, string> = {};
    if (!(typeof e.r === 'number' && e.r >= -R_MAXIMO && e.r <= R_MAXIMO)) err.r = 'err_rango';
    else if (e.r === 0) err.r = 'err_rango';
    if (!(typeof e.alfa === 'number' && e.alfa >= 0.001 && e.alfa <= 0.2)) err.alfa = 'err_rango';
    if (!esLateralidad(e.lateralidad)) err.lateralidad = 'err_opcion';
    if (!(typeof e.poder === 'number' && e.poder >= 0.5 && e.poder <= 0.99)) err.poder = 'err_rango';
    if (!(typeof e.perdidas === 'number' && e.perdidas >= 0 && e.perdidas <= 0.5)) err.perdidas = 'err_rango';
    // 0 es «no capturado» y de 1 a 3 pares la z de Fisher no está definida, pero
    // ninguno de los dos invalida el campo: lo dice el aviso `n_dado_corto`.
    if (!Number.isInteger(e.n_dado) || e.n_dado < 0) err.n_dado = 'err_entero';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
