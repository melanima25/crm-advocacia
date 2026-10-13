import { describe, expect, it } from 'vitest';
import {
  calcularVencimento,
  dataIsoValida,
  dateParaBrasilia,
  ehDiaUtil,
  estaVencido,
  feriadosNacionais,
  fimDoDiaBrasilia,
  hojeEmBrasilia,
  localBrasiliaParaDate,
  pascoa,
  proximoDiaUtil,
  somarDias,
} from './dias-uteis';

const sem = new Set<string>();
const fer = (...d: string[]) => new Set(d);

describe('pascoa / feriados nacionais', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('Páscoa %i = %s', (ano, esperado) => expect(pascoa(ano)).toBe(esperado));

  it('Sexta-feira Santa 2026 = 03/04 e 2027 = 26/03', () => {
    const sexta = (a: number) =>
      feriadosNacionais(a).find((f) => f.nome === 'Sexta-feira Santa')?.data;
    expect(sexta(2026)).toBe('2026-04-03');
    expect(sexta(2027)).toBe('2027-03-26');
  });
  it('tem 10 feriados nacionais, ordenados e sem repetição', () => {
    const l = feriadosNacionais(2026);
    expect(l).toHaveLength(10);
    expect(l.map((x) => x.data)).toEqual([...l.map((x) => x.data)].sort());
    expect(new Set(l.map((x) => x.data)).size).toBe(10);
  });
});

describe('datas', () => {
  it('valida datas reais', () => {
    expect(dataIsoValida('2026-02-28')).toBe(true);
    expect(dataIsoValida('2028-02-29')).toBe(true);
    expect(dataIsoValida('2026-02-29')).toBe(false);
    expect(dataIsoValida('2026-13-01')).toBe(false);
    expect(dataIsoValida('26-01-01')).toBe(false);
  });
  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('calcularVencimento', () => {
  // 2026-10-12 é segunda-feira
  it('o dia da intimação não conta: intimação na segunda, 1 dia útil → terça', () => {
    expect(calcularVencimento('2026-10-12', 1, sem).venceEm).toBe('2026-10-13');
  });
  it('15 dias úteis sem feriados = 3 semanas', () => {
    expect(calcularVencimento('2026-10-12', 15, sem).venceEm).toBe('2026-11-02');
  });
  it('intimação na sexta: dia 1 é a segunda seguinte', () => {
    const r = calcularVencimento('2026-10-09', 1, sem);
    expect(r.venceEm).toBe('2026-10-12');
    expect(r.pulados.map((p) => p.motivo)).toEqual(['sabado', 'domingo']);
  });
  it('intimação em sábado e domingo: dia 1 é a segunda', () => {
    expect(calcularVencimento('2026-10-10', 1, sem).venceEm).toBe('2026-10-12');
    expect(calcularVencimento('2026-10-11', 1, sem).venceEm).toBe('2026-10-12');
  });
  it('feriado no meio da contagem empurra o vencimento (e é reportado)', () => {
    // 12/10/2026 (segunda) é feriado: intimação na sexta 09/10, 1 dia útil → terça 13/10
    const r = calcularVencimento('2026-10-09', 1, fer('2026-10-12'));
    expect(r.venceEm).toBe('2026-10-13');
    expect(r.pulados.map((p) => `${p.data}:${p.motivo}`)).toEqual([
      '2026-10-10:sabado',
      '2026-10-11:domingo',
      '2026-10-12:feriado',
    ]);
  });
  it('feriado em fim de semana não conta duas vezes', () => {
    const r = calcularVencimento('2026-10-09', 1, fer('2026-10-10'));
    expect(r.venceEm).toBe('2026-10-12');
    expect(r.pulados.find((p) => p.data === '2026-10-10')?.motivo).toBe('sabado');
  });
  it('virada de mês e de ano (Natal e Ano-Novo)', () => {
    const f = new Set(
      feriadosNacionais(2026)
        .map((x) => x.data)
        .concat(feriadosNacionais(2027).map((x) => x.data)),
    );
    // intimação 23/12/2026 (quarta): 24 (qui)=1, 25 Natal pula, 28 (seg)=2, 29=3, 30=4, 31=5, 01/01 pula, 04/01 (seg)=6
    expect(calcularVencimento('2026-12-23', 6, f).venceEm).toBe('2027-01-04');
  });
  it('o vencimento é sempre um dia útil', () => {
    const f = new Set(feriadosNacionais(2026).map((x) => x.data));
    for (let dias = 1; dias <= 60; dias++)
      for (const inicio of ['2026-03-30', '2026-04-02', '2026-04-30', '2026-09-04', '2026-11-19'])
        expect(ehDiaUtil(calcularVencimento(inicio, dias, f).venceEm, f)).toBe(true);
  });
  it('a contagem tem exatamente N dias úteis em ordem crescente', () => {
    const r = calcularVencimento('2026-10-09', 7, fer('2026-10-12'));
    expect(r.contagem).toHaveLength(7);
    expect(r.contagem.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.contagem.at(-1)?.data).toBe(r.venceEm);
  });
  it('recusa entradas inválidas', () => {
    expect(() => calcularVencimento('2026-02-30', 5, sem)).toThrow(RangeError);
    expect(() => calcularVencimento('2026-10-12', 0, sem)).toThrow(RangeError);
    expect(() => calcularVencimento('2026-10-12', 1.5, sem)).toThrow(RangeError);
    expect(() => calcularVencimento('2026-10-12', 366, sem)).toThrow(RangeError);
  });
});

describe('proximoDiaUtil (prorrogação)', () => {
  it('mantém dia útil, pula fim de semana e feriado', () => {
    expect(proximoDiaUtil('2026-10-14', sem)).toBe('2026-10-14');
    expect(proximoDiaUtil('2026-10-10', sem)).toBe('2026-10-12');
    expect(proximoDiaUtil('2026-10-10', fer('2026-10-12'))).toBe('2026-10-13');
  });
});

describe('fuso America/Sao_Paulo', () => {
  it('fim do dia em Brasília = 02:59:59Z do dia seguinte', () => {
    expect(fimDoDiaBrasilia('2026-10-13').toISOString()).toBe('2026-10-14T02:59:59.000Z');
  });
  it('relógio local → UTC → relógio local (ida e volta)', () => {
    const d = localBrasiliaParaDate('2026-10-13T14:30');
    expect(d.toISOString()).toBe('2026-10-13T17:30:00.000Z');
    expect(dateParaBrasilia(d)).toEqual({ data: '2026-10-13', hora: '14:30' });
  });
  it('2h da manhã UTC ainda é "ontem" em Brasília', () => {
    expect(hojeEmBrasilia(new Date('2026-10-14T02:00:00Z'))).toBe('2026-10-13');
    expect(hojeEmBrasilia(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14');
  });
});

describe('estaVencido', () => {
  const vence = fimDoDiaBrasilia('2026-10-13');
  it('só é vencido se pendente e o instante passou', () => {
    expect(estaVencido(vence, new Date('2026-10-13T20:00:00Z'), 'pendente')).toBe(false); // 17h em Brasília: ainda no prazo
    expect(estaVencido(vence, new Date('2026-10-14T03:00:00Z'), 'pendente')).toBe(true); // 00h de 14/10 em Brasília
    expect(estaVencido(vence, new Date('2026-10-14T03:00:00Z'), 'cumprido')).toBe(false);
    expect(estaVencido(vence, new Date('2026-10-14T03:00:00Z'), 'perdido')).toBe(false);
  });
});
