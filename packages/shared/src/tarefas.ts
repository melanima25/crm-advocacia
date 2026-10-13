import { z } from 'zod';
import { dataIsoValida } from './dias-uteis';
import { AREAS, STATUS_PROCESSO } from './processos';

export const STATUS_TAREFA = ['a_fazer', 'fazendo', 'feito'] as const;
export const ROTULO_STATUS_TAREFA = {
  a_fazer: 'A fazer',
  fazendo: 'Fazendo',
  feito: 'Feito',
} as const;

const dataIso = z.string().refine(dataIsoValida, 'Data inválida (use AAAA-MM-DD)');

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const TarefaBodySchema = z.object({
  titulo: z.string().trim().min(3, 'Informe o título (mínimo 3 letras)').max(120),
  descricao: textoOpcional(500),
  processoId: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  /** Omitido = a própria pessoa logada. Só admin e advogado atribuem a outros. */
  responsavelId: z.number().int().positive().optional(),
  venceEm: dataIso
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type TarefaBody = z.infer<typeof TarefaBodySchema>;

export const TarefaSchema = z.object({
  id: z.number().int().positive(),
  titulo: z.string(),
  descricao: z.string().nullable(),
  processoId: z.number().int().nullable(),
  processoNumero: z.string().nullable(),
  responsavelId: z.number().int(),
  responsavelNome: z.string(),
  status: z.enum(STATUS_TAREFA),
  venceEm: z.string().nullable(),
  /** Derivado: não está feita e a data (Brasília) já passou. */
  vencida: z.boolean(),
});
export type Tarefa = z.infer<typeof TarefaSchema>;

export const TarefasQuerySchema = z.object({
  status: z.enum(STATUS_TAREFA).optional(),
  responsavelId: z.coerce.number().int().positive().optional(),
  processoId: z.coerce.number().int().positive().optional(),
  vencidas: z.enum(['true']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(50),
});
export const TarefasResponseSchema = z.object({
  pagina: z.number().int(),
  porPagina: z.number().int(),
  total: z.number().int(),
  itens: z.array(TarefaSchema),
});
export const TarefaResponseSchema = z.object({ tarefa: TarefaSchema });
export const StatusTarefaBodySchema = z.object({ status: z.enum(STATUS_TAREFA) });

/** Tarefa vencida = não feita e com data anterior a hoje (datas em Brasília, 'AAAA-MM-DD' compara como texto). */
export function tarefaVencida(venceEm: string | null, hoje: string, status: string): boolean {
  return status !== 'feito' && venceEm !== null && venceEm < hoje;
}

// ---------- dashboard ----------
export const DashboardSchema = z.object({
  hoje: z.string(),
  prazos: z.object({
    /** pendentes cujo vencimento já passou */
    vencidos: z.number().int(),
    /** pendentes que vencem hoje e ainda não passaram do horário */
    hoje: z.number().int(),
    /** pendentes de agora até o fim do 7º dia (hoje + 6), por dia */
    proximos7: z.number().int(),
    porDia: z.array(z.object({ data: z.string(), total: z.number().int() })),
  }),
  tarefas: z.object({
    abertas: z.number().int(),
    vencidas: z.number().int(),
    porPessoa: z.array(
      z.object({
        usuarioId: z.number().int(),
        nome: z.string(),
        aFazer: z.number().int(),
        fazendo: z.number().int(),
        vencidas: z.number().int(),
      }),
    ),
  }),
  /** Só no dashboard completo (admin e advogado). Para o assistente vem null: a API não envia o dado. */
  processos: z
    .object({
      total: z.number().int(),
      porStatus: z.array(z.object({ status: z.enum(STATUS_PROCESSO), total: z.number().int() })),
      porArea: z.array(z.object({ area: z.enum(AREAS), total: z.number().int() })),
    })
    .nullable(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
