/**
 * Contrato entre el contenido bilingüe (`data/bioestadistica/calculadoras/*.yml`)
 * y el módulo puro de cada calculadora. Es la red que Zod no puede tender:
 * paridad es/en, claves que el módulo exige, ejemplo válido, referencias que
 * existen en el .bib, plantilla de R que cumple el contrato del motor, ciclo
 * completo de presentación en los dos idiomas y ecuaciones que KaTeX acepta.
 *
 * Las calculadoras se descubren solas: un YAML nuevo entra en la prueba sin
 * tocar este archivo.
 *
 *   node --test tests/bioestadistica/contenido.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { loadBib } from '../../src/content-loaders/bibtex.mjs';
import { tPrefijo } from '../../src/i18n.mjs';
import { interpolar, paramsDeAvisos } from '../../src/lib/bioestadistica/nucleo/avisos.ts';
import { MARCADOR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { crearFormateador } from '../../src/lib/bioestadistica/nucleo/formato.ts';
import { MACROS } from '../../src/lib/bioestadistica/nucleo/macros.ts';
import { marcadores, referencias as citasDe } from '../../src/lib/bioestadistica/nucleo/plantillas.ts';
import type {
  Aviso,
  ContenidoLang,
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Lang,
  Presentacion,
} from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import { leerFixture } from './util.ts';

/** Raíz del repositorio (este archivo vive en `tests/bioestadistica/`). */
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

// `loadBib` y `src/i18n.mjs` resuelven sus rutas con `process.cwd()`; así la
// prueba corre desde cualquier directorio. Cada archivo tiene su propio proceso.
process.chdir(RAIZ);

const DIR_YAML = `${RAIZ}data/bioestadistica/calculadoras/`;
const RUTA_BIB = 'data/bioestadistica/referencias.bib';
const IDIOMAS: readonly Lang[] = ['es', 'en'];

/**
 * Paquetes de R que el navegador puede instalar en webR y que el generador de
 * fixtures tiene disponibles. Uno fuera de esta lista rompería «Verificar con R».
 */
const PAQUETES_ADMITIDOS = new Set([
  'stats',
  'binom',
  'PropCIs',
  'exact2x2',
  'irr',
  'pwr',
  'survival',
  'jsonlite',
]);

// ---------------------------------------------------------------------------
// Bordes con módulos JavaScript sin tipos propios (el proyecto los admite con
// `allowJs`): sus firmas se acotan aquí una sola vez, en vez de dejar `any`
// suelto por la prueba.
// ---------------------------------------------------------------------------

/** js-yaml 4 es CommonJS y no publica tipos; mismo patrón que `util.ts`. */
interface ModuloYaml {
  load(texto: string): unknown;
}
const yaml = createRequire(import.meta.url)('js-yaml') as ModuloYaml;

interface EntradaBib {
  key: string;
}
const cargarBib: (ruta: string) => EntradaBib[] = loadBib;
// `tPrefijo` construye su objeto vacío en JavaScript, así que TypeScript infiere
// `{}`: la aserción le pone la forma que el contrato `Contexto.ui` exige.
const conPrefijo = tPrefijo as (lang: string, prefijo: string) => Record<string, string>;

// ---------------------------------------------------------------------------
// Forma del YAML tal como se lee del disco: los valores por omisión de Zod
// (`requerido`, `derivado`, `ayudas`, `avisos`, `simbolos`) aún no están puestos.
// ---------------------------------------------------------------------------

interface EntradaYaml {
  id: string;
  tipo: string;
  min?: number;
  max?: number;
  paso?: number;
  opciones?: string[];
  requerido?: boolean;
  derivado?: boolean;
}

interface EcuacionYaml {
  id: string;
  tex: string;
  simbolos?: { s: string; def: string }[];
  nota?: string;
}

interface ContenidoYaml {
  titulo: string;
  titulo_corto: string;
  meta: string;
  intro: string;
  explicacion: string[];
  ecuaciones: EcuacionYaml[];
  etiquetas: Record<string, string>;
  ayudas?: Record<string, string>;
  interpretacion: Record<string, string>;
  avisos?: Record<string, string>;
  metodos: string;
  ejemplo_descripcion: string;
  grafica_titulo?: string;
}

interface ReferenciaYaml {
  key: string;
  rol: 'original' | 'didactica' | 'complementaria';
}

