import { z } from 'zod';
import { cnjValido } from './cnj';

export const AREAS = [
  'civel',
  'trabalhista',
  'familia',
  'criminal',
  'tributario',
  'empresarial',
] as const;
export const ROTULO_AREA = {
  civel: 'Cível',
  trabalhista: 'Trabalhista',
  familia: 'Família',
  criminal: 'Criminal',
  tributario: 'Tributário',
  empresarial: 'Empresarial',
} as const;

export const STATUS_PROCESSO = ['em_andamento', 'suspenso', 'arquivado', 'encerrado'] as const;
export const ROTULO_STATUS_PROCESSO = {
  em_andamento: 'Em andamento',
  suspenso: 'Suspenso',
  arquivado: 'Arquivado',
  encerrado: 'Encerrado',
} as const;

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Data inexistente');

export const ProcessoBodySchema = z.object({
  numeroCnj: z
    .string()
    .trim()
    .refine(
      cnjValido,
      'Número CNJ inválido (formato NNNNNNN-DD.AAAA.J.TR.OOOO e dígito verificador)',
    ),
  clienteId: z.number().int().positive(),
  area: z.enum(AREAS),
  vara: z.string().trim().min(2, 'Informe a vara').max(120),
  status: z.enum(STATUS_PROCESSO).default('em_andamento'),
  responsavelId: z.number().int().positive(),
  abertoEm: dataIso,
});
export type ProcessoBody = z.infer<typeof ProcessoBodySchema>;

export const ProcessoSchema = z.object({
  id: z.number().int().positive(),
  numeroCnj: z.string(),
  clienteId: z.number().int(),
  clienteNome: z.string(),
  area: z.enum(AREAS),
  vara: z.string(),
  status: z.enum(STATUS_PROCESSO),
  responsavelId: z.number().int(),
  responsavelNome: z.string(),
  abertoEm: z.string(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Processo = z.infer<typeof ProcessoSchema>;

export const ProcessosQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(STATUS_PROCESSO).optional(),
  area: z.enum(AREAS).optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  responsavelId: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(10),
});

export const ProcessosResponseSchema = z.object({
  pagina: z.number().int(),
  porPagina: z.number().int(),
  total: z.number().int(),
  itens: z.array(ProcessoSchema),
});
export const ProcessoResponseSchema = z.object({ processo: ProcessoSchema });

export const OpcoesResponseSchema = z.object({
  responsaveis: z.array(z.object({ id: z.number().int(), nome: z.string() })),
});
