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
    color: z.enum(COLORES),
    resumen: z.string(),
    descripcion: z.string().optional(),
  }),
});

const herramientas = defineCollection({
  loader: file('data/herramientas.yml', { parser: parseYaml }),
  schema: z.object({
    nombre: z.string(),
    tipo: z.enum(['predictiva', 'estadistica', 'pipeline']),
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

export const collections = { integrantes, lineas, herramientas, actividades };