interface CalculadoraYaml {
  grupo: string;
  orden: number;
  estado?: string;
  motor: 'ts' | 'webr';
  entradas: EntradaYaml[];
  ejemplo: Entradas;
  r: { paquetes?: string[]; codigo: string };
  referencias: ReferenciaYaml[];
  grafica?: string;
  tabla2x2?: { celdas: string[] };
  es: ContenidoYaml;
  en: ContenidoYaml;
}

/** Rótulos que exige una tabla 2×2 en `etiquetas` (ver Tabla2x2Input.astro). */
const ETIQUETAS_TABLA = ['tabla.filas', 'tabla.columnas', 'tabla.fila1', 'tabla.fila2', 'tabla.col1', 'tabla.col2', 'tabla.total'];

/** Completa los valores por omisión del esquema para poder usar el contenido como `ContenidoLang`. */
function normalizar(c: ContenidoYaml): ContenidoLang {
  return {
    ...c,
    ayudas: c.ayudas ?? {},
    avisos: c.avisos ?? {},
    ecuaciones: c.ecuaciones.map((e) => ({ ...e, simbolos: e.simbolos ?? [] })),
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Rutas de todas las hojas de un valor («etiquetas.x», «ecuaciones.0.tex»), ordenadas. */
function rutasDeClaves(valor: unknown, prefijo = ''): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => rutasDeClaves(v, `${prefijo}${prefijo ? '.' : ''}${i}`));
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => rutasDeClaves(v, `${prefijo}${prefijo ? '.' : ''}${k}`));
  }
  return [prefijo];
}

const ordenado = (xs: Iterable<string>): string[] => [...xs].sort();

/** Módulo puro de una calculadora; se carga bajo demanda para que un fallo no arrastre al resto. */
async function cargarDefinicion(slug: string): Promise<Definicion> {
  const url = new URL(`../../src/lib/bioestadistica/calculadoras/${slug}.ts`, import.meta.url).href;
  const modulo = (await import(url)) as { definicion?: Definicion };
  assert.ok(modulo.definicion, `${slug}.ts no exporta \`definicion\``);
  return modulo.definicion;
}

/** Compila una expresión con la misma configuración estricta que `Ecuacion.astro`. */
function compilarTex(tex: string, display: boolean): void {
  // KaTeX puede escribir en el objeto de macros (\gdef); se le pasa una copia
  // para que una ecuación no contamine a la siguiente.
  katex.renderToString(tex, {
    displayMode: display,
    output: 'mathml',
    throwOnError: true,
    strict: 'error',
    macros: { ...MACROS },
  });
}

/** Primer paso del ciclo del controlador: leer → derivar. Un derivado indefinido no entra. */
function conDerivadas(def: Definicion, ejemplo: Entradas): Entradas {
  const entradas: Entradas = { ...ejemplo };
  if (!def.derivar) return entradas;
  for (const [clave, valor] of Object.entries(def.derivar(entradas))) {
    if (valor !== undefined) entradas[clave] = valor;
  }
  return entradas;
}

/**
 * Cada aviso activo, escrito como lo publica la página en build y como lo
 * repinta el controlador: la plantilla del YAML con sus `params` puestos por
 * `nucleo/avisos.ts`. Un marcador que ningún parámetro cubre es el defecto que
 * `descriptivos` destapó en H2 («{n_atipicos} valores…» en el HTML servido).
 */
function comprobarAvisos(avisos: readonly Aviso[], textos: ContenidoLang, lang: Lang, donde: string): void {
  const params = paramsDeAvisos(avisos);
  for (const aviso of avisos) {
    const plantilla = textos.avisos[aviso.codigo];
    assert.ok(plantilla !== undefined, `${donde} · ${lang}.avisos: falta el texto de ${aviso.codigo}`);
    const sinValor = marcadores(plantilla).filter((k) => !(k in (params[aviso.codigo] ?? {})));
    assert.deepEqual(
      sinValor,
      [],
      `${donde} · ${lang}.avisos.${aviso.codigo}: marcadores sin parámetro → ${sinValor.join(', ')}`,
    );
    const texto = interpolar(plantilla, params[aviso.codigo]);
    assert.ok(!texto.includes('{'), `${donde} · ${lang}.avisos.${aviso.codigo}: marcador sin resolver en «${texto}»`);
  }
}

