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
import { interpolar } from '../lib/bioestadistica/nucleo/avisos.ts';
import { codigoR } from '../lib/bioestadistica/nucleo/codigoR.ts';
import { parsearNumero, validarEntrada } from '../lib/bioestadistica/nucleo/entrada.ts';
import { aCSV, aMarkdown, columnasOmitidas } from '../lib/bioestadistica/nucleo/exportar.ts';
import { crearFormateador } from '../lib/bioestadistica/nucleo/formato.ts';
import {
  parsearPegado,
  parsearTablaPegada, esCuadrada,
  resumenPegado,
  resumenTabla,
  textoDeTabla,
} from '../lib/bioestadistica/nucleo/pegado.ts';
import { renderGrafica } from '../lib/bioestadistica/nucleo/svg.ts';
import { perfilPara } from '../lib/bioestadistica/nucleo/tolerancias.ts';
import type { Fila } from '../lib/bioestadistica/nucleo/comparar.ts';
import type { Progreso, Verificacion } from '../lib/bioestadistica/webr.ts';
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

/**
 * Adaptador de webR, tipado desde su módulo pero cargado SOLO con `import()` al
 * pulsar «Verificar con R»: chunk aparte que la página no pide hasta entonces.
 * Importar el módulo no descarga nada del CDN; eso solo ocurre tras el
 * consentimiento, dentro de `iniciarR()`.
 */
type Adaptador = typeof import('../lib/bioestadistica/webr.ts');

/**
 * Módulo `webr.ts` una vez cargado. Vive fuera de `iniciar()` porque con el
 * `ClientRouter` cada calculadora monta de nuevo pero el documento (y la sesión
 * de R) es el mismo: así la página siguiente puede ofrecer «Liberar memoria»
 * sin volver a pedir el chunk. Nulo hasta el primer clic en «Verificar con R».
 */
let adaptador: Adaptador | null = null;

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

