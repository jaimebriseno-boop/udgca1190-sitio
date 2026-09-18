/**
 * Calculadora C3 · Tamaño de muestra para comparar dos proporciones
 * independientes (Fleiss, con y sin corrección de continuidad).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-dos-proporciones.yml.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { LATERALIDADES, ajustarPerdidas, techo } from '../metodos/muestra-comun.ts';
import type { Lateralidad } from '../metodos/muestra-comun.ts';
import {
  CORRECCIONES_CONTINUIDAD,
  N_DADO_MINIMO,
  SALIDAS_DOS_PROPORCIONES,
  muestraDosProporciones,
  poderFleiss,
} from '../metodos/muestra-proporciones.ts';
import type { CorreccionContinuidad, DisenoDosProporciones } from '../metodos/muestra-proporciones.ts';

export interface EntradasMuestraDosProporciones extends Entradas {
  p1: number;
  p2: number;
  alfa: number;
  /** Selector: 'bilateral' | 'unilateral'. */
  lateralidad: string;
  poder: number;
  /** Razón de asignación n₂/n₁. */
  r: number;
  /** Selector: 'si' | 'no' (corrección de continuidad). */
  correccion: string;
  perdidas: number;
  /**
   * Modo inverso: participantes ya disponibles en el grupo 1. 0 (el valor que
   * pone `derivar()` cuando el campo queda vacío) significa «sin modo inverso»,
   * igual que el 0 de `n_d`/`n_nd` en `valores-predictivos`. No puede viajar
   * como `NaN`/`NA` porque el marcador `{n_dado}` del snippet se rellena con el
   * `ejemplo` del YAML y con las entradas crudas de cada caso, y ni Zod ni JSON
   * admiten `NaN`.
   */
  n_dado: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_DOS_PROPORCIONES;

/** Tamaños por grupo que la tabla presenta como entero con el exacto en la nota. */
const TAMANOS = ['n1_fleiss', 'n2_fleiss', 'n1_cc', 'n2_cc', 'n1', 'n2'] as const;

/** Debajo de este número de eventos esperados la aproximación normal es dudosa (§C3). */
export const EVENTOS_MINIMOS = 5;

/** Diferencia de proporciones por debajo de la cual el tamaño de muestra se dispara (§C3). */
export const DIFERENCIA_MINIMA = 0.01;

/** Puntos de la curva de poder (la especificación pide al menos 40). */
const PUNTOS_CURVA = 48;

function esLateralidad(v: unknown): v is Lateralidad {
  return typeof v === 'string' && (LATERALIDADES as readonly string[]).includes(v);
}

function esCorreccion(v: unknown): v is CorreccionContinuidad {
  return typeof v === 'string' && (CORRECCIONES_CONTINUIDAD as readonly string[]).includes(v);
}

/** Entradas de la interfaz → parámetros del diseño, ya acotados a sus tipos (lo garantiza `validar`). */
function disenoDe(e: EntradasMuestraDosProporciones): DisenoDosProporciones {
  return {
    p1: e.p1,
    p2: e.p2,
    alfa: e.alfa,
    lateralidad: esLateralidad(e.lateralidad) ? e.lateralidad : 'bilateral',
    poder: e.poder,
    r: e.r,
    correccion: esCorreccion(e.correccion) ? e.correccion : 'si',
    perdidas: typeof e.perdidas === 'number' && Number.isFinite(e.perdidas) ? e.perdidas : 0,
    nDado: typeof e.n_dado === 'number' && Number.isFinite(e.n_dado) ? e.n_dado : 0,
  };
}

/** No usa el nivel de confianza: todas las salidas son puntuales, sin intervalo. */
export function calcular(e: EntradasMuestraDosProporciones): Resultado<'muestra-dos-proporciones'> {
  const d = disenoDe(e);
  const v = muestraDosProporciones(d);

  // El aviso mira los eventos esperados con el n que se reporta, ya redondeado
  // hacia arriba: es el número con el que se va a reclutar.
  const n1 = techo(v.n1.valor);
  const n2 = techo(v.n2.valor);
  const escaso =
    Math.min(n1 * d.p1, n1 * (1 - d.p1), n2 * d.p2, n2 * (1 - d.p2)) < EVENTOS_MINIMOS;

  const avisos: Resultado['avisos'] = [{ codigo: 'supuestos', severidad: 'info' }];
  if (Math.abs(d.p1 - d.p2) < DIFERENCIA_MINIMA) avisos.push({ codigo: 'diferencia_minima', severidad: 'aviso' });
  if (escaso) avisos.push({ codigo: 'aproximacion_dudosa', severidad: 'aviso' });
  if (d.lateralidad === 'unilateral') avisos.push({ codigo: 'unilateral', severidad: 'info' });
  if (d.r !== 1) avisos.push({ codigo: 'r_distinto', severidad: 'info' });

  return {
    calculadora: 'muestra-dos-proporciones',
    version: 1,
    entradas: {
      p1: d.p1,
      p2: d.p2,
      alfa: d.alfa,
      lateralidad: d.lateralidad,
      poder: d.poder,
      r: d.r,
      correccion: d.correccion,
      perdidas: d.perdidas,
      n_dado: d.nDado,
    },
    valores: { ...v },
    bandas: {
      correccion: d.correccion,
      // Tres estados, no dos: con grupos iguales las comparaciones de R pueden
      // seguir sin existir, porque cada una busca la raíz dentro de un
      // intervalo acotado (pwr se detiene en 1e9). Confundir ese caso con
      // «grupos desiguales» hacía que la página diera un motivo falso.
      comparacion:
        d.r !== 1
          ? 'r'
          : Number.isFinite(v.n_ppt.valor) && Number.isFinite(v.n_pwr_h.valor)
            ? 'igual'
            : 'sin_solucion',
      perdidas: d.perdidas > 0 ? 'con' : 'sin',
      inverso: d.nDado >= N_DADO_MINIMO ? 'con' : 'sin',
      lateralidad: d.lateralidad,
    },
    avisos,
  };
}

