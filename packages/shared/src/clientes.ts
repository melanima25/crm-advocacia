import { z } from 'zod';

export const TIPOS_CLIENTE = ['PF', 'PJ'] as const;
export const ROTULO_TIPO_CLIENTE = { PF: 'Pessoa física', PJ: 'Pessoa jurídica' } as const;

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/**
 * `documento` é só um texto de referência FICTÍCIO (ex.: "000.000.000-00" ou "EXEMPLO-001").
 * De propósito não validamos CPF/CNPJ: o projeto não deve receber documentos reais.
 */
export const ClienteBodySchema = z.object({
  tipo: z.enum(TIPOS_CLIENTE),
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  documento: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9A-Za-z.\-/ ]*$/, 'Use apenas letras, números, ponto, hífen e barra')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)
    .pipe(z.email('E-mail inválido').nullable()),
  telefone: textoOpcional(30),
});
export type ClienteBody = z.infer<typeof ClienteBodySchema>;

export const ClienteSchema = z.object({
  id: z.number().int().positive(),
  tipo: z.enum(TIPOS_CLIENTE),
  nome: z.string(),
  documento: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Cliente = z.infer<typeof ClienteSchema>;

export const ClientesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  tipo: z.enum(TIPOS_CLIENTE).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(10),
});
export type ClientesQuery = z.infer<typeof ClientesQuerySchema>;

export const ClientesResponseSchema = z.object({
  pagina: z.number().int(),
  porPagina: z.number().int(),
  total: z.number().int(),
  itens: z.array(ClienteSchema),
});
export type ClientesResponse = z.infer<typeof ClientesResponseSchema>;

export const ClienteResponseSchema = z.object({ cliente: ClienteSchema });

/** Só os campos que mudaram: `{ campo: { de, para } }`. Vazio = nada mudou (não audita). */
export function diffCampos<T extends Record<string, unknown>>(
  antes: T,
  depois: T,
): Record<string, { de: unknown; para: unknown }> {
  const diff: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of Object.keys(depois)) {
    if (antes[k] !== depois[k]) diff[k] = { de: antes[k] ?? null, para: depois[k] ?? null };
  }
  return diff;
}
