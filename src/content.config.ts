// Colecciones de contenido + validación de esquema (Zod).
// Los datos viven en data/*.yml (el dueño edita SOLO esos archivos).
// Si falta un campo o un valor es inválido, el build falla con un mensaje claro.
import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';
import yaml from 'js-yaml';

const parseYaml = (text: string) => yaml.load(text) as Array<Record<string, unknown>>;

const COLORES = ['blue', 'teal', 'red', 'green', 'wine', 'purple', 'gray'] as const;

const integrantes = defineCollection({
  loader: file('data/integrantes.yml', { parser: parseYaml }),
  schema: z.object({
    nombre: z.string(),
    rol: z.enum(['lider', 'integrante', 'colaborador', 'estudiante']),
    grado: z.string().optional(),
    institucion: z.string().optional(),
    lineas: z.array(z.string()).default([]),
    foto: z.string().optional(),
    orcid: z.string().optional(),
    email: z.string().optional(),
    perfiles: z.record(z.string(), z.string()).optional(),
    bio_corta: z.string().optional(),
    intereses: z.array(z.string()).default([]),
    destacado: z.boolean().default(false),
  }),
});

const lineas = defineCollection({
  loader: file('data/lineas.yml', { parser: parseYaml }),
  schema: z.object({
    titulo: z.string(),
    titulo_corto: z.string().optional(),
    orden: z.number().optional(),
    color: z.enum(COLORES),
    resumen: z.string(),
    descripcion: z.string().optional(),
    especificas: z
      .array(z.object({ id: z.string(), titulo: z.string() }))
      .default([]),
  }),
});

const herramientas = defineCollection({
  loader: file('data/herramientas.yml', { parser: parseYaml }),
  schema: z.object({
    nombre: z.string(),
    tipo: z.enum(['predictiva', 'estadistica', 'pipeline', 'docente', 'consulta']),
    estado: z.enum(['activa', 'beta', 'desarrollo']),
    resumen: z.string(),
    descripcion: z.string().optional(),
    tecnologias: z.array(z.string()).default([]),
    linea: z.string().optional(),
    enlace_app: z.string().optional(),
    repositorio: z.string().optional(),
    doi: z.string().optional(),
    captura: z.string().optional(),
    destacado: z.boolean().default(false),
    // Agrupación en la página de Herramientas: sin valor = rejilla general;
    // 'laboratorio' = sección «Laboratorio» (serie «Del tubo al diagnóstico»).
    seccion: z.enum(['laboratorio']).optional(),
    // Orden dentro de su sección (menor primero); sin valor = al final, por id.
    orden: z.number().optional(),
  }),
});

const estudios = defineCollection({
  loader: file('data/estudios.yml', { parser: parseYaml }),
  schema: z.object({
    nombre_corto: z.string(),
    titulo_completo: z.string(),
    estado: z.enum(['en_revision', 'validacion', 'reclutamiento', 'analisis', 'difusion', 'concluido']),
    linea: z.string(),
    institucion: z.string(),
    resumen: z.string(),
    descripcion: z.string().optional(),
    equipo: z.string().optional(),
    fases: z.array(z.string()).default([]),
    // Dictamen del comité de ética, cuando ya se obtuvo. Su presencia NO abre el
    // reclutamiento: eso sigue dependiendo de participacion_abierta.
    aprobacion_etica: z.object({
      comite: z.string(),
      folio: z.string(),
      fecha: z.string(),
    }).optional(),
    // Mientras sea false: sin convocatoria visible y página con noindex.
    participacion_abierta: z.boolean().default(false),
  }),
});

const actividades = defineCollection({
  loader: file('data/actividades.yml', { parser: parseYaml }),
  schema: z.object({
    tipo: z.enum(['docencia', 'edicion', 'revision', 'divulgacion', 'evento']),
    titulo: z.string(),
    descripcion: z.string().optional(),
    fecha: z.string().optional(),
    enlace: z.string().optional(),
  }),
});

export const collections = { integrantes, lineas, herramientas, actividades, estudios };