export function presentar(
  s: Resultado,
  e: EntradasMuestraDosProporciones,
  ctx: Contexto,
): Presentacion {
  const { fmt, textos } = ctx;
  const d = disenoDe(e);
  const v = s.valores;

  /** Entero del titular: el techo se aplica UNA vez, aquí, y por grupo. */
  const entero = (x: number): string => fmt.entero(techo(x));
  /**
   * «exacto 133.47»: el valor sin redondear que hay detrás de cada titular. Dos
   * decimales por encima de 1 y tres cifras significativas por debajo, que es el
   * convenio del grupo `muestra`: con un solo decimal, un 277.97 se imprimiría
   * «278.0», idéntico al techo que encabeza la celda, y el detalle dejaría de
   * explicar de dónde sale la cifra.
   */
  const exacto = (x: number): string =>
    rellenar(textos.etiquetas.nota_exacto, { exacto: fmt.num(x, Math.abs(x) >= 1 ? 'dec2' : 'sig3') });

  /**
   * h de Cohen. Tres decimales basta para los valores corrientes (−0.364), pero
   * una diferencia diminuta entre las proporciones da una h de 0.0002 que a tres
   * decimales se imprimiría «0.000»: un efecto nulo al lado de un tamaño de
   * muestra de cientos de millones. Por debajo de 0.1 se pasa a cifras
   * significativas, que es la misma regla que `formato.ts` aplica a las razones.
   */
  const hFormateada = (x: number): string => fmt.num(x, Math.abs(x) < 0.1 ? 'sig3' : 'dec3');

  // Los dos grupos se redondean por separado, así que el total a estudiar y el
  // total a reclutar son la SUMA de los grupos ya redondeados: es lo que se
  // recluta de verdad, y así la frase «n₁ y n₂, T en total» cuadra.
  const n1Techo = techo(v.n1.valor);
  const n2Techo = techo(v.n2.valor);
  const nTotalTecho = n1Techo + n2Techo;
  const n1Aj = ajustarPerdidas(v.n1.valor, d.perdidas);
  const n2Aj = ajustarPerdidas(v.n2.valor, d.perdidas);
  const nAjustadoTecho = techo(n1Aj) + techo(n2Aj);

  const igual = d.r === 1;
  const conInverso = d.nDado >= N_DADO_MINIMO;

  const vars: Record<string, string | number> = {
    p1: fmt.num(d.p1, 'pct1'),
    p2: fmt.num(d.p2, 'pct1'),
    alfa: fmt.num(d.alfa, 'sig3'),
    lateralidad: textos.etiquetas[`frase_lateralidad.${d.lateralidad}`],
    poder: fmt.num(d.poder, 'pct0'),
    r: fmt.num(d.r, 'sig3'),
    perdidas: fmt.num(d.perdidas, 'pct0'),
    n1_techo: fmt.entero(n1Techo),
    n2_techo: fmt.entero(n2Techo),
    n_total_techo: fmt.entero(nTotalTecho),
    n1_fleiss_techo: entero(v.n1_fleiss.valor),
    n2_fleiss_techo: entero(v.n2_fleiss.valor),
    n1_cc_techo: entero(v.n1_cc.valor),
    n2_cc_techo: entero(v.n2_cc.valor),
    n_ajustado_techo: fmt.entero(nAjustadoTecho),
    n1_ajustado_techo: entero(n1Aj),
    n2_ajustado_techo: entero(n2Aj),
    n_ppt: entero(v.n_ppt.valor),
    n_pwr_h: entero(v.n_pwr_h.valor),
    h_cohen: hFormateada(v.h_cohen.valor),
    n_dado: fmt.entero(d.nDado),
    n2_dado: entero(d.r * d.nDado),
    poder_dado: fmt.num(v.poder_dado.valor, 'pct1'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // El párrafo de Métodos nombra la fórmula que se reportó y, si las hubo, las
  // pérdidas previstas; cada variante trae sus propias citas.
  vars.frase_correccion = rellenar(textos.interpretacion[`metodos_correccion.${d.correccion}`], vars, ctx.refs);
  vars.frase_perdidas = rellenar(
    textos.interpretacion[`metodos_perdidas.${d.perdidas > 0 ? 'con' : 'sin'}`],
    vars,
    ctx.refs,
  );

  // -------------------------------------------------------------------------
  // Celdas (en el orden de SALIDAS, que es el del JSON de R)
  // -------------------------------------------------------------------------
  const notaTamano: Record<(typeof TAMANOS)[number], string> = {
    n1_fleiss: textos.etiquetas.nota_fleiss,
    n2_fleiss: textos.etiquetas.nota_fleiss,
    n1_cc: textos.etiquetas.nota_cc,
    n2_cc: textos.etiquetas.nota_cc,
    n1: textos.etiquetas.nota_elegido,
    n2: textos.etiquetas.nota_elegido,
  };

  const celdas: Presentacion['celdas'] = {
    z_alfa: { valor: fmt.num(v.z_alfa.valor, 'dec3') },
    z_beta: { valor: fmt.num(v.z_beta.valor, 'dec3') },
  };
  for (const k of TAMANOS) {
    celdas[k] = {
      valor: entero(v[k].valor),
      nota: `${notaTamano[k]} · ${exacto(v[k].valor)}`,
    };
  }
  celdas.n1.clase = 'destacada';
  celdas.n2.clase = 'destacada';
  celdas.n_total = {
    valor: fmt.entero(nTotalTecho),
    nota: `${textos.etiquetas.nota_suma} · ${exacto(v.n_total.valor)}`,
    clase: 'destacada',
  };
  celdas.n_ajustado = {
    valor: fmt.entero(nAjustadoTecho),
    nota: `${textos.etiquetas.nota_suma} · ${exacto(v.n_ajustado.valor)}`,
  };
  // Las dos comparaciones suponen grupos iguales, pero esa no es la única razón
  // por la que pueden faltar: aun con r = 1, cada función de R busca la raíz
  // dentro de un intervalo acotado y un tamaño extremo se sale de él. Cada
  // motivo lleva su propio rótulo; dar el de «grupos iguales» cuando los grupos
  // SÍ lo son era explicar la ausencia con una causa falsa.
  // Se insertan en el orden de SALIDAS, con el h de Cohen entre las dos.
  const comparacion = (x: number): Presentacion['celdas'][string] =>
    Number.isFinite(x)
      ? { valor: entero(x), nota: `${textos.etiquetas.nota_comparacion} · ${exacto(x)}` }
      : {
          valor: textos.etiquetas.no_aplica,
          nota: igual ? textos.etiquetas.nota_sin_solucion : textos.etiquetas.nota_comparacion,
        };
  celdas.n_ppt = comparacion(v.n_ppt.valor);
  // El h de Cohen sí existe siempre: no depende del reparto entre los grupos.
  celdas.h_cohen = { valor: hFormateada(v.h_cohen.valor) };
  celdas.n_pwr_h = comparacion(v.n_pwr_h.valor);
  celdas.poder_dado = conInverso
    ? { valor: fmt.num(v.poder_dado.valor, 'pct1'), nota: textos.etiquetas.nota_inverso }
    : { valor: textos.etiquetas.no_aplica, nota: textos.etiquetas.nota_inverso };

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [
    textos.etiquetas[k],
    celdas[k].valor,
    celdas[k].ic ?? '',
  ]);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`correccion.${d.correccion}`], vars),
    // La banda ya distingue los tres estados (grupos desiguales, comparación
    // hecha, comparación fuera del alcance de R): el párrafo los sigue.
    rellenar(
      textos.interpretacion[
        s.bandas.comparacion === 'r'
          ? 'comparacion.r'
          : s.bandas.comparacion === 'sin_solucion'
            ? 'comparacion.sin_solucion'
            : 'comparacion'
      ],
      vars,
    ),
    rellenar(textos.interpretacion[`perdidas.${d.perdidas > 0 ? 'con' : 'sin'}`], vars),
    rellenar(textos.interpretacion[`inverso.${conInverso ? 'con' : 'sin'}`], vars),
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
 * Curva de poder frente al tamaño del grupo 1, de n₁/4 a 2·n₁ (nunca por debajo
 * de dos participantes), con el n₁ requerido marcado en vertical y el poder
 * objetivo como línea horizontal de referencia. Es la fórmula normal de Fleiss
 * sin corrección de continuidad, la misma del modo inverso.
 */
