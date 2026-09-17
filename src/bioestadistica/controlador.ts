/**
 * Controlador genérico de una calculadora: el ciclo leer → derivar → validar →
 * calcular → presentar → pintar → escribir la URL, para cualquier `Definicion`.
 *
 * No sabe nada de ninguna calculadora concreta. Todo lo particular llega en dos
 * piezas: el módulo puro (`Definicion`) y el contenido bilingüe del YAML que la
 * página inyecta en `#bio-datos`. Añadir una calculadora no toca este archivo.
 *
 * El HTML que produce Astro ya trae el ejemplo resuelto en el servidor; aquí
 * solo se repinta lo que cambia, siempre sobre los mismos ganchos `data-*`.
 */
import { codigoR } from '../lib/bioestadistica/nucleo/codigoR.ts';
import { parsearNumero, validarEntrada } from '../lib/bioestadistica/nucleo/entrada.ts';
import { aCSV, aMarkdown } from '../lib/bioestadistica/nucleo/exportar.ts';
import { crearFormateador } from '../lib/bioestadistica/nucleo/formato.ts';
import { renderGrafica } from '../lib/bioestadistica/nucleo/svg.ts';
import type {
  Aviso,
  ContenidoLang,
  Contexto,
  Definicion,
  EntradaDef,
  Entradas,
  Lang,
  Motor,
  Presentacion,
  Resultado,
  ValorEntrada,
} from '../lib/bioestadistica/nucleo/tipos.ts';
import { $, $$, avisarEnBoton, copiarAlPortapapeles, descargar } from './dom.ts';
import { escribirURL, forzarEjemplo, hayEstadoEnURL, leerURL, limpiarURL, urlConEstado } from './estado-url.ts';

/** Retardo de la escritura en la URL: se teclea seguido y el historial no debe latir. */
const RETARDO_URL = 300;

/** Nivel de confianza cuando la calculadora no declara la entrada `nivel`. */
const NIVEL_POR_DEFECTO = 0.95;

/** Total que no se puede sumar: ni «0» ni un hueco, que se leerían como una cuenta. */
const SIN_DATO = '–';

/** Datos que la página inyecta en `<script type="application/json" id="bio-datos">`. */
export interface DatosPagina {
  slug: string;
  lang: Lang;
  motor: Motor;
  entradas: EntradaDef[];
  ejemplo: Entradas;
  textos: ContenidoLang;
  r: { paquetes: string[]; codigo: string };
  refs: Record<string, number>;
  ui: Record<string, string>;
  /** URL canónica de la calculadora, sin estado (la que cita el párrafo de Métodos). */
  url: string;
}

interface Campo {
  def: EntradaDef;
  el: HTMLInputElement | HTMLSelectElement;
}

/** Sustituye `{clave}` por los parámetros que existan; deja intacto lo demás. */
function interpolar(texto: string, params: Record<string, number | string> | undefined): string {
  if (!params) return texto;
  let s = texto;
  for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/**
 * ¿Dos juegos de entradas son el mismo? (para saber si lo que se ve es el
 * ejemplo). Las entradas derivadas (totales, prevalencia) se ignoran: el
 * ejemplo del YAML viaja sin derivar y lo leído del formulario se deriva.
 */
function mismasEntradas(a: Entradas, b: Entradas, derivadas: ReadonlySet<string>): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !derivadas.has(k)));
  for (const k of claves) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) || Array.isArray(vb)) {
      if (!Array.isArray(va) || !Array.isArray(vb) || va.length !== vb.length) return false;
      if (va.some((x, i) => x !== vb[i])) return false;
      continue;
    }
    if (va !== vb) return false;
  }
  return true;
}

/**
 * Conecta una `Definicion` con el HTML ya renderizado. Todos los oyentes se
 * registran con `señal`, de modo que un montaje posterior (navegación con
 * `ClientRouter`) los retire de golpe.
 */
