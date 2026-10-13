import { describe, expect, it } from 'vitest';
import { FeriadoBodySchema, PrazoBodySchema, PrazosQuerySchema } from './prazos';

const base = { processoId: 1, responsavelId: 2 };

describe('PrazoBodySchema', () => {
  it('aceita prazo com contagem em dias úteis', () => {
    const r = PrazoBodySchema.parse({
      ...base,
      tipo: 'prazo',
      intimacaoEm: '2026-10-12',
      diasUteis: 15,
    });
    expect(r.observacao).toBeNull();
  });
  it('aceita audiência/reunião/prazo com data e hora manual', () => {
    for (const tipo of ['audiencia', 'reuniao', 'prazo'])
      expect(
        PrazoBodySchema.safeParse({ ...base, tipo, venceLocal: '2026-10-20T14:30' }).success,
      ).toBe(true);
  });
  it.each([
    ['sem nenhuma data', { tipo: 'prazo' }],
    ['intimação sem dias', { tipo: 'prazo', intimacaoEm: '2026-10-12' }],
    ['dias sem intimação', { tipo: 'prazo', diasUteis: 5 }],
    ['contagem em audiência', { tipo: 'audiencia', intimacaoEm: '2026-10-12', diasUteis: 5 }],
    [
      'contagem e data manual juntas',
      { tipo: 'prazo', intimacaoEm: '2026-10-12', diasUteis: 5, venceLocal: '2026-10-20T10:00' },
    ],
    ['dias fora de 1..365', { tipo: 'prazo', intimacaoEm: '2026-10-12', diasUteis: 400 }],
    ['intimação inexistente', { tipo: 'prazo', intimacaoEm: '2026-02-30', diasUteis: 5 }],
    ['hora 25', { tipo: 'reuniao', venceLocal: '2026-10-20T25:00' }],
    ['data manual sem hora', { tipo: 'reuniao', venceLocal: '2026-10-20' }],
  ])('recusa %s', (_n, parte) => {
    expect(PrazoBodySchema.safeParse({ ...base, ...parte }).success).toBe(false);
  });
});

describe('outros schemas', () => {
  it('feriado exige data real e nome', () => {
    expect(
      FeriadoBodySchema.safeParse({ data: '2026-12-24', nome: 'Véspera (ponto facultativo)' })
        .success,
    ).toBe(true);
    expect(FeriadoBodySchema.safeParse({ data: '2026-02-30', nome: 'X Y' }).success).toBe(false);
    expect(FeriadoBodySchema.safeParse({ data: '2026-12-24', nome: 'X' }).success).toBe(false);
  });
  it('consulta de prazos: padrões e limites', () => {
    expect(PrazosQuerySchema.parse({})).toEqual({ pagina: 1, porPagina: 10 });
    expect(PrazosQuerySchema.safeParse({ vencidos: 'false' }).success).toBe(false);
    expect(PrazosQuerySchema.safeParse({ de: '2026-13-01' }).success).toBe(false);
  });
});
