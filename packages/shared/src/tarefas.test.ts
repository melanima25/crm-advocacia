import { describe, expect, it } from 'vitest';
import { TarefaBodySchema, TarefasQuerySchema, tarefaVencida } from './tarefas';

describe('TarefaBodySchema', () => {
  it('só exige o título; o resto vira null / padrão', () => {
    expect(TarefaBodySchema.parse({ titulo: '  Ligar para o cliente ' })).toEqual({
      titulo: 'Ligar para o cliente',
      descricao: null,
      processoId: null,
      venceEm: null,
    });
  });
  it('aceita vencimento e processo', () => {
    const r = TarefaBodySchema.parse({
      titulo: 'Protocolar',
      processoId: 3,
      responsavelId: 2,
      venceEm: '2026-10-20',
    });
    expect(r).toMatchObject({ processoId: 3, responsavelId: 2, venceEm: '2026-10-20' });
  });
  it.each([
    [{ titulo: 'ab' }],
    [{ titulo: 'x'.repeat(121) }],
    [{ titulo: 'Tarefa', venceEm: '2026-02-30' }],
    [{ titulo: 'Tarefa', processoId: 0 }],
    [{ titulo: 'Tarefa', responsavelId: -1 }],
  ])('recusa %j', (corpo) => expect(TarefaBodySchema.safeParse(corpo).success).toBe(false));
});

describe('tarefaVencida', () => {
  it('vence só depois do dia; "feito" e sem data nunca vencem', () => {
    expect(tarefaVencida('2026-10-11', '2026-10-12', 'a_fazer')).toBe(true);
    expect(tarefaVencida('2026-10-12', '2026-10-12', 'a_fazer')).toBe(false); // vence hoje: ainda no prazo
    expect(tarefaVencida('2026-10-11', '2026-10-12', 'feito')).toBe(false);
    expect(tarefaVencida(null, '2026-10-12', 'fazendo')).toBe(false);
  });
});

describe('TarefasQuerySchema', () => {
  it('padrões e limites', () => {
    expect(TarefasQuerySchema.parse({})).toEqual({ pagina: 1, porPagina: 50 });
    expect(TarefasQuerySchema.safeParse({ vencidas: 'false' }).success).toBe(false);
    expect(TarefasQuerySchema.safeParse({ porPagina: '101' }).success).toBe(false);
  });
});