export function grafica(
  s: Resultado,
  e: EntradasMuestraDosProporciones,
  ctx: Contexto,
): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const d = disenoDe(e);
  const n1 = s.valores.n1.valor;
  const n1Techo = techo(n1);

  // Un diseño sin solución (diferencia prácticamente nula) daría un dominio no
  // representable: se dibuja entonces un tramo convencional, para que la página
  // nunca se quede sin gráfica.
  const util = Number.isFinite(n1) && n1 > 0;
  const desde = util ? Math.max(2, n1 / 4) : 2;
  const hasta = util ? Math.max(2 * n1, desde + 1, n1Techo + 1) : 100;

  const puntos: Array<[number, number]> = [];
  for (let i = 0; i <= PUNTOS_CURVA; i += 1) {
    const x = desde + ((hasta - desde) * i) / PUNTOS_CURVA;
    puntos.push([x, poderFleiss(x, d)]);
  }

  const marcador = util
    ? {
        x: n1Techo,
        etiqueta: `${textos.etiquetas.grafica_marcador}: ${fmt.entero(n1Techo)}`,
        valores: { poder: poderFleiss(n1Techo, d) },
      }
    : undefined;

  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.grafica_poder,
    resumen: `${textos.etiquetas.grafica_poder}: ${textos.etiquetas.n1} = ${fmt.entero(n1Techo)} ${textos.etiquetas.n2} = ${fmt.entero(techo(s.valores.n2.valor))}; ${textos.etiquetas.poder} = ${fmt.num(d.poder, 'pct0')}.`,
    curvas: [{ id: 'poder', etiqueta: textos.etiquetas.grafica_poder, puntos, destacada: true }],
    ejeX: { etiqueta: textos.etiquetas.grafica_eje_x, dominio: [desde, hasta], pista: 'int' },
    ejeY: { etiqueta: textos.etiquetas.grafica_eje_y, dominio: [0, 1], pista: 'pct0' },
    marcador,
    referenciaY: {
      valor: d.poder,
      etiqueta: `${textos.etiquetas.grafica_referencia}: ${fmt.num(d.poder, 'pct0')}`,
    },
  };
}

