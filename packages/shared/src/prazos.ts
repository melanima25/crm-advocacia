import { z } from 'zod';
import { MAX_DIAS_UTEIS, dataIsoValida } from './dias-uteis';

export const TIPOS_PRAZO = ['prazo', 'audiencia', 'reuniao'] as const;
export const ROTULO_TIPO_PRAZO = {
  prazo: 'Prazo',
  audiencia: 'Audiência',
  reuniao: 'Reunião',
} as const;
export const STATUS_PRAZO = ['pendente', 'cumprido', 'perdido'] as const;
export const ROTULO_STATUS_PRAZO = {
  pendente: 'Pendente',
  cumprido: 'Cumprido',
  perdido: 'Perdido',
} as const;

const dataIso = z.string().refine(dataIsoValida, 'Data inválida (use AAAA-MM-DD)');
const dataHoraLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Data e hora inválidas')
  .refine(
    (v) =>
      dataIsoValida(v.slice(0, 10)) && Number(v.slice(11, 13)) < 24 && Number(v.slice(14, 16)) < 60,
    'Data e hora inexistentes',
  );

/**
 * Dois jeitos de informar o vencimento:
 *  - tipo "prazo" com intimação + dias úteis → o SERVIDOR calcula (o cliente não escolhe a data);
 *  - qualquer tipo com data e hora (`venceLocal`, relógio de Brasília) → vencimento manual.
 */
export const PrazoBodySchema = z
  .object({
    processoId: z.number().int().positive(),
    tipo: z.enum(TIPOS_PRAZO),
    intimacaoEm: dataIso.optional(),
    diasUteis: z.number().int().min(1).max(MAX_DIAS_UTEIS).optional(),
    venceLocal: dataHoraLocal.optional(),
    responsavelId: z.number().int().positive(),
    observacao: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    const calculado = v.intimacaoEm !== undefined || v.diasUteis !== undefined;
    if (calculado) {
      if (v.tipo !== 'prazo')
        ctx.addIssue({
          code: 'custom',
          path: ['tipo'],
          message: 'Só prazos têm contagem em dias úteis',
        });
      if (v.intimacaoEm === undefined || v.diasUteis === undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['diasUteis'],
          message: 'Informe a data da intimação e os dias úteis',
        });
      if (v.venceLocal !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['venceLocal'],
          message: 'Use a contagem OU uma data manual, não as duas',
        });
    } else if (v.venceLocal === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['venceLocal'],
        message: 'Informe o vencimento (data e hora) ou a intimação com dias úteis',
      });
    }
  });
export type PrazoBody = z.infer<typeof PrazoBodySchema>;

export const PrazoSchema = z.object({
  id: z.number().int().positive(),
  processoId: z.number().int(),
  processoNumero: z.string(),
  clienteNome: z.string(),
  tipo: z.enum(TIPOS_PRAZO),
  intimacaoEm: z.string().nullable(),
  diasUteis: z.number().int().nullable(),
  /** Instante UTC (ISO). Use `venceData`/`venceHora` para exibir em Brasília. */
  venceEm: z.string(),
  venceData: z.string(),
  venceHora: z.string(),
  status: z.enum(STATUS_PRAZO),
  /** Derivado: pendente e já passou do vencimento (relógio do servidor). */
  vencido: z.boolean(),
  responsavelId: z.number().int(),
  responsavelNome: z.string(),
  observacao: z.string().nullable(),
});
export type Prazo = z.infer<typeof PrazoSchema>;

export const PrazosQuerySchema = z.object({
  status: z.enum(STATUS_PRAZO).optional(),
  tipo: z.enum(TIPOS_PRAZO).optional(),
  responsavelId: z.coerce.number().int().positive().optional(),
  processoId: z.coerce.number().int().positive().optional(),
  /** Intervalo de datas de vencimento (relógio de Brasília), inclusive. */
  de: dataIso.optional(),
  ate: dataIso.optional(),
  /** true = só pendentes que já venceram. */
  vencidos: z.enum(['true']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(10),
});
export type PrazosQuery = z.infer<typeof PrazosQuerySchema>;

export const PrazosResponseSchema = z.object({
  pagina: z.number().int(),
  porPagina: z.number().int(),
  total: z.number().int(),
  itens: z.array(PrazoSchema),
});
export const PrazoResponseSchema = z.object({ prazo: PrazoSchema });

export const StatusBodySchema = z.object({ status: z.enum(STATUS_PRAZO) });

export const CalcularBodySchema = z.object({
  intimacaoEm: dataIso,
  diasUteis: z.number().int().min(1).max(MAX_DIAS_UTEIS),
});
export const CalcularResponseSchema = z.object({
  venceEm: z.string(),
  contagem: z.array(z.object({ n: z.number().int(), data: z.string() })),
  pulados: z.array(
    z.object({ data: z.string(), motivo: z.enum(['sabado', 'domingo', 'feriado']) }),
  ),
  /** Preenchido quando algum ano da contagem não tem nenhum feriado cadastrado (risco de contar feriado como dia útil). */
  aviso: z.string().nullable(),
});
export type CalcularResponse = z.infer<typeof CalcularResponseSchema>;

// ---------- feriados ----------
export const FeriadoBodySchema = z.object({
  data: dataIso,
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
});
export const FeriadoSchema = z.object({ data: z.string(), nome: z.string() });
export type Feriado = z.infer<typeof FeriadoSchema>;
export const FeriadosResponseSchema = z.object({ feriados: z.array(FeriadoSchema) });
