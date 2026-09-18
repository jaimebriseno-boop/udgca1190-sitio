/**
 * Calculadora E3 · Curva de Kaplan-Meier, mediana de supervivencia y prueba de
 * log-rank. Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/kaplan-meier.yml.
 *
 * Es la primera calculadora con TRES columnas pegadas (`tiempo`, `evento` y
 * `grupo`, esta última opcional) y la primera que llena `Resultado.extras`: la
 * tabla de vida de cada grupo viaja como vectores de longitud variable, que el
 * comparador coteja elemento a elemento con el JSON de `survfit`.
 *
 * La numérica vive en `metodos/supervivencia.ts`, que reproduce a `survfit`,
 * `quantile.survfit` y `survdiff` regla por regla.
 */
import type {
  Contexto,
  CurvaKm,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  MarcadorX,
  PasoKm,
  Pista,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { decisionP } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import {
  CAMPOS_TABLA_KM,
  MAX_GRUPOS_KM,
  METODO_IC_KM,
  N_MIN_KM,
  SALIDAS_KM,
  TIPOS_IC_KM,
  codigosDeGrupo,
  columnaTablaVida,
  curvaDeGrupo,
  curvasCruzan,
  enRiesgoEn,
  logRank,
  medianaKm,
  supervivenciaEn,
  tablaVida,
  tiemposEnRiesgo,
} from '../metodos/supervivencia.ts';
import type { CurvaVida, TipoIcKm } from '../metodos/supervivencia.ts';

export interface EntradasKm extends Entradas {
  /** Columna de tiempos de seguimiento: al menos dos valores finitos ≥ 0. */
  tiempo: number[];
  /** Columna de indicadores de evento, 1 = evento y 0 = censura. */
  evento: number[];
  /** Columna de códigos de grupo; vacía = una sola curva. */
  grupo: number[];
  nivel: number;
  tipo_ic: string;
  /** Tiempos de interés para S(t); 0 = no se pidió (ver `tiempoPedido`). */
  t1: number;
  t2: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves del fixture. */
export const SALIDAS = SALIDAS_KM;

/** Por debajo de este número de eventos la curva y su banda son muy inestables. */
export const EVENTOS_MINIMOS = 5;

/** Fracción de censura a partir de la cual la cola de la curva deja de ser fiable. */
export const CENSURA_ALTA = 0.5;

/** Celda de una medida que no procede calcular (no es «no definido»: es que no aplica). */
const SIN_VALOR = '—';

/** Estimación «no definida» con la forma de las demás, para el grupo 2 ausente. */
function sinDato(nivel: number, tipoIC: TipoIcKm, conIc: boolean): Estimacion {
  const base = { valor: Number.NaN, metodo: conIc ? METODO_IC_KM[tipoIC] : ('puntual' as const) };
  return conIc ? { ...base, ic: [Number.NaN, Number.NaN], nivel } : base;
}

/** ¿La entrada es una columna de números finitos? */
function esColumna(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((q) => typeof q === 'number' && Number.isFinite(q));
}

/**
 * ¿Se pidió leer la curva en este tiempo de interés?
 *
 * `t1` y `t2` son opcionales, pero viajan al snippet de R como números: un caso
 * de fixture es JSON y no admite `NaN`, y el ejemplo del YAML lo valida Zod con
 * `z.number()`. El convenio es entonces 0 = «no se pidió», que no pierde nada
 * porque S(0) = 1 en cualquier curva. `derivar()` completa con 0 lo que falte.
 */
function tiempoPedido(t: number): boolean {
  return Number.isFinite(t) && t > 0;
}

/**
 * Curvas del cálculo, en orden de código ascendente (el grupo 1 es el del
 * código menor). Sin columna de grupo hay una sola curva, con el código 0, que
 * es lo que hace el snippet de R con `rep(0, length(tiempo))`.
 *
 * `calcular`, `presentar` y `grafica` parten de aquí, igual que `descriptivos`
 * recalcula sus cercas y sus clases: el módulo es puro y no guarda estado.
 */
export function curvasDe(e: EntradasKm, nivel: number): CurvaVida[] {
  const op = { nivel, tipoIC: e.tipo_ic as TipoIcKm };
  if (e.grupo.length === 0) return [tablaVida(e.tiempo, e.evento, op, 0)];
  return codigosDeGrupo(e.grupo).map((codigo) => curvaDeGrupo(e.tiempo, e.evento, e.grupo, codigo, op));
}

export function calcular(e: EntradasKm, nivel: number): Resultado<'kaplan-meier'> {
  const tipoIC = e.tipo_ic as TipoIcKm;
  const curvas = curvasDe(e, nivel);
  const primera = curvas[0] as CurvaVida;
  const segunda = curvas[1];
  const dos = segunda !== undefined;

  const mediana1 = medianaKm(primera);
  const mediana2 = dos ? medianaKm(segunda) : sinDato(nivel, tipoIC, true);
  const lr = dos ? logRank(e.tiempo, e.evento, e.grupo, codigosDeGrupo(e.grupo)) : undefined;
  // Sin varianza no hay prueba. `survdiff` se detiene con un sistema singular
  // cuando todos los eventos caen en un mismo tiempo, y cuando un grupo nunca
  // está en riesgo devuelve chisq = 0 con «0 degrees of freedom»: en los dos
  // casos el snippet y TypeScript reportan NA en chi2, gl y p.
  const logRankDefinido = lr !== undefined && lr.varianza > 0;
  const cruce = dos ? curvasCruzan(primera, segunda) : false;

  const valores: Record<string, Estimacion> = {
    n_1: { valor: primera.n, metodo: 'puntual' },
    eventos_1: { valor: primera.eventos, metodo: 'puntual' },
    mediana_1: mediana1,
    s_t1_1: tiempoPedido(e.t1) ? supervivenciaEn(primera, e.t1) : sinDato(nivel, tipoIC, true),
    s_t2_1: tiempoPedido(e.t2) ? supervivenciaEn(primera, e.t2) : sinDato(nivel, tipoIC, true),
    n_2: dos ? { valor: segunda.n, metodo: 'puntual' } : sinDato(nivel, tipoIC, false),
    eventos_2: dos ? { valor: segunda.eventos, metodo: 'puntual' } : sinDato(nivel, tipoIC, false),
    mediana_2: mediana2,
    s_t1_2: dos && tiempoPedido(e.t1) ? supervivenciaEn(segunda, e.t1) : sinDato(nivel, tipoIC, true),
    s_t2_2: dos && tiempoPedido(e.t2) ? supervivenciaEn(segunda, e.t2) : sinDato(nivel, tipoIC, true),
    chi2_logrank: { valor: lr?.chi2 ?? Number.NaN, metodo: 'puntual' },
    gl: { valor: lr?.gl ?? Number.NaN, metodo: 'puntual' },
    p_logrank: { valor: lr?.p ?? Number.NaN, metodo: 'puntual' },
  };

  // Tabla de vida por grupo: los mismos vectores que imprime el snippet de R.
  // El grupo que no existe da vectores vacíos, como el `numeric(0)` de R.
  const extras: Record<string, number[]> = {};
  for (const campo of CAMPOS_TABLA_KM) {
    extras[`${campo}_1`] = columnaTablaVida(primera, campo);
    extras[`${campo}_2`] = dos ? columnaTablaVida(segunda, campo) : [];
  }

  const nTotal = e.tiempo.length;
  const censurasTotal = curvas.reduce((suma, c) => suma + c.censuras, 0);
  const eventosMinimo = Math.min(...curvas.map((c) => c.eventos));
  // Cada curva tiene su propio seguimiento: un tiempo puede caer dentro de una y
  // fuera de la otra. El aviso se dispara si se sale de alguna, y dice de cuál,
  // porque «el seguimiento observado» no es un número único cuando hay dos curvas.
  const pedidos = [e.t1, e.t2].filter((t) => tiempoPedido(t));
  const fuera = pedidos.filter((t) => curvas.some((c) => t > c.tMax));
  const excedidas = curvas.filter((c) => pedidos.some((t) => t > c.tMax));

  const avisos: Resultado['avisos'] = [];
  if (!dos) avisos.push({ codigo: 'un_grupo', severidad: 'info' });
  if (eventosMinimo < EVENTOS_MINIMOS) {
    // Con una sola curva no hay log-rank del que hablar: el texto cambia.
    avisos.push({
      codigo: dos ? 'pocos_eventos.dos' : 'pocos_eventos.uno',
      severidad: 'aviso',
      params: { eventos: eventosMinimo, minimo: EVENTOS_MINIMOS },
    });
  }
  if (censurasTotal > CENSURA_ALTA * nTotal) {
    avisos.push({ codigo: 'censura_alta', severidad: 'info', params: { censuras: censurasTotal, n: nTotal } });
  }
  if (Number.isNaN(mediana1.valor) || (dos && Number.isNaN(mediana2.valor))) {
    avisos.push({ codigo: 'mediana_no_alcanzada', severidad: 'info' });
  }
  if (cruce) avisos.push({ codigo: 'curvas_cruzan', severidad: 'aviso' });
  if (dos && !logRankDefinido) avisos.push({ codigo: 'logrank_indefinido', severidad: 'aviso' });
  if (fuera.length > 0) {
    avisos.push({
      codigo: 't_fuera',
      severidad: 'aviso',
      params: {
        tiempos: fuera.join(', '),
        // Código de grupo y último tiempo observado de cada curva rebasada.
        detalle: excedidas.map((c) => `${c.codigo}: ${c.tMax}`).join(' · '),
      },
    });
  }

  return {
    calculadora: 'kaplan-meier',
    version: 1,
    entradas: { tiempo: e.tiempo, evento: e.evento, grupo: e.grupo, nivel, tipo_ic: e.tipo_ic, t1: e.t1, t2: e.t2 },
    valores,
    extras,
    bandas: {
      grupos: dos ? 'dos' : 'uno',
      mediana_1: Number.isNaN(mediana1.valor) ? 'no_alcanzada' : 'alcanzada',
      // Sin segunda curva no es que la mediana no se alcanzara: es que no existe.
      mediana_2: !dos ? 'sin_curva' : Number.isNaN(mediana2.valor) ? 'no_alcanzada' : 'alcanzada',
      logrank: dos && !logRankDefinido ? 'indefinido' : decisionP(valores.p_logrank?.valor ?? Number.NaN),
      cruce: cruce ? 'si' : 'no',
      censura: censurasTotal > 0 ? 'si' : 'no',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasKm, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  const nivel = v.mediana_1?.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const dos = s.bandas.grupos === 'dos';
  const curvas = curvasDe(e, nivel);
  const primera = curvas[0] as CurvaVida;
  const segunda = curvas[1];

  const nombreGrupo = (codigo: number): string =>
    rellenar(textos.etiquetas.grupo_nombre, { codigo: fmt.num(codigo, 'sig4') });
  const nombre1 = nombreGrupo(primera.codigo);
  const nombre2 = segunda ? nombreGrupo(segunda.codigo) : '';

  /**
   * El intervalo solo se escribe si al menos un límite existe: la mediana puede
   * no alcanzarse y tener límite inferior, y Ŝ(t) = 0 tiene estimación pero no
   * intervalo. Nunca se publica «no definido a no definido».
   */
  const icSiSirve = (est: Estimacion | undefined, pista: Pista): string | undefined => {
    if (!est?.ic || !est.ic.some((x) => Number.isFinite(x))) return undefined;
    return fmt.ic(est.ic, pista);
  };

  /** Paréntesis del intervalo dentro de una frase: « (IC 95 % 3 a 9)» o « (IC no definido)». */
  const fragmentoIc = (est: Estimacion | undefined, pista: Pista): string => {
    const ic = icSiSirve(est, pista);
    if (ic) return ` (${icNivel} ${ic})`;
    return ui.sin_ic ? ` (${ui.sin_ic})` : '';
  };

  /** «6 (IC 95 % 3 a 9)» o «no alcanzada»: la mediana como se lee en una frase. */
  const medianaTexto = (est: Estimacion | undefined): string => {
    if (!est || Number.isNaN(est.valor)) return textos.etiquetas.no_alcanzada;
    return `${fmt.num(est.valor, 'sig4')}${fragmentoIc(est, 'sig4')}`;
  };

  /** Frase de S(t) en un tiempo de interés; cadena vacía si no se pidió ese tiempo. */
  const fraseTiempo = (t: number, a: Estimacion | undefined, b: Estimacion | undefined): string => {
    if (!tiempoPedido(t)) return '';
    const sinA = !a || Number.isNaN(a.valor);
    const sinB = !b || Number.isNaN(b.valor);
    // Fuera del seguimiento de TODAS las curvas: no hay nada que publicar.
    if (sinA && (!dos || sinB)) {
      return rellenar(textos.interpretacion['tiempo.fuera'] as string, { t: fmt.num(t, 'sig4') });
    }
    const conEstimacion = sinA ? (b as Estimacion) : (a as Estimacion);
    const nombreCon = sinA ? nombre2 : nombre1;
    const base: Record<string, string> = {
      t: fmt.num(t, 'sig4'),
      grupo_1: nombreCon,
      s_1: fmt.num(conEstimacion.valor, 'pct1'),
      ic_1: fragmentoIc(conEstimacion, 'pct1'),
    };
    if (!dos) return rellenar(textos.interpretacion['tiempo.uno'] as string, base);
    // Una sola de las dos curvas llega hasta ahí: se nombra la que sí y se dice
    // de la otra que el tiempo le queda fuera, en vez de publicarle un «no definido».
    if (sinA || sinB) {
      return rellenar(textos.interpretacion['tiempo.parcial'] as string, {
        ...base,
        grupo_2: sinA ? nombre1 : nombre2,
      });
    }
    return rellenar(textos.interpretacion['tiempo.dos'] as string, {
      ...base,
      grupo_2: nombre2,
      s_2: fmt.num((b as Estimacion).valor, 'pct1'),
      ic_2: fragmentoIc(b, 'pct1'),
    });
  };

  // Lista de datos, no prosa: el separador es el mismo punto medio que usan las
  // notas de las celdas, para que no choque con la puntuación de la frase.
  const detalleCensura = curvas
    .map((c) => `${nombreGrupo(c.codigo)}: ${fmt.entero(c.censuras)}/${fmt.entero(c.n)}`)
    .join(' · ');
  const censurasTotal = curvas.reduce((suma, c) => suma + c.censuras, 0);
  const nTotal = curvas.reduce((suma, c) => suma + c.n, 0);

  const vars: Record<string, string | number> = {
    nivel: fmt.nivel(nivel),
    grupo_1: nombre1,
    grupo_2: nombre2,
    n_1: fmt.entero(v.n_1?.valor ?? Number.NaN),
    n_2: fmt.entero(v.n_2?.valor ?? Number.NaN),
    eventos_1: fmt.entero(v.eventos_1?.valor ?? Number.NaN),
    eventos_2: fmt.entero(v.eventos_2?.valor ?? Number.NaN),
    seguimiento_1: fmt.num(primera.tMax, 'sig4'),
    mediana_1: medianaTexto(v.mediana_1),
    mediana_2: medianaTexto(v.mediana_2),
    chi2_logrank: fmt.num(v.chi2_logrank?.valor ?? Number.NaN, 'dec3'),
    gl: fmt.entero(v.gl?.valor ?? Number.NaN),
    p_logrank: fmt.num(v.p_logrank?.valor ?? Number.NaN, 'p'),
    censuras_tot: fmt.entero(censurasTotal),
    n_tot: fmt.entero(nTotal),
    pct_censura: fmt.num(nTotal > 0 ? censurasTotal / nTotal : Number.NaN, 'pct1'),
    detalle_censura: detalleCensura,
    frase_t1: fraseTiempo(e.t1, v.s_t1_1, v.s_t1_2),
    frase_t2: fraseTiempo(e.t2, v.s_t2_1, v.s_t2_2),
    // La cita de Kalbfleisch y Prentice pertenece a la escala log-log, no a la
    // log: viaja dentro de la variante, no suelta en el párrafo de Métodos.
    escala_frase: rellenar(
      (textos.interpretacion[`escala.${e.tipo_ic}`] as string | undefined) ??
        textos.etiquetas[`tipo_ic.${e.tipo_ic}`] ??
        String(e.tipo_ic),
      {},
      ctx.refs,
    ),
    frase_logrank: dos ? rellenar(textos.interpretacion.metodos_logrank as string, {}, ctx.refs) : '',
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };

  const celdaMediana = (est: Estimacion | undefined, hay: boolean) => {
    if (!hay) return { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_grupo };
    const valor = !est || Number.isNaN(est.valor) ? textos.etiquetas.no_alcanzada : fmt.num(est.valor, 'sig4');
    return {
      valor,
      ic: icSiSirve(est, 'sig4'),
      nota: `${icNivel} · ${textos.etiquetas.nota_mediana}`,
      clase: 'destacada' as const,
    };
  };
  const celdaS = (est: Estimacion | undefined, t: number, hay: boolean) => {
    if (!hay) return { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_grupo };
    if (!tiempoPedido(t)) return { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_tiempo };
    if (!est || Number.isNaN(est.valor)) {
      return { valor: SIN_VALOR, nota: textos.etiquetas.nota_fuera, clase: 'invalida' as const };
    }
    return {
      valor: fmt.num(est.valor, 'pct1'),
      ic: icSiSirve(est, 'pct1'),
      nota: `${icNivel} · ${textos.etiquetas.nota_greenwood}`,
    };
  };
  const logRankDefinido = dos && s.bandas.logrank !== 'indefinido';
  const celdaLogRank = (valor: string) => {
    if (!dos) return { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_grupo };
    if (!logRankDefinido) return { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_logrank, clase: 'invalida' as const };
    return { valor, nota: textos.etiquetas.nota_logrank };
  };

  const celdas: Presentacion['celdas'] = {
    n_1: { valor: fmt.entero(v.n_1?.valor ?? Number.NaN) },
    eventos_1: { valor: fmt.entero(v.eventos_1?.valor ?? Number.NaN) },
    mediana_1: celdaMediana(v.mediana_1, true),
    s_t1_1: celdaS(v.s_t1_1, e.t1, true),
    s_t2_1: celdaS(v.s_t2_1, e.t2, true),
    n_2: dos ? { valor: fmt.entero(v.n_2?.valor ?? Number.NaN) } : { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_grupo },
    eventos_2: dos
      ? { valor: fmt.entero(v.eventos_2?.valor ?? Number.NaN) }
      : { valor: SIN_VALOR, nota: textos.etiquetas.nota_sin_grupo },
    mediana_2: celdaMediana(v.mediana_2, dos),
    s_t1_2: celdaS(v.s_t1_2, e.t1, dos),
    s_t2_2: celdaS(v.s_t2_2, e.t2, dos),
    chi2_logrank: celdaLogRank(fmt.num(v.chi2_logrank?.valor ?? Number.NaN, 'dec3')),
    gl: celdaLogRank(fmt.entero(v.gl?.valor ?? Number.NaN)),
    p_logrank: logRankDefinido
      ? { ...celdaLogRank(fmt.num(v.p_logrank?.valor ?? Number.NaN, 'p')), clase: 'destacada' as const }
      : celdaLogRank(fmt.num(v.p_logrank?.valor ?? Number.NaN, 'p')),
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [
    textos.etiquetas[k] as string,
    (celdas[k] as { valor: string }).valor,
    celdas[k]?.ic ?? '',
  ]);

  const interpretacion = [
    rellenar(textos.interpretacion[dos ? 'resumen.dos' : 'resumen.uno'] as string, vars),
    rellenar(textos.interpretacion[dos ? 'mediana.dos' : 'mediana.uno'] as string, vars),
    rellenar(textos.interpretacion[dos ? `logrank.${s.bandas.logrank}` : 'logrank.uno'] as string, vars),
    rellenar(textos.interpretacion[`censura.${s.bandas.censura}`] as string, vars),
  ];
  // Sin segunda curva no hay cruce del que hablar.
  if (dos) interpretacion.push(rellenar(textos.interpretacion[`cruce.${s.bandas.cruce}`] as string, vars));

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((a) => a.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, e: EntradasKm, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const nivel = s.valores.mediana_1?.nivel ?? ctx.nivel;
  const curvas = curvasDe(e, nivel);
  const tMax = Math.max(...curvas.map((c) => c.tMax));
  const tiemposRiesgo = tiemposEnRiesgo(tMax);

  const nombreGrupo = (codigo: number): string =>
    rellenar(textos.etiquetas.grupo_nombre, { codigo: fmt.num(codigo, 'sig4') });

  const curvasKm: CurvaKm[] = curvas.map((c, i) => {
    // El primer escalón es (0, 1): antes del primer evento la curva vale 1 y su
    // banda es degenerada, igual que la que dibuja plot.survfit.
    const pasos: PasoKm[] = [{ t: 0, s: 1, lo: 1, hi: 1 }];
    for (const paso of c.pasos) pasos.push({ t: paso.t, s: paso.s, lo: paso.lo, hi: paso.hi });
    return {
      id: `grupo_${i + 1}`,
      etiqueta: nombreGrupo(c.codigo),
      pasos,
      censuras: c.pasos.filter((paso) => paso.censuras > 0).map((paso) => paso.t),
      enRiesgo: tiemposRiesgo.map((t) => enRiesgoEn(c, t)),
      destacada: i === 0,
    };
  });

  const marcadores: MarcadorX[] = [];
  if (tiempoPedido(e.t1)) marcadores.push({ id: 't1', etiqueta: textos.etiquetas.grafica_t1, x: e.t1 });
  if (tiempoPedido(e.t2) && e.t2 !== e.t1) {
    marcadores.push({ id: 't2', etiqueta: textos.etiquetas.grafica_t2, x: e.t2 });
  }

  // Texto alternativo: lo que un lector de pantalla necesita para no perderse la
  // gráfica (tamaño, eventos y mediana de cada curva).
  const resumen = curvas
    .map((c, i) => {
      const mediana = s.valores[i === 0 ? 'mediana_1' : 'mediana_2'];
      const m = !mediana || Number.isNaN(mediana.valor) ? textos.etiquetas.no_alcanzada : fmt.num(mediana.valor, 'sig4');
      // Rótulos neutros: `eventos_1` y `mediana_1` nombran la PRIMERA curva y
      // rotularían mal la segunda.
      const partes = [
        `n = ${fmt.entero(c.n)}`,
        `${textos.etiquetas.grafica_eventos}: ${fmt.entero(c.eventos)}`,
        `${textos.etiquetas.grafica_mediana}: ${m}`,
      ];
      return `${nombreGrupo(c.codigo)} (${partes.join(', ')})`;
    })
    .join('; ');

  return {
    tipo: 'km',
    titulo: textos.grafica_titulo ?? textos.etiquetas.eje_y,
    resumen,
    curvas: curvasKm,
    ejeX: { etiqueta: textos.etiquetas.eje_x, dominio: [0, tMax > 0 ? tMax : 1], pista: 'sig4' },
    ejeY: { etiqueta: textos.etiquetas.eje_y, dominio: [0, 1], pista: 'pct0' },
    tiemposRiesgo,
    etiquetaRiesgo: textos.etiquetas.grafica_riesgo,
    marcadores: marcadores.length > 0 ? marcadores : undefined,
  };
}

export const definicion: Definicion<EntradasKm> = {
  id: 'kaplan-meier',
  motor: 'ts',
  claves: [
    'resumen.uno',
    'resumen.dos',
    'tiempo.uno',
    'tiempo.dos',
    'tiempo.parcial',
    'tiempo.fuera',
    'mediana.uno',
    'mediana.dos',
    'logrank.rechaza',
    'logrank.no_rechaza',
    'logrank.indefinido',
    'logrank.uno',
    'censura.si',
    'censura.no',
    'cruce.si',
    'cruce.no',
    'escala.log-log',
    'escala.log',
    'metodos_logrank',
  ],
  avisos: [
    'pocos_eventos.uno',
    'pocos_eventos.dos',
    'curvas_cruzan',
    'logrank_indefinido',
    'mediana_no_alcanzada',
    't_fuera',
    'un_grupo',
    'censura_alta',
  ],
  salidas: SALIDAS,
  derivar(e) {
    return {
      // Sin columna de grupo se estima una sola curva; el snippet lo traduce a
      // `rep(0, length(tiempo))` cuando el vector llega vacío.
      grupo: esColumna(e.grupo) ? e.grupo : [],
      // Un tiempo de interés que no se capturó viaja a R como 0, que el
      // snippet lee como «no se pidió» (ver `tiempoPedido`).
      t1: Number.isFinite(e.t1 as number) ? (e.t1 as number) : 0,
      t2: Number.isFinite(e.t2 as number) ? (e.t2 as number) : 0,
    };
  },
  validar(e) {
    const err: Record<string, string> = {};

    if (!Array.isArray(e.tiempo) || e.tiempo.length < N_MIN_KM) err.tiempo = 'err_n_min';
    else if (!esColumna(e.tiempo)) err.tiempo = 'err_numero';
    // `err_min` interpolaría el `min: 2` del YAML, que cuenta VALORES de la
    // columna, y el usuario leería «debe ser mayor o igual que 2».
    else if (e.tiempo.some((t) => t < 0)) err.tiempo = 'err_tiempo_negativo';
    const nFilas = Array.isArray(e.tiempo) ? e.tiempo.length : 0;

    if (!Array.isArray(e.evento) || e.evento.length !== nFilas || nFilas === 0) err.evento = 'err_longitud';
    else if (e.evento.length < N_MIN_KM) err.evento = 'err_n_min';
    else if (!e.evento.every((v) => v === 0 || v === 1)) err.evento = 'err_binario';
    // Sin ningún evento no hay curva que estimar: `survfit` devolvería la
    // meseta en 1 y ni la mediana ni el log-rank significarían nada.
    else if (e.evento.reduce((suma: number, v: number) => suma + v, 0) === 0) err.evento = 'err_sin_eventos';

    if (!esColumna(e.grupo)) err.grupo = 'err_numero';
    else if (e.grupo.length > 0 && e.grupo.length !== nFilas) err.grupo = 'err_longitud';
    else if (codigosDeGrupo(e.grupo).length > MAX_GRUPOS_KM) err.grupo = 'err_grupos';

    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    if (!TIPOS_IC_KM.includes(e.tipo_ic as TipoIcKm)) err.tipo_ic = 'err_opcion';

    for (const campo of ['t1', 't2'] as const) {
      const t = e[campo];
      if (typeof t !== 'number' || !Number.isFinite(t)) err[campo] = 'err_numero';
      else if (t < 0) err[campo] = 'err_tiempo_negativo';
    }
    // El orden solo se exige entre dos tiempos pedidos: con t1 = 7 y t2 = 0
    // («solo el primero») no hay nada que ordenar.
    if (!err.t1 && !err.t2 && tiempoPedido(e.t1) && tiempoPedido(e.t2) && e.t1 > e.t2) err.t2 = 'err_rango';

    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