/** Un `<textarea>` es el control de una columna o una tabla pegadas; los demás tipos, `<input>` o `<select>`. */
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface Campo {
  def: EntradaDef;
  el: Control;
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
    const el = $<Control>(`[data-entrada="${d.id}"]`);
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
  /** Última presentación válida; la usan «Copiar como Markdown», «Descargar CSV» y «Verificar con R». */
  let ultima: { entradas: Entradas; presentacion: Presentacion; codigo: string; resultado: Resultado } | null = null;

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
      if (d.tipo === 'columna') {
        const r = parsearPegado(bruto);
        const resumen = $<HTMLElement>(`[data-pegado-resumen="${d.id}"]`);
        if (resumen) resumen.textContent = resumenPegado(r, ui, fmt);
        // La columna se registra siempre, aunque venga vacía: así la píldora
        // «Ejemplo cargado» y la URL comparan lo mismo que hay en pantalla.
        entradas[d.id] = r.valores;
        if (r.valores.length === 0) {
          // Un campo en blanco no es un pegado que no se entendió: el primero
          // solo se reclama si la columna es obligatoria; el segundo, siempre.
          if (bruto.trim() === '') {
            if (d.requerido) errores[d.id] = 'err_requerido';
          } else errores[d.id] = 'err_sin_datos';
        } else if (d.min !== undefined && r.valores.length < d.min) {
          // En una columna, `min` es el número mínimo de valores.
          errores[d.id] = 'err_n_min';
        }
        continue;
      }
      if (d.tipo === 'tabla') {
        const r = parsearTablaPegada(bruto);
        const resumen = $<HTMLElement>(`[data-pegado-resumen="${d.id}"]`);
        if (resumen) resumen.textContent = resumenTabla(r, ui, fmt);
        // La tabla viaja aplanada por filas, como la codifica la URL, y se
        // registra siempre —también vacía— por lo mismo que la columna.
        entradas[d.id] = r.filas.flat();
        if (r.filas.length === 0) {
          if (bruto.trim() === '') {
            if (d.requerido) errores[d.id] = 'err_requerido';
          } else errores[d.id] = 'err_sin_datos';
        } else if (r.irregular) {
          // Una tabla con filas de distinta longitud no tiene forma: aplanarla
          // daría una lista sin significado.
          errores[d.id] = 'err_tabla_forma';
        } else if (!esCuadrada(r.filas)) {
          // La forma no sobrevive al aplanado: una fila de cuatro celdas (1 × 4)
          // o una tabla de 2 × 8 tienen un número cuadrado de celdas y
          // `validar()` las tomaría por 2 × 2 o 4 × 4. Si además se descartó
          // alguna fila incompleta, la causa probable es ese hueco y el error
          // lo nombra; el tamaño admitido (2–10) sigue siendo cosa de `validar()`.
          errores[d.id] = r.filasDescartadas > 0 ? 'err_tabla_incompleta' : 'err_tabla_cuadrada';
        } else if (d.min !== undefined && r.filas.flat().length < d.min) {
          // En una tabla, `min` cuenta celdas.
          errores[d.id] = 'err_n_min';
        }
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
    // El `min` de una columna o de una tabla cuenta valores, no mide la variable.
    if (d.tipo === 'entero' || d.tipo === 'columna' || d.tipo === 'tabla') return fmt.entero(v);
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
      // El id entra en el `clipPath` y en los `aria-labelledby` del SVG: por
      // calculadora, para que dos gráficas en una misma página no los compartan.
      hueco.innerHTML = renderGrafica(p.grafica, { fmt, id: `bio-grafica-${datos.slug}` });
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
      // persona pueda corregir: se registra y se conserva lo que está en
      // pantalla (el código anterior o, en el primer repintado, el que Astro
      // resolvió en build), que es lo que «Verificar con R» debe ejecutar.
      console.error('bioestadistica: no se pudo rellenar el código R', e);
      codigo = hueco?.textContent ?? codigo;
    }
    return codigo;
  }

  function marcarObsoleto(obsoleto: boolean): void {
    for (const el of $$<HTMLElement>('[data-resultados], [data-obsolescible]')) {
      el.classList.toggle('is-obsoleto', obsoleto);
    }
    // Sin resultado vigente no hay nada que exportar, compartir ni verificar.
    for (const boton of $$<HTMLButtonElement>('[data-accion="csv"], [data-copiar="markdown"], [data-copiar="enlace"]')) {
      boton.disabled = obsoleto;
    }
    const verificar = $<HTMLButtonElement>('[data-accion="verificar-r"]');
    if (verificar) verificar.disabled = obsoleto || verificando;
  }

  function pintarPildoraEjemplo(entradas: Entradas): void {
    const pildora = $<HTMLElement>('[data-ejemplo-cargado]');
    if (pildora) pildora.hidden = !mismasEntradas(entradas, datos.ejemplo, derivadas);
  }

  /**
   * URL de impresión y nota persistente del enlace. Si los datos pegados no
   * caben en la URL (`columnasOmitidas`), quien imprime, comparte o copia el
   * Markdown debe saber que el enlace lleva la calculadora y no sus datos; el
   * botón «Compartir enlace» lo avisa solo al pulsarlo, así que la nota se
   * pinta siempre que la condición se cumpla.
   */
  function pintarUrlImpresion(entradas: Entradas): void {
    const omitidas = columnasOmitidas(entradas, defs);
    const el = $<HTMLElement>('[data-print-url]');
    if (el) el.textContent = omitidas && ui.url_sin_datos ? `${urlConEstado(entradas, defs)} · ${ui.url_sin_datos}` : urlConEstado(entradas, defs);
    const nota = $<HTMLElement>('[data-enlace-nota]');
    if (nota) nota.hidden = !omitidas;
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
      // entregan números que no correspondan a lo que está capturado. La
      // píldora «Ejemplo cargado» también se retira: lo capturado ya no es el
      // ejemplo aunque los números atenuados sigan siendo los suyos.
      marcarObsoleto(true);
      pintarPildoraEjemplo(entradas);
      pintarUrlImpresion(entradas);
      ultima = null;
      marcarVerificacionObsoleta(true);
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

    ultima = { entradas, presentacion, codigo, resultado };
    // Una verificación con R vale para el código que se verificó, no para el
    // que se muestra ahora: si cambió, el veredicto se atenúa y lo dice.
    marcarVerificacionObsoleta(codigo !== codigoVerificado);
    if (opciones.escribirUrl) programarUrl(entradas);
  }

  // -------------------------------------------------------------------------
  // Escritura de los campos
  // -------------------------------------------------------------------------

  /**
   * Valor de entrada → texto del campo, con el formato que la persona espera
   * ver. La definición de la entrada es opcional porque no siempre se conoce
   * (el resumen de Markdown solo maneja valores), pero hace falta para
   * distinguir una lista que es una columna (un número por línea) de una que es
   * una tabla (una fila por línea).
   */
  function aTextoCampo(v: ValorEntrada | undefined, d?: EntradaDef): string {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return d?.tipo === 'tabla' ? textoDeTabla(v) : v.join('\n');
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
    if (d.tipo === 'entero' || d.tipo === 'columna' || d.tipo === 'tabla') return fmt.entero(v);
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
      const texto = aTextoCampo(v, d);
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
        const texto = aTextoCampo(v, d);
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
      notaUrl: columnasOmitidas(ultima.entradas, defs) ? ui.url_sin_datos : undefined,
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

  /** Texto del botón tras copiar el enlace: distinto si la columna pegada no cupo en la URL. */
  function avisoEnlace(): string | undefined {
    const entradas = ultima?.entradas ?? datos.ejemplo;
    if (columnasOmitidas(entradas, defs)) return ui.enlace_sin_columna ?? ui.enlace_copiado ?? ui.copiado;
    return ui.enlace_copiado ?? ui.copiado;
  }

  async function copiar(boton: HTMLElement, que: string): Promise<void> {
    const texto = textoParaCopiar(que);
    if (!texto) return;
    const ok = await copiarAlPortapapeles(texto);
    const aviso = que === 'enlace' ? avisoEnlace() : ui.copiado;
    if (ok && aviso) avisarEnBoton(boton, aviso);
  }

  // -------------------------------------------------------------------------
  // Verificar con R (webR)
  // -------------------------------------------------------------------------

  /** Código R de la última verificación terminada; `null` si no hay ninguna en pantalla. */
  let codigoVerificado: string | null = null;
  let verificando = false;
  /** Temporizador del cronómetro de la barra de estado. */
  let cronometro = 0;
  señal.addEventListener('abort', () => {
    if (cronometro) window.clearInterval(cronometro);
    cronometro = 0;
  });

  async function cargarAdaptador(): Promise<Adaptador> {
    adaptador ??= await import('../lib/bioestadistica/webr.ts');
    return adaptador;
  }

  /** Valor numérico de la tabla de comparación, compacto y sin locale (es una lectura técnica). */
  function textoValorR(x: number | null): string {
    if (x === null) return ui.webr_na ?? 'NA';
    if (Number.isNaN(x)) return ui.no_definido ?? 'NaN';
    if (x === Number.POSITIVE_INFINITY) return '∞';
    if (x === Number.NEGATIVE_INFINITY) return '−∞';
    if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
    return String(Number(x.toPrecision(8)));
  }

  function textoDifRel(d: number): string {
    if (Number.isNaN(d)) return '—';
    if (d === 0) return '0';
    return d.toExponential(1);
  }

  function filaTabla(f: Fila): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.campo = f.componente === 'valor' ? f.campo : `${f.campo}.${f.componente}`;
    tr.dataset.coincide = f.coincide ? '1' : '0';
    const th = document.createElement('th');
    th.scope = 'row';
    const etiqueta = datos.textos.etiquetas[f.campo] ?? f.campo;
    const sufijo = f.componente === 'lo' ? ui.webr_lo : f.componente === 'hi' ? ui.webr_hi : undefined;
    th.append(sufijo ? `${etiqueta} (${sufijo})` : etiqueta);
    const code = document.createElement('code');
    code.textContent = tr.dataset.campo;
    th.append(code);
    tr.append(th);
    for (const texto of [textoValorR(f.ts), textoValorR(f.r), textoDifRel(f.difRel)]) {
      const td = document.createElement('td');
      td.className = 'num';
      td.textContent = texto;
      tr.append(td);
    }
    const estado = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = f.coincide ? 'pill-ok' : 'pill-err';
    pill.textContent = f.coincide ? (ui.webr_coincide ?? 'ok') : (ui.webr_no_coincide ?? 'error');
    estado.append(pill);
    if (f.nota) {
      estado.className = 'nota-r';
      estado.append(` ${f.nota}`);
    }
    tr.append(estado);
    return tr;
  }

  function mostrarPanelVerificacion(): HTMLElement | null {
    const panel = $<HTMLElement>('[data-verificar]');
    if (panel) panel.hidden = false;
    return panel;
  }

  /**
   * Estado de la verificación. `[data-verificar-estado]` es la región viva
   * (`role="status"`): solo lleva el nombre de la etapa y se reescribe cuando
   * la etapa cambia, para que un lector de pantalla oiga «Descargando R…» una
   * vez y no cada segundo. El cronómetro va en un elemento aparte, oculto a la
   * accesibilidad, que sí se repinta cada segundo.
   */
  function escribirEstado(etapa: string, texto: string): void {
    const marco = $<HTMLElement>('[data-verificar-progreso]');
    if (marco) {
      marco.hidden = false;
      marco.dataset.etapa = etapa;
    }
    const el = $<HTMLElement>('[data-verificar-estado]');
    if (!el) return;
    el.dataset.etapa = etapa;
    if (el.textContent !== texto) el.textContent = texto;
  }

  function pintarEtapa(p: Progreso, t0: number): void {
    escribirEstado(p.estado, interpolar(ui[`webr_etapa_${p.estado}`] ?? p.estado, { paquete: p.paquete ?? '' }));
    const crono = $<HTMLElement>('[data-verificar-cronometro]');
    if (crono) {
      const s = Math.max(0, Math.round((performance.now() - t0) / 1000));
      crono.textContent = interpolar(ui.webr_segundos ?? '{s} s', { s });
    }
  }

  function pintarErrorVerificacion(e: unknown, a: Adaptador | null): void {
    const el = $<HTMLElement>('[data-verificar-error]');
    if (!el) return;
    let codigo = 'desconocido';
    let detalle = e instanceof Error ? e.message : String(e);
    if (a && e instanceof a.ErrorWebR) {
      codigo = e.codigo;
      detalle = e.detalle;
    }
    const mensaje = interpolar(ui[`webr_err_${codigo}`] ?? ui.webr_err_desconocido ?? codigo, { detalle });
    el.textContent = mensaje;
    el.hidden = false;
    // La región viva anuncia también el motivo: el aviso rojo no es vivo.
    escribirEstado('error', `${ui.webr_etapa_error ?? 'error'} · ${mensaje}`);
    console.error('bioestadistica: la verificación con R falló', e);
  }

  function marcarVerificacionObsoleta(obsoleta: boolean): void {
    if (codigoVerificado === null) return;
    const cont = $<HTMLElement>('[data-verificar-resultado]');
    if (cont) cont.classList.toggle('is-obsoleto', obsoleta);
    const nota = $<HTMLElement>('[data-verificar-obsoleto]');
    if (nota) nota.hidden = !obsoleta;
  }

  function pintarVerificacion(v: Verificacion): void {
    const cont = $<HTMLElement>('[data-verificar-resultado]');
    if (!cont) return;
    const { informe } = v;
    const campos = new Set(informe.filas.map((f) => f.campo)).size;
    const fallados = new Set(informe.discrepancias.map((f) => f.campo)).size;

    const pill = $<HTMLElement>('[data-verificar-pill]');
    if (pill) {
      pill.className = `verificar__pill ${informe.coincide ? 'pill-ok' : 'pill-err'}`;
      pill.textContent = informe.coincide ? (ui.webr_coincide ?? 'ok') : (ui.webr_no_coincide ?? 'error');
    }
    let textoVeredicto = interpolar(ui.r_coincide ?? '{k}/{m}', { k: campos - fallados, m: campos });
    const primera = informe.discrepancias[0];
    if (primera) {
      const donde = primera.componente === 'valor' ? primera.campo : `${primera.campo}.${primera.componente}`;
      textoVeredicto += ` · ${interpolar(ui.r_difiere ?? '{campo}: {ts} / {r}', { campo: donde, ts: textoValorR(primera.ts), r: textoValorR(primera.r) })}`;
    }
    const veredicto = $<HTMLElement>('[data-verificar-veredicto]');
    if (veredicto) veredicto.textContent = textoVeredicto;
    // El veredicto es lo que importa oír: va también a la región viva.
    escribirEstado('listo', `${ui.webr_etapa_listo ?? ''} · ${textoVeredicto}`);

    const tabla = $<HTMLTableElement>('[data-verificar-tabla]');
    const cuerpo = tabla ? $<HTMLTableSectionElement>('tbody', tabla) : null;
    if (cuerpo) cuerpo.replaceChildren(...informe.filas.map(filaTabla));
    const detalle = $<HTMLDetailsElement>('[data-verificar-detalle]');
    if (detalle) detalle.open = !informe.coincide;
    const resumen = $<HTMLElement>('[data-verificar-resumen]');
    if (resumen) resumen.textContent = interpolar(ui.webr_tabla_resumen ?? '{n}', { n: informe.filas.length });

    const avisosMarco = $<HTMLElement>('[data-verificar-avisos-marco]');
    const avisos = $<HTMLElement>('[data-verificar-avisos]');
    if (avisosMarco && avisos) {
      avisos.replaceChildren(
        ...v.avisosR.map((texto) => {
          const li = document.createElement('li');
          li.textContent = texto;
          return li;
        }),
      );
      avisosMarco.hidden = v.avisosR.length === 0;
    }

    const meta = $<HTMLElement>('[data-verificar-meta]');
    if (meta) meta.textContent = interpolar(ui.webr_meta ?? 'R {r} · webR {version} · {s} s', { r: v.versiones.r, version: v.versiones.webr, s: (v.ms / 1000).toFixed(1) });

    cont.dataset.veredicto = informe.coincide ? 'coincide' : 'difiere';
    cont.hidden = false;
  }

  function mostrarConsentimiento(a: Adaptador): void {
    const cons = $<HTMLElement>('[data-verificar-consentimiento]');
    if (!cons) return;
    const texto = $<HTMLElement>('[data-verificar-consentimiento-texto]');
    if (texto) {
      texto.textContent = interpolar(ui.webr_consentimiento ?? '', {
        mb: a.DESCARGA_MB,
        webr: new URL(a.WEBR_BASE_URL).host,
        repo: new URL(a.REPO_URL).host,
        version: a.WEBR_VERSION,
        paquetes: datos.r.paquetes.join(', '),
      });
    }
    const memoria = $<HTMLElement>('[data-verificar-memoria]');
    if (memoria) memoria.hidden = !a.pocaMemoria();
    cons.hidden = false;
    $<HTMLButtonElement>('[data-accion="verificar-aceptar"]')?.focus();
  }

  function ocultarConsentimiento(): void {
    const cons = $<HTMLElement>('[data-verificar-consentimiento]');
    if (cons) cons.hidden = true;
  }

  /**
   * Pie del panel: «Liberar memoria de R» mientras haya sesión y «Olvidar mi
   * decisión» mientras el consentimiento esté recordado en el navegador. Se
   * repinta al terminar cada verificación y al montar la página (la sesión y
   * el consentimiento sobreviven a la navegación dentro de la sección).
   */
  function pintarPie(): void {
    const pie = $<HTMLElement>('[data-verificar-pie]');
    if (!pie) return;
    const conSesion = adaptador?.hayR() ?? false;
    const recordado = adaptador?.hayConsentimientoRecordado() ?? false;
    const liberar = $<HTMLButtonElement>('[data-accion="liberar-r"]', pie);
    if (liberar) liberar.hidden = !conSesion;
    const olvidar = $<HTMLButtonElement>('[data-accion="olvidar-consentimiento"]', pie);
    if (olvidar) olvidar.hidden = !recordado;
    pie.hidden = !(conSesion || recordado);
    if (!pie.hidden) mostrarPanelVerificacion();
  }

  function pintarCancelar(visible: boolean): void {
    const boton = $<HTMLButtonElement>('[data-accion="cancelar-r"]');
    if (boton) boton.hidden = !visible;
  }

  async function ejecutarVerificacion(a: Adaptador): Promise<void> {
    if (verificando || !ultima) return;
    verificando = true;
    const { codigo, resultado, entradas } = ultima;
    const boton = $<HTMLButtonElement>('[data-accion="verificar-r"]');
    if (boton) boton.disabled = true;
    const error = $<HTMLElement>('[data-verificar-error]');
    if (error) error.hidden = true;
    const cont = $<HTMLElement>('[data-verificar-resultado]');
    if (cont) {
      cont.hidden = true;
      delete cont.dataset.veredicto;
    }
    const pie = $<HTMLElement>('[data-verificar-pie]');
    if (pie) pie.hidden = true;

    const t0 = performance.now();
    let etapa: Progreso = { estado: 'descargando' };
    const repintar = (): void => pintarEtapa(etapa, t0);
    repintar();
    pintarCancelar(true);
    cronometro = window.setInterval(repintar, 1000);
    try {
      const v = await a.verificarConR({
        codigo,
        paquetes: datos.r.paquetes,
        resultado,
        perfil: perfilPara(datos.slug, entradas),
        onProgreso: (p) => {
          // La promesa sobrevive a la navegación; el DOM de esta página, no.
          if (señal.aborted) return;
          etapa = p;
          repintar();
        },
      });
      if (señal.aborted) return;
      // El cronómetro se detiene antes de escribir el veredicto: no debe pisarlo.
      window.clearInterval(cronometro);
      cronometro = 0;
      codigoVerificado = codigo;
      pintarVerificacion(v);
      marcarVerificacionObsoleta(ultima?.codigo !== codigo);
    } catch (e) {
      if (señal.aborted) return;
      pintarErrorVerificacion(e, a);
    } finally {
      window.clearInterval(cronometro);
      cronometro = 0;
      verificando = false;
      if (!señal.aborted) {
        pintarCancelar(false);
        if (boton) {
          boton.disabled = ultima === null;
          boton.textContent = codigoVerificado !== null ? (ui.verificar_otra_vez ?? boton.textContent) : (ui.verificar_r ?? boton.textContent);
        }
        pintarPie();
      }
    }
  }

  async function verificar(): Promise<void> {
    if (verificando || !ultima) return;
    if (!mostrarPanelVerificacion()) return;
    let a: Adaptador;
    try {
      a = await cargarAdaptador();
    } catch (e) {
      if (!señal.aborted) pintarErrorVerificacion(e, null);
      return;
    }
    if (señal.aborted) return;
    if (!a.hayConsentimiento()) {
      mostrarConsentimiento(a);
      return;
    }
    await ejecutarVerificacion(a);
  }

  async function aceptarConsentimiento(): Promise<void> {
    const a = adaptador ?? (await cargarAdaptador());
    if (señal.aborted) return;
    const recordar = $<HTMLInputElement>('[data-verificar-recordar]')?.checked ?? false;
    a.concederConsentimiento(recordar);
    ocultarConsentimiento();
    // El botón que tenía el foco desaparece: el foco pasa al panel, que es
    // donde ocurre lo que sigue (el estado se anuncia por la región viva).
    $<HTMLElement>('[data-verificar]')?.focus();
    await ejecutarVerificacion(a);
  }

  function cancelarConsentimiento(): void {
    ocultarConsentimiento();
    // Sin verificación previa el panel no tiene nada que mostrar.
    const panel = $<HTMLElement>('[data-verificar]');
    if (panel && codigoVerificado === null) panel.hidden = true;
    $<HTMLButtonElement>('[data-accion="verificar-r"]')?.focus();
  }

  function liberarR(): void {
    adaptador?.cerrarR();
    escribirEstado('cerrado', ui.webr_cerrado ?? '');
    const crono = $<HTMLElement>('[data-verificar-cronometro]');
    if (crono) crono.textContent = '';
    pintarPie();
    $<HTMLButtonElement>('[data-accion="verificar-r"]')?.focus();
  }

  /** Cancela la verificación en curso: el adaptador rechaza lo pendiente y cierra R. */
  function cancelarR(): void {
    if (!verificando) return;
    adaptador?.cancelar();
  }

  function olvidarConsentimiento(): void {
    adaptador?.retirarConsentimiento();
    escribirEstado('cerrado', ui.webr_olvidado ?? '');
    const crono = $<HTMLElement>('[data-verificar-cronometro]');
    if (crono) crono.textContent = '';
    pintarPie();
    $<HTMLButtonElement>('[data-accion="verificar-r"]')?.focus();
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
      } else if (accion === 'verificar-r') {
        ev.preventDefault();
        void verificar();
      } else if (accion === 'verificar-aceptar') {
        ev.preventDefault();
        void aceptarConsentimiento();
      } else if (accion === 'verificar-cancelar') {
        ev.preventDefault();
        cancelarConsentimiento();
      } else if (accion === 'liberar-r') {
        ev.preventDefault();
        liberarR();
      } else if (accion === 'cancelar-r') {
        ev.preventDefault();
        cancelarR();
      } else if (accion === 'olvidar-consentimiento') {
        ev.preventDefault();
        olvidarConsentimiento();
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
  // Si ya hubo una verificación en este documento (otra calculadora, con el
  // `ClientRouter`), la sesión de R sigue viva: se ofrece liberarla desde aquí.
  if (adaptador) pintarPie();
}