/** Contexto real de presentación: formateador del idioma, textos del YAML, numeración de referencias y cadenas de interfaz. */
function crearContexto(slug: string, yml: CalculadoraYaml, textos: ContenidoLang, nivel: number, lang: Lang): Contexto {
  return {
    lang,
    nivel,
    textos,
    fmt: crearFormateador(lang),
    refs: Object.fromEntries(yml.referencias.map((r, i) => [r.key, i + 1])),
    url: `https://udgca1190.com.mx/herramientas/bioestadistica/${slug}`,
    ui: conPrefijo(lang, 'bio.ui.'),
  };
}

/** Todas las cadenas que la página pintaría a partir de una presentación. */
function cadenasDe(p: Presentacion): string[] {
  const out: string[] = [...p.interpretacion, p.metodos];
  for (const celda of Object.values(p.celdas)) {
    out.push(celda.valor);
    if (celda.ic !== undefined) out.push(celda.ic);
    if (celda.nota !== undefined) out.push(celda.nota);
  }
  for (const fila of p.resumen) out.push(...fila);
  if (p.grafica) out.push(...textosDeGrafica(p.grafica));
  return out;
}

/** Todos los textos visibles o accesibles de una gráfica, sea del tipo que sea. */
function textosDeGrafica(g: DatosGrafica): string[] {
  const out: string[] = [g.titulo, g.resumen];
  switch (g.tipo) {
    case 'ic-forest':
      for (const panel of [g, ...(g.paneles ?? [])]) {
        if (panel.rotulo !== undefined) out.push(panel.rotulo);
        for (const fila of panel.filas) out.push(fila.etiqueta);
      }
      break;
    case 'fagan':
      out.push(g.ejes.pre, g.ejes.lr, g.ejes.post);
      for (const linea of g.lineas) out.push(linea.etiqueta);
      break;
    case 'curvas':
      out.push(g.ejeX.etiqueta, g.ejeY.etiqueta);
      for (const curva of g.curvas) out.push(curva.etiqueta);
      if (g.marcador?.etiqueta !== undefined) out.push(g.marcador.etiqueta);
      if (g.referenciaY?.etiqueta !== undefined) out.push(g.referenciaY.etiqueta);
      break;
    case 'barras':
      out.push(g.ejeY.etiqueta);
      for (const serie of g.series) out.push(serie.etiqueta);
      for (const categoria of g.categorias) out.push(categoria.etiqueta);
      if (g.referencia?.etiqueta !== undefined) out.push(g.referencia.etiqueta);
      break;
    case 'histograma-boxplot':
      out.push(g.ejeX.etiqueta);
      if (g.etiquetaFrecuencia !== undefined) out.push(g.etiquetaFrecuencia);
      if (g.normal !== undefined) out.push(g.normal.etiqueta);
      for (const marcador of g.marcadores ?? []) out.push(marcador.etiqueta);
      break;
    case 'km':
      out.push(g.ejeX.etiqueta, g.ejeY.etiqueta, g.etiquetaRiesgo);
      for (const curva of g.curvas) out.push(curva.etiqueta);
      for (const marcador of g.marcadores ?? []) out.push(marcador.etiqueta);
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Descubrimiento
// ---------------------------------------------------------------------------

const SLUGS = readdirSync(DIR_YAML)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => f.slice(0, -'.yml'.length))
  .sort();

const BIB = new Set(cargarBib(RUTA_BIB).map((e) => e.key));

test('hay al menos una calculadora publicada y el .bib tiene entradas', () => {
  assert.ok(SLUGS.length > 0, `no hay ningún .yml en ${DIR_YAML}`);
  assert.ok(BIB.size > 0, `${RUTA_BIB} no trae ninguna entrada`);
});

for (const slug of SLUGS) {
  const yml = yaml.load(readFileSync(`${DIR_YAML}${slug}.yml`, 'utf8')) as CalculadoraYaml;
  const contenido: Record<Lang, ContenidoLang> = { es: normalizar(yml.es), en: normalizar(yml.en) };
  const nivel = typeof yml.ejemplo.nivel === 'number' ? yml.ejemplo.nivel : 0.95;

  describe(slug, () => {
    // -----------------------------------------------------------------------
    // Paridad es / en
    // -----------------------------------------------------------------------

    test('los bloques es y en tienen la misma forma', () => {
      assert.deepEqual(ordenado(Object.keys(yml.es)), ordenado(Object.keys(yml.en)));
    });

    // Dentro de comillas dobles, YAML convierte «\a», «\b», «\e», «\f», «\t», «\v» o «\0»
    // en caracteres de control sin quejarse: "z_{1-\alpha}" se publicó una vez
    // como «z_{1-» + BEL + «lpha}» y solo se vio en la captura. Un escape
    // desconocido («\c») sí aborta la carga, pero estos no; de ahí la guarda.
    test('ningún texto del YAML trae caracteres de control (escape de LaTeX entre comillas dobles)', () => {
      const CONTROL = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/;
      const malos: string[] = [];
      const andar = (v: unknown, ruta: string): void => {
        if (typeof v === 'string') {
          const m = v.match(CONTROL);
          if (m) malos.push(`${ruta}: U+${m[0].charCodeAt(0).toString(16).padStart(4, '0')} en «${v.slice(0, 80)}»`);
        } else if (Array.isArray(v)) v.forEach((x, i) => andar(x, `${ruta}[${i}]`));
        else if (v && typeof v === 'object') for (const k of Object.keys(v)) andar((v as Record<string, unknown>)[k], `${ruta}.${k}`);
      };
      andar(yml, slug);
      assert.deepEqual(malos, [], `usa comillas simples o «\\\\» para el LaTeX en def:/nota: → ${malos.join(' · ')}`);
    });

    test('etiquetas, ayudas, interpretación y avisos traen las mismas claves en ambos idiomas', () => {
      for (const campo of ['etiquetas', 'ayudas', 'interpretacion', 'avisos'] as const) {
        const es = rutasDeClaves(contenido.es[campo]);
        const en = rutasDeClaves(contenido.en[campo]);
        const soloEs = es.filter((k) => !en.includes(k));
        const soloEn = en.filter((k) => !es.includes(k));
        assert.deepEqual(soloEs, [], `${campo}: claves sin traducir al inglés → ${soloEs.join(', ')}`);
        assert.deepEqual(soloEn, [], `${campo}: claves que solo existen en inglés → ${soloEn.join(', ')}`);
      }
    });

    test('cada plantilla usa los mismos marcadores en los dos idiomas', () => {
      // El ciclo con el ejemplo solo recorre una variante de cada banda; esta
      // comprobación alcanza a las demás, donde un {var} mal escrito en un solo
      // idioma pasaría inadvertido hasta que un usuario diera con esa rama.
      for (const campo of ['interpretacion', 'avisos'] as const) {
        for (const [clave, textoEs] of Object.entries(contenido.es[campo])) {
          const textoEn = contenido.en[campo][clave];
          if (textoEn === undefined) continue; // lo reporta la prueba de paridad
          assert.deepEqual(
            ordenado(marcadores(textoEs)),
            ordenado(marcadores(textoEn)),
            `${campo}.${clave}: los marcadores {var} difieren entre es y en`,
          );
        }
      }
      assert.deepEqual(
        ordenado(marcadores(contenido.es.metodos)),
        ordenado(marcadores(contenido.en.metodos)),
        'metodos: los marcadores {var} difieren entre es y en',
      );
      assert.deepEqual(
        ordenado(citasDe(contenido.es.metodos)),
        ordenado(citasDe(contenido.en.metodos)),
        'metodos: las referencias citadas difieren entre es y en',
      );
    });

    test('las ecuaciones son las mismas y en el mismo orden', () => {
      assert.deepEqual(
        contenido.es.ecuaciones.map((e) => e.id),
        contenido.en.ecuaciones.map((e) => e.id),
      );
      assert.ok(contenido.es.ecuaciones.length > 0, 'sin ecuaciones');
    });

    test('ningún texto del contenido está vacío', () => {
      for (const lang of IDIOMAS) {
        for (const campo of ['etiquetas', 'ayudas', 'interpretacion', 'avisos'] as const) {
          for (const [clave, texto] of Object.entries(contenido[lang][campo])) {
            assert.ok(texto.trim().length > 0, `${lang}.${campo}.${clave} está vacío`);
          }
        }
        for (const texto of contenido[lang].explicacion) {
          assert.ok(texto.trim().length > 0, `${lang}.explicacion tiene un párrafo vacío`);
        }
      }
    });

    // -----------------------------------------------------------------------
    // Contrato con el módulo
    // -----------------------------------------------------------------------

    test('el módulo se llama igual que el YAML', async () => {
      const def = await cargarDefinicion(slug);
      assert.equal(def.id, slug);
      assert.equal(def.motor, yml.motor, 'el motor del módulo y el del YAML no coinciden');
    });

    test('el contenido trae todas las claves de interpretación y aviso que el módulo usa', async () => {
      const def = await cargarDefinicion(slug);
      for (const lang of IDIOMAS) {
        const faltanClaves = def.claves.filter((k) => !(k in contenido[lang].interpretacion));
        assert.deepEqual(faltanClaves, [], `${lang}.interpretacion: faltan ${faltanClaves.join(', ')}`);
        const faltanAvisos = def.avisos.filter((k) => !(k in contenido[lang].avisos));
        assert.deepEqual(faltanAvisos, [], `${lang}.avisos: faltan ${faltanAvisos.join(', ')}`);
      }
    });

    test('cada entrada y cada salida tiene etiqueta en ambos idiomas', async () => {
      const def = await cargarDefinicion(slug);
      for (const lang of IDIOMAS) {
        const etiquetas = contenido[lang].etiquetas;
        for (const entrada of yml.entradas) {
          assert.ok(entrada.id in etiquetas, `${lang}.etiquetas: falta la entrada ${entrada.id}`);
        }
        const faltan = def.salidas.filter((s) => !(s in etiquetas));
        assert.deepEqual(faltan, [], `${lang}.etiquetas: faltan las salidas ${faltan.join(', ')}`);
      }
    });

    // -----------------------------------------------------------------------
    // Ejemplo
    // -----------------------------------------------------------------------

    test('el ejemplo cubre las entradas requeridas y no inventa ninguna', () => {
      for (const entrada of yml.entradas) {
        const requerido = entrada.requerido ?? true;
        const derivado = entrada.derivado ?? false;
        if (requerido && !derivado) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(yml.ejemplo, entrada.id),
            `ejemplo: falta la entrada requerida ${entrada.id}`,
          );
        }
      }
      const declaradas = new Set(yml.entradas.map((e) => e.id));
      const sobran = Object.keys(yml.ejemplo).filter((k) => !declaradas.has(k));
      assert.deepEqual(sobran, [], `ejemplo: claves que no son entradas declaradas → ${sobran.join(', ')}`);
    });

    test('el ejemplo pasa la validación del módulo', async () => {
      const def = await cargarDefinicion(slug);
      // El ciclo del controlador es leer → derivar → validar.
      assert.equal(def.validar(conDerivadas(def, yml.ejemplo)), null, 'validar() rechaza el ejemplo del YAML');
    });

    // -----------------------------------------------------------------------
    // Referencias
    // -----------------------------------------------------------------------

    test('todas las referencias existen en referencias.bib y no se repiten', () => {
      const faltan = yml.referencias.map((r) => r.key).filter((k) => !BIB.has(k));
      assert.deepEqual(faltan, [], `${RUTA_BIB}: claves inexistentes → ${faltan.join(', ')}`);
      assert.deepEqual(
        ordenado(new Set(yml.referencias.map((r) => r.key))),
        ordenado(yml.referencias.map((r) => r.key)),
        'la lista de referencias repite una clave (rompería la numeración)',
      );
    });

    test('hay al menos una referencia con rol original', () => {
      assert.ok(
        yml.referencias.some((r) => r.rol === 'original'),
        'falta la referencia original del método',
      );
    });

    test('el párrafo de Métodos solo cita referencias de la lista', () => {
      const claves = new Set(yml.referencias.map((r) => r.key));
      for (const lang of IDIOMAS) {
        const citadas = citasDe(contenido[lang].metodos);
        const faltan = citadas.filter((k) => !claves.has(k));
        assert.deepEqual(faltan, [], `${lang}.metodos cita claves fuera de \`referencias\` → ${faltan.join(', ')}`);
      }
    });

    // -----------------------------------------------------------------------
    // Plantilla de R
    // -----------------------------------------------------------------------

    test('el snippet de R cumple el contrato del motor', () => {
      assert.match(yml.r.codigo, /^res <- list\(/m, 'falta `res <- list(` al inicio de línea');
      assert.ok(yml.r.codigo.includes('cat(toJSON(res'), 'falta `cat(toJSON(res`');
    });

    test('los marcadores del snippet se rellenan con el ejemplo y no queda ninguno', () => {
      const usados = [...yml.r.codigo.matchAll(MARCADOR)].map((m) => m[1] as string);
      const sinValor = [...new Set(usados)].filter(
        (k) => !Object.prototype.hasOwnProperty.call(yml.ejemplo, k),
      );
      assert.deepEqual(sinValor, [], `r.codigo: marcadores sin valor en \`ejemplo\` → ${sinValor.join(', ')}`);
      const relleno = rellenarR(yml.r.codigo, yml.ejemplo);
      const restantes = [...relleno.matchAll(MARCADOR)].map((m) => m[0]);
      assert.deepEqual(restantes, [], `r.codigo: marcadores sin rellenar → ${restantes.join(', ')}`);
    });

    test('el snippet solo carga paquetes disponibles en el navegador', () => {
      const paquetes = yml.r.paquetes ?? [];
      const fuera = paquetes.filter((p) => !PAQUETES_ADMITIDOS.has(p));
      assert.deepEqual(fuera, [], `r.paquetes fuera de los admitidos → ${fuera.join(', ')}`);
    });

    // -----------------------------------------------------------------------
    // Ecuaciones
    // -----------------------------------------------------------------------

    test('las ecuaciones y sus símbolos compilan con KaTeX en modo estricto', () => {
      for (const lang of IDIOMAS) {
        for (const ecuacion of contenido[lang].ecuaciones) {
          assert.doesNotThrow(
            () => compilarTex(ecuacion.tex, true),
            `${lang}.ecuaciones[${ecuacion.id}].tex no compila`,
          );
          for (const simbolo of ecuacion.simbolos) {
            assert.doesNotThrow(
              () => compilarTex(simbolo.s, false),
              `${lang}.ecuaciones[${ecuacion.id}].simbolos: «${simbolo.s}» no compila`,
            );
          }
        }
      }
    });

    // -----------------------------------------------------------------------
    // Ciclo completo con el ejemplo, en los dos idiomas
    // -----------------------------------------------------------------------

    test('el ciclo calcular → presentar corre en español y en inglés', async () => {
      const def = await cargarDefinicion(slug);
      assert.ok(
        def.calcular !== undefined || def.motor === 'webr',
        'una calculadora de motor `ts` debe exportar calcular()',
      );
      if (!def.calcular) return;

      const entradas = conDerivadas(def, yml.ejemplo);
      const resultado = def.calcular(entradas, nivel);

      for (const lang of IDIOMAS) {
        const ctx = crearContexto(slug, yml, contenido[lang], nivel, lang);

        // presentar() rellena cada plantilla: un {var} sin valor lanzaría aquí.
        const presentacion = def.presentar(resultado, entradas, ctx);

        // Mismo conjunto Y mismo orden: `Presentacion.celdas` va «en el orden
        // de `Definicion.salidas`» (tipos.ts) y es lo que recorren el CSV y el
        // Markdown; ordenar antes de comparar dejaba pasar un orden distinto.
        assert.deepEqual(
          Object.keys(presentacion.celdas),
          [...def.salidas],
          `${lang}: las celdas no siguen el orden de definicion.salidas`,
        );
        assert.ok(presentacion.interpretacion.length > 0, `${lang}: interpretación vacía`);
        assert.ok(presentacion.resumen.length > 0, `${lang}: resumen vacío`);

        for (const cadena of cadenasDe(presentacion)) {
          assert.ok(!cadena.includes('{'), `${lang}: marcador sin rellenar en «${cadena}»`);
          assert.ok(cadena.trim().length > 0 || cadena === '', `${lang}: cadena en blanco`);
        }

        const avisosFuera = presentacion.avisos.filter((a) => !def.avisos.includes(a));
        assert.deepEqual(avisosFuera, [], `${lang}: avisos no declarados en definicion.avisos → ${avisosFuera.join(', ')}`);
        for (const aviso of presentacion.avisos) {
          assert.ok(aviso in contenido[lang].avisos, `${lang}.avisos: falta el texto de ${aviso}`);
        }
        comprobarAvisos(resultado.avisos, contenido[lang], lang, 'ejemplo');
      }
    });

    test('los avisos de cada caso del fixture se escriben completos con sus parámetros', async () => {
      const def = await cargarDefinicion(slug);
      if (!def.calcular) return;
      // Los casos curados activan los avisos que el ejemplo no activa (celdas
      // en 0, n pequeño, atípicos…): ahí es donde un `{param}` sin valor se
      // colaría en el HTML servido y en el repintado del navegador.
      const fixture = leerFixture(slug);
      assert.ok(fixture.casos.length > 0, `fixtures/${slug}.json sin casos`);
      for (const caso of fixture.casos) {
        const entradas = conDerivadas(def, caso.entradas);
        const nivelCaso = typeof entradas.nivel === 'number' ? entradas.nivel : nivel;
        const resultado = def.calcular(entradas, nivelCaso);
        for (const lang of IDIOMAS) comprobarAvisos(resultado.avisos, contenido[lang], lang, caso.id);
      }
    });

    test('ninguna calculadora exporta rScript mientras el generador de fixtures solo conozca r.codigo', async () => {
      // `Definicion.rScript` anularía la plantilla en la página y en webR, pero
      // `scripts/bio-fixtures.mjs` seguiría validando `r.codigo` y el
      // `plantilla_sha256` no lo detectaría: el R que se ve dejaría de ser el R
      // que valida. Las columnas pegadas van como `c(...)` en la plantilla
      // (DECISIONES H2); `rScript` queda para los modelos con datos.csv (H5).
      const def = await cargarDefinicion(slug);
      assert.equal(def.rScript, undefined, `${slug}: rScript no está soportado por el generador de fixtures`);
    });

    test('la gráfica declarada en el YAML se produce con datos', async () => {
      const def = await cargarDefinicion(slug);
      const tipoYaml = yml.grafica ?? 'ninguna';
      if (tipoYaml === 'ninguna') {
        assert.equal(def.grafica, undefined, 'el YAML dice `grafica: ninguna` pero el módulo exporta grafica()');
        return;
      }
      assert.ok(def.grafica, `el YAML declara \`grafica: ${tipoYaml}\` pero el módulo no exporta grafica()`);
      assert.ok(def.calcular, 'sin calcular() no se puede construir la gráfica');

      const entradas = conDerivadas(def, yml.ejemplo);
      const resultado = def.calcular(entradas, nivel);

      for (const lang of IDIOMAS) {
        const ctx = crearContexto(slug, yml, contenido[lang], nivel, lang);
        const datos = def.grafica(resultado, entradas, ctx);
        assert.ok(datos, `${lang}: grafica() devolvió null`);
        assert.equal(datos.tipo, tipoYaml, `${lang}: el tipo de gráfica no coincide con el YAML`);
        assert.ok(datos.resumen.trim().length > 0, `${lang}: la gráfica no tiene texto alternativo`);
        switch (datos.tipo) {
          case 'ic-forest':
            assert.ok(datos.filas.length > 0, `${lang}: la gráfica no tiene filas`);
            for (const panel of datos.paneles ?? []) {
              assert.ok(panel.filas.length > 0, `${lang}: un panel secundario no tiene filas`);
            }
            break;
          case 'fagan':
            assert.ok(datos.lineas.length > 0, `${lang}: el nomograma no tiene rectas`);
            assert.ok(Number.isFinite(datos.pre), `${lang}: preprueba no finita`);
            for (const linea of datos.lineas) assert.ok(Number.isFinite(linea.lr) && Number.isFinite(linea.post), `${lang}: recta «${linea.id}» sin números`);
            break;
          case 'curvas':
            assert.ok(datos.curvas.length > 0, `${lang}: la gráfica no tiene curvas`);
            for (const curva of datos.curvas) assert.ok(curva.puntos.length > 1, `${lang}: curva «${curva.id}» con menos de dos puntos`);
            break;
          case 'barras':
            assert.ok(datos.series.length > 0, `${lang}: la gráfica no tiene series`);
            assert.ok(datos.categorias.length > 0, `${lang}: la gráfica no tiene categorías`);
            for (const categoria of datos.categorias) {
              assert.equal(
                categoria.valores.length,
                datos.series.length,
                `${lang}: la categoría «${categoria.id}» no trae un valor por serie`,
              );
            }
            break;
          case 'histograma-boxplot': {
            const caja = datos.caja;
            // El resumen puede tener piezas «no definidas» (una columna vacía),
            // pero si están, tienen que venir ordenadas.
            if ([caja.q1, caja.mediana, caja.q3].every((v) => Number.isFinite(v))) {
              assert.ok(
                caja.q1 <= caja.mediana && caja.mediana <= caja.q3,
                `${lang}: el resumen de cinco números no está ordenado (${caja.q1}, ${caja.mediana}, ${caja.q3})`,
              );
            }
            if (datos.bins) {
              assert.ok(datos.bins.length > 0, `${lang}: el histograma declara bins pero está vacío`);
              for (const bin of datos.bins) {
                assert.ok(bin.n >= 0, `${lang}: la clase [${bin.desde}, ${bin.hasta}) tiene frecuencia negativa`);
              }
            }
            break;
          }
          case 'km':
            assert.ok(datos.curvas.length > 0, `${lang}: la gráfica no tiene curvas`);
            for (const curva of datos.curvas) {
              assert.ok(curva.pasos.length > 0, `${lang}: la curva «${curva.id}» no tiene escalones`);
              // Toda curva de Kaplan-Meier arranca en (0, 1): antes del primer
              // evento nadie ha fallado y el escalón inicial no es opcional.
              assert.ok(
                curva.pasos[0].t === 0 && curva.pasos[0].s === 1,
                `${lang}: la curva «${curva.id}» no arranca en (0, 1)`,
              );
              assert.equal(
                curva.enRiesgo.length,
                datos.tiemposRiesgo.length,
                `${lang}: la curva «${curva.id}» no trae un número en riesgo por tiempo de la tabla`,
              );
            }
            break;
        }
        for (const texto of textosDeGrafica(datos)) {
          assert.ok(texto.trim().length > 0, `${lang}: la gráfica tiene un texto vacío (etiqueta, eje o rótulo)`);
        }
      }
    });

    // -----------------------------------------------------------------------
    // Disposición de tabla 2×2 y entradas con opciones
    // -----------------------------------------------------------------------

    test('la tabla 2×2, si se declara, nombra cuatro enteros y trae sus rótulos en ambos idiomas', () => {
      if (!yml.tabla2x2) return;
      assert.equal(yml.tabla2x2.celdas.length, 4);
      for (const id of yml.tabla2x2.celdas) {
        const entrada = yml.entradas.find((e) => e.id === id);
        assert.ok(entrada && entrada.tipo === 'entero' && !entrada.derivado, `tabla2x2: «${id}» no es una entrada entera declarada`);
      }
      for (const lang of IDIOMAS) {
        const faltan = ETIQUETAS_TABLA.filter((k) => !(k in contenido[lang].etiquetas));
        assert.deepEqual(faltan, [], `${lang}.etiquetas: faltan los rótulos de la tabla → ${faltan.join(', ')}`);
      }
    });

    test('cada opción de un selector tiene rótulo en ambos idiomas y el ejemplo elige una de ellas', () => {
      for (const entrada of yml.entradas) {
        const opciones: string[] | undefined = entrada.opciones;
        if (!opciones) continue;
        assert.ok(opciones.length >= 2, `${entrada.id}: un selector necesita al menos dos opciones`);
        for (const lang of IDIOMAS) {
          const faltan: string[] = opciones.filter((op: string) => !(`${entrada.id}.${op}` in contenido[lang].etiquetas));
          assert.deepEqual(faltan, [], `${lang}.etiquetas: faltan los rótulos ${faltan.map((op: string) => `${entrada.id}.${op}`).join(', ')}`);
        }
        const valor = yml.ejemplo[entrada.id];
        if (valor !== undefined) {
          assert.ok(opciones.includes(String(valor)), `ejemplo.${entrada.id} = ${String(valor)} no es una de las opciones`);
        }
      }
    });

    test('el YAML no trae claves de interpretación que el módulo no use', async () => {
      const def = await cargarDefinicion(slug);
      for (const lang of IDIOMAS) {
        const huerfanas = Object.keys(contenido[lang].interpretacion).filter((k) => !def.claves.includes(k));
        assert.deepEqual(huerfanas, [], `${lang}.interpretacion: claves que ningún módulo rellena → ${huerfanas.join(', ')}`);
        const avisosHuerfanos = Object.keys(contenido[lang].avisos).filter((k) => !def.avisos.includes(k));
        assert.deepEqual(avisosHuerfanos, [], `${lang}.avisos: códigos que el módulo nunca activa → ${avisosHuerfanos.join(', ')}`);
      }
    });
  });
}
