/**
 * Calculadora D5 · Media y desviación estándar estimadas a partir de la
 * mediana, el rango o el rango intercuartílico (Luo 2018, Wan 2014, Hozo 2005).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/media-desde-mediana.yml.
 */
import type {
  CajaResumen,
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  MarcadorX,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { bandaAsimetriaResumen } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import {
  CAMPOS_ESCENARIO,
  ESCENARIOS_RESUMEN,
  N_MINIMO,
  admiteHozo,
  cocienteMasExtremo,
  cocienteParaBanda,
  estimarDesdeResumen,
} from '../metodos/resumenes.ts';
import type { EscenarioResumen, ResumenReportado } from '../metodos/resumenes.ts';

export interface EntradasMediaDesdeMediana extends Entradas {
  /** 's1' (mín, mediana, máx), 's2' (Q₁, mediana, Q₃) o 's3' (los cinco). */
  escenario: string;
  n: number;
  /** Extremos y cuartiles; `NaN` = «no capturado», que viaja a R como `NA`. */
  min: number;
  q1: number;
  mediana: number;
  q3: number;
  max: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = ['media_luo', 'media_wan', 'media_hozo', 'de_wan', 'de_hozo', 'asim_rango', 'asim_iqr'] as const;
export type SalidaMediaDesdeMediana = (typeof SALIDAS)[number];

/** Por debajo de 10 participantes las tres conversiones son poco fiables. */
export const N_POCO_FIABLE = 10;

/**
 * Formato de las cantidades en las unidades de la variable y de los cocientes:
 * cuatro cifras significativas, como en `descriptivos`, para que un resumen de
 * enteros («mediana 6, rango de 2 a 21») no se lea con decimales inventados.
 */
const PISTA_VALOR = 'sig4';

/** Campos del resumen que la interfaz puede dejar vacíos y el snippet de R recibe como `NA`. */
const OPCIONALES = ['min', 'q1', 'q3', 'max'] as const;

/** Escenario declarado, ya acotado al tipo del método (lo garantiza `validar`). */
function escenarioDe(e: EntradasMediaDesdeMediana): EscenarioResumen {
  return e.escenario as EscenarioResumen;
}

/** El resumen reportado tal como lo consumen los métodos (los ausentes llegan como `NaN`). */
function resumenDe(e: EntradasMediaDesdeMediana): ResumenReportado {
  return { min: e.min, q1: e.q1, mediana: e.mediana, q3: e.q3, max: e.max };
}

/** No usa el nivel de confianza: los tres métodos dan estimaciones puntuales, sin intervalo. */
export function calcular(e: EntradasMediaDesdeMediana): Resultado<'media-desde-mediana'> {
  const escenario = escenarioDe(e);
  const r = resumenDe(e);
  const v = estimarDesdeResumen(r, e.n, escenario);

  const valores: Record<string, Estimacion> = {
    media_luo: { valor: v.media_luo, metodo: 'luo-2018' },
    media_wan: { valor: v.media_wan, metodo: 'wan-2014' },
    media_hozo: { valor: v.media_hozo, metodo: 'hozo-2005' },
    de_wan: { valor: v.de_wan, metodo: 'wan-2014' },
    de_hozo: { valor: v.de_hozo, metodo: 'hozo-2005' },
    asim_rango: { valor: v.asim_rango, metodo: 'puntual' },
    asim_iqr: { valor: v.asim_iqr, metodo: 'puntual' },
  };

  // Un resumen constante da cocientes 0/0: como estimación es «no definido»
  // (NaN, igual que en R), pero como lectura es simetría perfecta, así que la
  // banda lo recibe como 1 y el aviso `rango_cero` explica el caso.
  const degRango = r.max === r.mediana && r.mediana === r.min;
  const degIqr = r.q3 === r.mediana && r.mediana === r.q1;
  const conHozo = admiteHozo(escenario);
  const cocienteRango = cocienteParaBanda(v.asim_rango, degRango);
  const cocienteIqr = cocienteParaBanda(v.asim_iqr, degIqr);
  const cociente =
    escenario === 's1' ? cocienteRango : escenario === 's2' ? cocienteIqr : cocienteMasExtremo(cocienteRango, cocienteIqr);
  const asimetria = bandaAsimetriaResumen(cociente);
  const constante = escenario === 's1' ? degRango : escenario === 's2' ? degIqr : degRango && degIqr;

  // La interfaz muestra los cinco campos siempre, así que un cuartil capturado
  // en S1 (o un extremo en S2) no entra en ninguna fórmula y desaparecería sin
  // decir nada. `derivar()` no lo borra: sigue viajando al snippet de R y a la
  // URL; el aviso es lo que hace visible que no cuenta.
  const ignorados = OPCIONALES.filter(
    (campo) => !CAMPOS_ESCENARIO[escenario].includes(campo) && Number.isFinite(r[campo]),
  );

  const avisos: Resultado['avisos'] = [];
  if (asimetria === 'marcada') avisos.push({ codigo: 'asimetria_marcada', severidad: 'aviso' });
  if (e.n < N_POCO_FIABLE) avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n: e.n } });
  if (!conHozo) avisos.push({ codigo: 'hozo_no_aplica', severidad: 'info' });
  if (ignorados.length > 0) avisos.push({ codigo: 'campos_ignorados', severidad: 'info' });
  if (constante) avisos.push({ codigo: 'rango_cero', severidad: 'info' });

  return {
    calculadora: 'media-desde-mediana',
    version: 1,
    entradas: { escenario, n: e.n, min: e.min, q1: e.q1, mediana: e.mediana, q3: e.q3, max: e.max },
    valores,
    bandas: { escenario, asimetria, hozo: conHozo ? 'aplica' : 'no_aplica' },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMediaDesdeMediana, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  /**
   * Un valor que el escenario no produce (`NaN`, el `NA` de R) se lee «no
   * aplica». Un infinito sí es un resultado: aparece cuando la mediana coincide
   * con un cuartil o con un extremo, y el formateador lo escribe como «∞».
   */
  const cifra = (x: number): string => (Number.isNaN(x) ? textos.etiquetas.no_aplica : fmt.num(x, PISTA_VALOR));

  const vars: Record<string, string | number> = {
    n: fmt.entero(e.n),
    min: cifra(e.min),
    q1: cifra(e.q1),
    mediana: cifra(e.mediana),
    q3: cifra(e.q3),
    max: cifra(e.max),
    media_luo: cifra(v.media_luo.valor),
    media_wan: cifra(v.media_wan.valor),
    media_hozo: cifra(v.media_hozo.valor),
    de_wan: cifra(v.de_wan.valor),
    de_hozo: cifra(v.de_hozo.valor),
    asim_rango: cifra(v.asim_rango.valor),
    asim_iqr: cifra(v.asim_iqr.valor),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // El párrafo de Métodos nombra los estadísticos de partida según el escenario.
  vars.resumen_frase = textos.interpretacion[`metodos_resumen.${s.bandas.escenario}`];

  const notaHozo = textos.etiquetas.nota_hozo;
  // El orden de inserción es el de `SALIDAS`: la página pinta las celdas en el
  // orden del objeto, y ese orden es el del JSON de R y el de las etiquetas.
  const celdas: Presentacion['celdas'] = {
    media_luo: { valor: cifra(v.media_luo.valor), nota: ui.recomendado, clase: 'destacada' },
    media_wan: { valor: cifra(v.media_wan.valor) },
    media_hozo: {
      valor: cifra(v.media_hozo.valor),
      nota: Number.isNaN(v.media_hozo.valor) ? notaHozo : undefined,
    },
    de_wan: { valor: cifra(v.de_wan.valor), nota: ui.recomendado, clase: 'destacada' },
    de_hozo: {
      valor: cifra(v.de_hozo.valor),
      nota: Number.isNaN(v.de_hozo.valor) ? notaHozo : undefined,
    },
    asim_rango: { valor: cifra(v.asim_rango.valor), nota: textos.etiquetas.nota_asimetria },
    asim_iqr: { valor: cifra(v.asim_iqr.valor), nota: textos.etiquetas.nota_asimetria },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion[`resumen.${s.bandas.escenario}`], vars),
    rellenar(textos.interpretacion.comparacion, vars),
    rellenar(textos.interpretacion[`asimetria.${s.bandas.asimetria}`], vars),
    rellenar(textos.interpretacion.uso, vars),
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
 * Caja del escenario. Sin cuartiles (S1) la caja se dibuja de la mediana a la
 * mediana, o sea una sola línea, y los bigotes llegan al mínimo y al máximo;
 * sin extremos (S2) los propios cuartiles hacen de extremos y de bigotes, que es
 * todo lo que el estudio reportó. Ninguna de las dos inventa datos: dibujan solo
 * lo que hay.
 */
function cajaDe(r: ResumenReportado, escenario: EscenarioResumen): CajaResumen {
  if (escenario === 's1') {
    return {
      min: r.min,
      q1: r.mediana,
      mediana: r.mediana,
      q3: r.mediana,
      max: r.max,
      bigoteInf: r.min,
      bigoteSup: r.max,
      atipicos: [],
    };
  }
  if (escenario === 's2') {
    return {
      min: r.q1,
      q1: r.q1,
      mediana: r.mediana,
      q3: r.q3,
      max: r.q3,
      bigoteInf: r.q1,
      bigoteSup: r.q3,
      atipicos: [],
    };
  }
  return {
    min: r.min,
    q1: r.q1,
    mediana: r.mediana,
    q3: r.q3,
    max: r.max,
    bigoteInf: r.min,
    bigoteSup: r.max,
    atipicos: [],
  };
}

/**
 * Diagrama de caja del resumen reportado, la curva normal que las fórmulas
 * suponen (N(media de Luo, DE de Wan²)) y un marcador por método de media. Sin
 * `bins`: no hay datos crudos que contar, solo el resumen publicado.
 */
export function grafica(s: Resultado, e: EntradasMediaDesdeMediana, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const escenario = escenarioDe(e);
  const r = resumenDe(e);
  const caja = cajaDe(r, escenario);
  const v = s.valores;

  const marcadores: MarcadorX[] = [
    { id: 'media_luo', etiqueta: textos.etiquetas.grafica_media_luo, x: v.media_luo.valor, destacada: true },
    { id: 'media_wan', etiqueta: textos.etiquetas.grafica_media_wan, x: v.media_wan.valor },
  ];
  if (Number.isFinite(v.media_hozo.valor)) {
    marcadores.push({ id: 'media_hozo', etiqueta: textos.etiquetas.grafica_media_hozo, x: v.media_hozo.valor });
  }

  const deWan = v.de_wan.valor;
  const normal =
    Number.isFinite(deWan) && deWan > 0
      ? { media: v.media_luo.valor, de: deWan, etiqueta: textos.etiquetas.grafica_normal }
      : undefined;

  return {
    tipo: 'histograma-boxplot',
    titulo: textos.grafica_titulo ?? textos.etiquetas.mediana,
    resumen: `${textos.etiquetas.mediana} ${fmt.num(r.mediana, PISTA_VALOR)}; ${textos.etiquetas.media_luo}: ${fmt.num(v.media_luo.valor, PISTA_VALOR)}; ${textos.etiquetas.de_wan}: ${fmt.num(deWan, PISTA_VALOR)}.`,
    ejeX: { etiqueta: textos.etiquetas.eje_x, dominio: [caja.min, caja.max], pista: 'dec1' },
    caja,
    normal,
    marcadores,
  };
}

export const definicion: Definicion<EntradasMediaDesdeMediana> = {
  id: 'media-desde-mediana',
  motor: 'ts',
  claves: [
    'resumen.s1',
    'resumen.s2',
    'resumen.s3',
    'comparacion',
    'asimetria.compatible',
    'asimetria.marcada',
    'uso',
    'metodos_resumen.s1',
    'metodos_resumen.s2',
    'metodos_resumen.s3',
  ],
  avisos: ['asimetria_marcada', 'n_pequeno', 'hozo_no_aplica', 'campos_ignorados', 'rango_cero'],
  salidas: SALIDAS,
  // Un extremo o un cuartil que el escenario no usa (y que el usuario no
  // capturó) vale `NaN`: así el snippet de R siempre tiene todos sus marcadores
  // y los recibe como `NA`, en vez de quedarse a medio rellenar.
  derivar(e) {
    const salida: Partial<EntradasMediaDesdeMediana> = {};
    for (const campo of OPCIONALES) {
      salida[campo] = typeof e[campo] === 'number' ? e[campo] : Number.NaN;
    }
    return salida;
  },
  validar(e) {
    const err: Record<string, string> = {};
    const escenario = e.escenario as EscenarioResumen;
    if (!ESCENARIOS_RESUMEN.includes(escenario)) {
      err.escenario = 'err_opcion';
    } else {
      // `err_min` lleva el mínimo declarado en el YAML (2), así que en S2 y S3
      // el mensaje queda genérico aunque el mínimo real sea 4: los cuartiles no
      // significan nada por debajo de cuatro observaciones.
      if (!Number.isInteger(e.n)) err.n = 'err_entero';
      else if (e.n < N_MINIMO[escenario]) err.n = 'err_min';

      let previo = Number.NEGATIVE_INFINITY;
      for (const campo of CAMPOS_ESCENARIO[escenario]) {
        const valor = e[campo];
        if (typeof valor !== 'number' || !Number.isFinite(valor)) {
          err[campo] = 'err_requerido';
          continue;
        }
        // Se reclama solo el campo que rompe el orden: la comparación sigue
        // desde él, para no arrastrar el error al resto de la secuencia.
        if (valor < previo) err[campo] = 'err_rango';
        previo = valor;
      }
    }
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