export function iniciar(def: Definicion, datos: DatosPagina, señal: AbortSignal): void {
  const fmt = crearFormateador(datos.lang);
  const ui = datos.ui;
  const defs = datos.entradas;
  const derivadas: ReadonlySet<string> = new Set(defs.filter((d) => d.derivado).map((d) => d.id));
  const campos: Campo[] = [];
  for (const d of defs) {
    const el = $<HTMLInputElement | HTMLSelectElement>(`[data-entrada="${d.id}"]`);
    if (el) campos.push({ def: d, el });
  }

  /** Campos que la persona ya tocó: hasta entonces no se le reclama nada. */
  const tocados = new Set<string>();
  let temporizadorUrl = 0;
  // Un montaje posterior (navegación con `ClientRouter`) no debe heredar una
  // escritura de URL pendiente de la calculadora anterior.
  señal.addEventListener('abort', () => {
    if (temporizadorUrl) window.clearTimeout(temporizadorUrl);
    temporizadorUrl = 0;
  });
  /** Última presentación válida; la usan «Copiar como Markdown» y «Descargar CSV». */
  let ultima: { entradas: Entradas; presentacion: Presentacion; codigo: string } | null = null;

  // -------------------------------------------------------------------------
  // Leer
  // -------------------------------------------------------------------------

  function leer(): { entradas: Entradas; errores: Record<string, string> } {
    const entradas: Entradas = {};
    const errores: Record<string, string> = {};
    for (const { def: d, el } of campos) {
      const bruto = el.value;
      if (d.tipo === 'opcion') {
        const v = bruto.trim();
        if (v === '') {
          if (d.requerido) errores[d.id] = 'err_requerido';
          continue;
        }
        if (d.opciones && !d.opciones.includes(v)) {
          errores[d.id] = 'err_rango';
          continue;
        }
        entradas[d.id] = v;
        continue;
      }
      const codigo = validarEntrada(bruto, d);
      if (codigo) {
        errores[d.id] = codigo;
        continue;
      }
      const n = parsearNumero(bruto, d);
      if (n !== null) entradas[d.id] = n;
    }
    return { entradas, errores };
  }

  /** Nivel de confianza vigente; si la calculadora lo declara, viaja también en las entradas. */
  function resolverNivel(entradas: Entradas): number {
    if (typeof entradas.nivel === 'number') return entradas.nivel;
    const delEjemplo = datos.ejemplo.nivel;
    const nivel = typeof delEjemplo === 'number' ? delEjemplo : NIVEL_POR_DEFECTO;
    if (defs.some((d) => d.id === 'nivel')) entradas.nivel = nivel;
    return nivel;
  }

  // -------------------------------------------------------------------------
  // Pintar
  // -------------------------------------------------------------------------

  /** Valor de `min`/`max` en el mensaje de error, con el formato del tipo de campo. */
  function limite(d: EntradaDef, v: number): string {
    if (d.tipo === 'proporcion') return fmt.nivel(v);
    if (d.tipo === 'entero') return fmt.entero(v);
    return fmt.num(v, 'dec3');
  }

  function mensajeError(codigo: string, d: EntradaDef): string {
    const plantilla = ui[codigo] ?? codigo;
    const params: Record<string, string> = {};
    if (d.min !== undefined) params.min = limite(d, d.min);
    if (d.max !== undefined) params.max = limite(d, d.max);
    return interpolar(plantilla, params);
  }

  function pintarErrores(errores: Record<string, string>): void {
    for (const { def: d, el } of campos) {
      const codigo = errores[d.id];
      // Un campo vacío que nadie ha tocado todavía no es un error que reclamar.
      const mostrar = codigo !== undefined && (codigo !== 'err_requerido' || tocados.has(d.id));
      const salida = $<HTMLElement>(`[data-error-for="${d.id}"]`);
      if (mostrar && codigo !== undefined) {
        el.setAttribute('aria-invalid', 'true');
        if (salida) {
          salida.textContent = mensajeError(codigo, d);
          salida.hidden = false;
        }
      } else {
        el.removeAttribute('aria-invalid');
        if (salida) {
          salida.textContent = '';
          salida.hidden = true;
        }
      }
    }
  }

  /**
   * Totales de una tabla 2×2. Cada `<output data-total="id1 id2 …">` suma las
   * entradas que nombra; basta que falte una o que no sea un número para
   * escribir «–»: un total a medias se leería como una cuenta real.
   *
   * Se repinta aunque la captura tenga errores, con lo que se haya podido leer:
   * los totales son parte de lo capturado, no del resultado.
   */
  function pintarTotales(entradas: Entradas): void {
    for (const salida of $$<HTMLElement>('[data-total]')) {
      const ids = (salida.dataset.total ?? '').split(' ').filter((s) => s !== '');
      let suma = 0;
      let completo = ids.length > 0;
      for (const id of ids) {
        const v = entradas[id];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          completo = false;
          break;
        }
        suma += v;
      }
      salida.textContent = completo ? fmt.entero(suma) : SIN_DATO;
    }
  }

  function pintarCeldas(p: Presentacion): void {
    for (const [id, celda] of Object.entries(p.celdas)) {
      const cont = $<HTMLElement>(`[data-celda="${id}"]`);
      if (!cont) continue;
      const valor = $<HTMLElement>('.celda__valor', cont);
      if (valor) valor.textContent = celda.valor;
      const ic = $<HTMLElement>('.celda__ic', cont);
      if (ic) {
        ic.textContent = celda.ic ?? '';
        ic.hidden = !celda.ic;
      }
      const nota = $<HTMLElement>('.celda__nota', cont);
      if (nota) {
        nota.textContent = celda.nota ?? '';
        nota.hidden = !celda.nota;
      }
      cont.classList.toggle('is-destacada', celda.clase === 'destacada');
      cont.classList.toggle('is-invalida', celda.clase === 'invalida');
    }
  }

  function pintarInterpretacion(p: Presentacion): void {
    const cont = $<HTMLElement>('[data-interpretacion]');
    if (!cont) return;
    cont.replaceChildren(
      ...p.interpretacion.map((texto) => {
        const parrafo = document.createElement('p');
        parrafo.textContent = texto;
        return parrafo;
      }),
    );
  }

  function pintarAvisos(activos: Aviso[]): void {
    const porCodigo = new Map(activos.map((a) => [a.codigo, a]));
    for (const li of $$<HTMLElement>('[data-aviso]')) {
      const codigo = li.dataset.aviso ?? '';
      const aviso = porCodigo.get(codigo);
      li.hidden = aviso === undefined;
      if (aviso) li.textContent = interpolar(datos.textos.avisos[codigo] ?? codigo, aviso.params);
    }
  }

  function pintarGrafica(p: Presentacion): void {
    const figura = $<HTMLElement>('[data-grafica-figura]');
    const hueco = $<HTMLElement>('[data-grafica]');
    if (!hueco) return;
    if (!p.grafica) {
      hueco.replaceChildren();
      if (figura) figura.hidden = true;
      return;
    }
    try {
      hueco.innerHTML = renderGrafica(p.grafica, { fmt });
      if (figura) figura.hidden = false;
    } catch (e) {
      // Una gráfica que no se puede trazar (p. ej. escala logarítmica con un
      // límite no positivo) no debe interrumpir el resto del repintado.
      console.error('bioestadistica: no se pudo dibujar la gráfica', e);
      hueco.replaceChildren();
      if (figura) figura.hidden = true;
    }
  }

  function pintarCodigoR(entradas: Entradas, nivel: number): string {
    const hueco = $<HTMLElement>('[data-codigo-r]');
    let codigo = ultima?.codigo ?? '';
    try {
      // `Definicion.rScript` recibe también el nivel; la plantilla de R solo
      // pasa las entradas, así que se fija el nivel vigente.
      const rScript = def.rScript;
      codigo = codigoR(
        {
          id: datos.slug,
          paquetes: datos.r.paquetes,
          codigo: datos.r.codigo,
          rScript: rScript ? (e: Entradas) => rScript(e, nivel) : undefined,
        },
        entradas,
      );
      if (hueco) hueco.textContent = codigo;
    } catch (e) {
      // Un marcador sin entrada es un error de contenido, no algo que la
      // persona pueda corregir: se conserva el código anterior y se registra.
      console.error('bioestadistica: no se pudo rellenar el código R', e);
    }
    return codigo;
  }

  function marcarObsoleto(obsoleto: boolean): void {
    for (const el of $$<HTMLElement>('[data-resultados], [data-obsolescible]')) {
      el.classList.toggle('is-obsoleto', obsoleto);
    }
    // Sin resultado vigente no hay nada que exportar ni compartir.
    for (const boton of $$<HTMLButtonElement>('[data-accion="csv"], [data-copiar="markdown"], [data-copiar="enlace"]')) {
      boton.disabled = obsoleto;
    }
  }

  function pintarPildoraEjemplo(entradas: Entradas): void {
    const pildora = $<HTMLElement>('[data-ejemplo-cargado]');
    if (pildora) pildora.hidden = !mismasEntradas(entradas, datos.ejemplo, derivadas);
  }

  function pintarUrlImpresion(entradas: Entradas): void {
    const el = $<HTMLElement>('[data-print-url]');
    if (el) el.textContent = urlConEstado(entradas, defs);
  }

  // -------------------------------------------------------------------------
  // Ciclo completo
  // -------------------------------------------------------------------------

  function programarUrl(entradas: Entradas): void {
    if (temporizadorUrl) window.clearTimeout(temporizadorUrl);
    temporizadorUrl = window.setTimeout(() => {
      temporizadorUrl = 0;
      escribirURL(entradas, defs);
    }, RETARDO_URL);
  }

  function recalcular(opciones: { escribirUrl: boolean }): void {
    const { entradas, errores } = leer();
    pintarTotales(entradas);
    const nivel = resolverNivel(entradas);
    if (def.derivar && Object.keys(errores).length === 0) Object.assign(entradas, def.derivar(entradas));
    if (Object.keys(errores).length === 0) Object.assign(errores, def.validar(entradas) ?? {});
    pintarErrores(errores);

    if (Object.keys(errores).length > 0) {
      // Lo que queda en pantalla se atenúa y deja de exportarse: nunca se
      // entregan números que no correspondan a lo que está capturado.
      marcarObsoleto(true);
      ultima = null;
      return;
    }
    marcarObsoleto(false);

    if (!def.calcular) {
      // Motor webR: el cálculo en el navegador llega en el hito H4. Hasta
      // entonces la página muestra el ejemplo resuelto en build y el código R
      // para ejecutarlo en RStudio.
      return;
    }

    const resultado: Resultado = def.calcular(entradas, nivel);
    const ctx: Contexto = {
      lang: datos.lang,
      nivel,
      textos: datos.textos,
      fmt,
      refs: datos.refs,
      url: datos.url,
      ui,
    };
    const presentacion = def.presentar(resultado, entradas, ctx);

    pintarCeldas(presentacion);
    pintarInterpretacion(presentacion);
    pintarAvisos(resultado.avisos);
    pintarGrafica(presentacion);
    const metodos = $<HTMLElement>('[data-metodos]');
    if (metodos) metodos.textContent = presentacion.metodos;
    const codigo = pintarCodigoR(entradas, nivel);
    pintarPildoraEjemplo(entradas);
    pintarUrlImpresion(entradas);

    ultima = { entradas, presentacion, codigo };
    if (opciones.escribirUrl) programarUrl(entradas);
  }

  // -------------------------------------------------------------------------
  // Escritura de los campos
  // -------------------------------------------------------------------------

  /** Valor de entrada → texto del campo, con el formato que la persona espera ver. */
  function aTextoCampo(v: ValorEntrada | undefined): string {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.join('\n');
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'string') return v;
    // Los números se escriben sin formato de presentación: el campo se vuelve a
    // leer con `parsearNumero` y el selector de nivel compara contra el valor
    // literal de sus opciones («0.95»).
    return String(v);
  }

  /** Rótulo de una opción añadida al vuelo a un `<select>` (p. ej. un nivel de confianza inusual). */
  function rotuloOpcion(d: EntradaDef, v: number): string {
    if (d.tipo === 'proporcion') return fmt.nivel(v);
    if (d.tipo === 'entero') return fmt.entero(v);
    return fmt.num(v, 'dec3');
  }

  /**
   * Asigna un valor a un `<select>`. Si ninguna opción lo representa (la URL
   * puede traer cualquier valor válido del rango del YAML, como un nivel de
   * 0.999 que el selector no ofrece), se añade la opción al vuelo: lo que la
   * URL dice y lo que se calcula nunca dejan de coincidir.
   */
  function asignarSelect(d: EntradaDef, el: HTMLSelectElement, texto: string, v: ValorEntrada): void {
    for (const op of Array.from(el.options)) {
      if (op.dataset.dinamica === '1' && op.value !== texto) op.remove();
    }
    if (!Array.from(el.options).some((op) => op.value === texto)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const op = document.createElement('option');
      op.value = texto;
      op.textContent = rotuloOpcion(d, v);
      op.dataset.dinamica = '1';
      el.appendChild(op);
    }
    el.value = texto;
  }

  function escribirCampos(valores: Partial<Entradas>, opciones: { vaciarFaltantes: boolean }): void {
    for (const { def: d, el } of campos) {
      const v = valores[d.id];
      if (v === undefined) {
        if (!opciones.vaciarFaltantes) continue;
        // Un `<select>` no admite vacío: se queda con la opción por omisión.
        if (el instanceof HTMLSelectElement) continue;
        el.value = '';
        continue;
      }
      const texto = aTextoCampo(v);
      if (el instanceof HTMLSelectElement) asignarSelect(d, el, texto, v);
      else el.value = texto;
    }
  }

  /** Marca todos los campos como tocados: los vacíos deben reclamarse (URL incompleta). */
  function tocarTodos(): void {
    for (const c of campos) tocados.add(c.def.id);
  }

  function cargarEjemplo(opciones: { escribirUrl: boolean }): void {
    escribirCampos(datos.ejemplo, { vaciarFaltantes: true });
    tocados.clear();
    recalcular(opciones);
  }

  function limpiar(): void {
    escribirCampos({}, { vaciarFaltantes: true });
    tocados.clear();
    if (temporizadorUrl) {
      window.clearTimeout(temporizadorUrl);
      temporizadorUrl = 0;
    }
    limpiarURL();
    recalcular({ escribirUrl: false });
    const pildora = $<HTMLElement>('[data-ejemplo-cargado]');
    if (pildora) pildora.hidden = true;
    campos[0]?.el.focus();
  }

  // -------------------------------------------------------------------------
  // Exportar
  // -------------------------------------------------------------------------

  /** Pares [rótulo, valor formateado] de lo capturado, para Markdown. */
  function entradasLegibles(entradas: Entradas): Array<[string, string]> {
    const pares: Array<[string, string]> = [];
    for (const d of defs) {
      if (d.derivado) continue;
      const v = entradas[d.id];
      if (v === undefined) continue;
      const rotulo = datos.textos.etiquetas[d.id] ?? d.id;
      // Una entrada con lista cerrada se lee por su rótulo, no por el valor
      // interno: en el resumen debe decir «Wilson», no «wilson». La clave es la
      // misma cadena con la que el valor viaja en la URL.
      if (d.opciones) {
        const texto = aTextoCampo(v);
        pares.push([rotulo, datos.textos.etiquetas[`${d.id}.${texto}`] ?? texto]);
        continue;
      }
      if (typeof v !== 'number') {
        pares.push([rotulo, Array.isArray(v) ? v.join(', ') : String(v)]);
        continue;
      }
      if (d.tipo === 'proporcion') pares.push([rotulo, fmt.nivel(v)]);
      else if (d.tipo === 'entero') pares.push([rotulo, fmt.entero(v)]);
      else pares.push([rotulo, fmt.num(v)]);
    }
    return pares;
  }

  function filasCsv(p: Presentacion): string[][] {
    const cabecera = [ui.medida ?? 'medida', ui.estimacion ?? 'estimacion', ui.ic ?? 'ic'];
    return [cabecera, ...p.resumen.map((f) => [f[0], f[1], f[2]])];
  }

  function markdown(): string {
    if (!ultima) return '';
    return aMarkdown({
      titulo: datos.textos.titulo,
      url: urlConEstado(ultima.entradas, defs),
      entradas: entradasLegibles(ultima.entradas),
      resumen: ultima.presentacion.resumen,
      interpretacion: ultima.presentacion.interpretacion,
      metodos: ultima.presentacion.metodos,
      codigoR: ultima.codigo,
      ui,
      cita: $<HTMLElement>('[data-cita-texto]')?.textContent?.trim() ?? '',
    });
  }

  /** Texto que copia cada botón «Copiar». */
  function textoParaCopiar(que: string): string {
    if (que === 'markdown') return markdown();
    if (que === 'r') return $<HTMLElement>('[data-codigo-r]')?.textContent ?? '';
    if (que === 'metodos') return $<HTMLElement>('[data-metodos]')?.textContent ?? '';
    if (que === 'cita') return $<HTMLElement>('[data-cita-texto]')?.textContent?.trim() ?? '';
    if (que === 'enlace') return urlConEstado(ultima?.entradas ?? datos.ejemplo, defs);
    return '';
  }

  async function copiar(boton: HTMLElement, que: string): Promise<void> {
    const texto = textoParaCopiar(que);
    if (!texto) return;
    const ok = await copiarAlPortapapeles(texto);
    const aviso = que === 'enlace' ? (ui.enlace_copiado ?? ui.copiado) : ui.copiado;
    if (ok && aviso) avisarEnBoton(boton, aviso);
  }

  // -------------------------------------------------------------------------
  // Oyentes
  // -------------------------------------------------------------------------

  for (const { def: d, el } of campos) {
    const alEscribir = (): void => {
      tocados.add(d.id);
      recalcular({ escribirUrl: true });
    };
    el.addEventListener('input', alEscribir, { signal: señal });
    el.addEventListener('change', alEscribir, { signal: señal });
  }

  // El cálculo es en vivo: no hay nada que enviar y pulsar Intro en un campo no
  // debe recargar la página.
  for (const form of $$<HTMLFormElement>('#calculadora form')) {
    form.addEventListener('submit', (ev) => ev.preventDefault(), { signal: señal });
  }

  document.addEventListener(
    'click',
    (ev) => {
      const objetivo = ev.target;
      if (!(objetivo instanceof Element)) return;
      const boton = objetivo.closest<HTMLElement>('[data-accion]');
      if (!boton) return;
      const accion = boton.dataset.accion;
      if (accion === 'ejemplo') {
        ev.preventDefault();
        cargarEjemplo({ escribirUrl: true });
      } else if (accion === 'limpiar') {
        ev.preventDefault();
        limpiar();
      } else if (accion === 'copiar') {
        ev.preventDefault();
        void copiar(boton, boton.dataset.copiar ?? 'markdown');
      } else if (accion === 'csv') {
        ev.preventDefault();
        if (ultima) descargar(aCSV(filasCsv(ultima.presentacion)), `${datos.slug}.csv`, 'text/csv;charset=utf-8');
      } else if (accion === 'imprimir') {
        ev.preventDefault();
        window.print();
      }
    },
    { signal: señal },
  );

  window.addEventListener(
    'popstate',
    () => {
      const deUrl = leerURL(defs);
      if (Object.keys(deUrl).length > 0) {
        escribirCampos(deUrl, { vaciarFaltantes: true });
        tocarTodos();
      } else {
        escribirCampos(datos.ejemplo, { vaciarFaltantes: true });
        tocados.clear();
      }
      recalcular({ escribirUrl: false });
    },
    { signal: señal },
  );

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------

  if (hayEstadoEnURL(defs) && !forzarEjemplo()) {
    // Un enlace con datos se toma tal cual: si viene incompleto (truncado por
    // un gestor de correo, por ejemplo) los campos que falten se reclaman como
    // obligatorios en vez de rellenarse en silencio con el ejemplo.
    escribirCampos(leerURL(defs), { vaciarFaltantes: true });
    tocarTodos();
    recalcular({ escribirUrl: false });
  } else {
    // Sin parámetros se muestra el ejemplo, que ya viene resuelto desde el
    // servidor: se recalcula para tener listo lo que exportan los botones, pero
    // no se toca la URL corta que la persona acaba de abrir o compartir.
    cargarEjemplo({ escribirUrl: false });
  }
}