/** Código de error de un número que debe caer en un rango cerrado. */
function fueraDeRango(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'err_numero';
  if (v < min) return 'err_min';
  if (v > max) return 'err_max';
  return null;
}

export const definicion: Definicion<EntradasMuestraDosProporciones> = {
  id: 'muestra-dos-proporciones',
  motor: 'ts',
  claves: [
    'resumen',
    'correccion.si',
    'correccion.no',
    'comparacion',
    'comparacion.r',
    'comparacion.sin_solucion',
    'perdidas.con',
    'perdidas.sin',
    'inverso.con',
    'inverso.sin',
    'metodos_correccion.si',
    'metodos_correccion.no',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['supuestos', 'diferencia_minima', 'aproximacion_dudosa', 'unilateral', 'r_distinto'],
  salidas: SALIDAS,
  // Los dos campos opcionales llegan siempre al snippet de R con un número: las
  // pérdidas vacías son 0 y el modo inverso apagado es 0 participantes.
  derivar(e) {
    return {
      perdidas: typeof e.perdidas === 'number' && Number.isFinite(e.perdidas) ? e.perdidas : 0,
      n_dado: typeof e.n_dado === 'number' && Number.isFinite(e.n_dado) ? e.n_dado : 0,
    };
  },
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of ['p1', 'p2'] as const) {
      if (!(typeof e[k] === 'number' && e[k] > 0 && e[k] < 1)) err[k] = 'err_proporcion';
    }
    // Sin diferencia no hay nada que detectar: la fórmula dividiría entre cero.
    if (!err.p1 && !err.p2 && e.p1 === e.p2) err.p2 = 'err_rango';

    const rangos = [
      ['alfa', e.alfa, 0.001, 0.2],
      ['poder', e.poder, 0.5, 0.99],
      ['r', e.r, 0.1, 10],
      ['perdidas', e.perdidas, 0, 0.5],
    ] as const;
    for (const [id, valor, min, max] of rangos) {
      const codigo = fueraDeRango(valor, min, max);
      if (codigo) err[id] = codigo;
    }

    if (!esLateralidad(e.lateralidad)) err.lateralidad = 'err_opcion';
    if (!esCorreccion(e.correccion)) err.correccion = 'err_opcion';

    // 0 (y 1, que no es un grupo) apagan el modo inverso; cualquier otro valor
    // debe ser un entero no negativo.
    if (typeof e.n_dado !== 'number' || !Number.isInteger(e.n_dado)) err.n_dado = 'err_entero';
    else if (e.n_dado < 0) err.n_dado = 'err_min';

    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
