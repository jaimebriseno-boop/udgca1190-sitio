/**
 * Ayudas mínimas de DOM para la sección. Junto con `controlador.ts`,
 * `estado-url.ts` y `montar.ts` es el único lugar del proyecto que toca el
 * navegador: la biblioteca de `src/lib/bioestadistica/` se mantiene pura para
 * poder correr igual en build, en el navegador y en `node --test`.
 */

/** Primer elemento que casa con el selector, tipado. */
export function $<T extends Element = HTMLElement>(selector: string, raiz: ParentNode = document): T | null {
  return raiz.querySelector<T>(selector);
}

/** Todos los elementos que casan con el selector, como arreglo. */
export function $$<T extends Element = HTMLElement>(selector: string, raiz: ParentNode = document): T[] {
  return Array.from(raiz.querySelectorAll<T>(selector));
}

/**
 * Copia al portapapeles con respaldo para contextos sin `navigator.clipboard`
 * (http, WebView antiguo, permiso denegado): un `<textarea>` fuera de pantalla y
 * `execCommand('copy')`, restaurando después la selección de la persona.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sin permiso o sin API: se intenta el respaldo.
  }
  return copiarConExecCommand(texto);
}

/**
 * `execCommand` está obsoleto y `lib.dom` lo marca como tal, pero sigue siendo
 * el único respaldo cuando no hay API de portapapeles (http, permiso denegado,
 * WebView antiguo). Se acota su firma para usarlo a conciencia y sin ruido.
 */
interface ConExecCommand {
  execCommand(comando: string): boolean;
}

function copiarConExecCommand(texto: string): boolean {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  const seleccion = document.getSelection();
  const previa = seleccion && seleccion.rangeCount > 0 ? seleccion.getRangeAt(0) : null;
  area.select();
  let ok = false;
  try {
    ok = (document as ConExecCommand).execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (previa && seleccion) {
    seleccion.removeAllRanges();
    seleccion.addRange(previa);
  }
  return ok;
}

/** Descarga un texto como archivo, liberando el objeto URL en cuanto el navegador lo toma. */
export function descargar(texto: string, nombre: string, tipo: string): void {
  const blob = new Blob([texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Muestra un texto momentáneo en un botón («Copiado») y restaura el original. */
export function avisarEnBoton(boton: HTMLElement, aviso: string, ms = 1600): void {
  const original = boton.dataset.textoOriginal ?? boton.textContent ?? '';
  boton.dataset.textoOriginal = original;
  boton.textContent = aviso;
  const previo = Number(boton.dataset.temporizador ?? '0');
  if (previo) window.clearTimeout(previo);
  boton.dataset.temporizador = String(
    window.setTimeout(() => {
      boton.textContent = boton.dataset.textoOriginal ?? original;
      delete boton.dataset.temporizador;
    }, ms),
  );
}
