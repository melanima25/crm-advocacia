import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dateParaBrasilia, ehDiaUtil, estaVencido, hojeEmBrasilia, somarDias } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { semear } from '../src/db/seed';
import { ITERACOES_TESTE, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());

/** O reset diário roda em qualquer dia do ano: o cenário de demonstração tem que ser coerente em todos. */
describe.each([
  '2026-10-12T15:00:00Z',
  '2027-01-04T12:00:00Z',
  '2026-12-31T23:30:00Z',
  '2027-03-26T12:00:00Z',
])('seed em %s', (iso) => {
  const agora = new Date(iso);
  it('gera o cenário completo e coerente', async () => {
    await limpar(db);
    await semear(db, ITERACOES_TESTE, agora);
    const prazos = await db.select().from(schema.prazo);
    const feriados = new Set((await db.select().from(schema.feriado)).map((f) => f.data));
    expect(prazos).toHaveLength(14);
    expect(await db.select().from(schema.processo)).toHaveLength(12);
    expect(await db.select().from(schema.usuario)).toHaveLength(3);

    // vencimentos sempre em dia útil, no relógio de Brasília
    for (const p of prazos)
      expect(ehDiaUtil(dateParaBrasilia(p.venceEm).data, feriados)).toBe(true);

    // cenário relativo a "hoje": há vencidos, itens na semana e itens futuros
    const hoje = hojeEmBrasilia(agora);
    const vencidos = prazos.filter((p) => estaVencido(p.venceEm, agora, p.status));
    expect(vencidos.length).toBeGreaterThanOrEqual(2);
    const naSemana = prazos.filter(
      (p) =>
        p.status === 'pendente' &&
        dateParaBrasilia(p.venceEm).data >= hoje &&
        dateParaBrasilia(p.venceEm).data <= somarDias(hoje, 7),
    );
    expect(naSemana.length).toBeGreaterThanOrEqual(2);
    expect(prazos.some((p) => p.status === 'cumprido')).toBe(true);
    expect(prazos.some((p) => p.status === 'perdido')).toBe(true);

    // a assistente atua em 2 processos
    const [assistente] = (await db.select().from(schema.usuario)).filter(
      (u) => u.perfil === 'assistente',
    );
    expect(
      (await db.select().from(schema.processo)).filter((p) => p.responsavelId === assistente!.id),
    ).toHaveLength(2);
  });

  it('gera 12 tarefas coerentes (atrasadas, abertas e feitas) para as 3 pessoas', async () => {
    await limpar(db);
    await semear(db, ITERACOES_TESTE, agora);
    const tarefas = await db.select().from(schema.tarefa);
    expect(tarefas).toHaveLength(12);
    expect(new Set(tarefas.map((x) => x.responsavelId)).size).toBe(3);
    const hoje = hojeEmBrasilia(agora);
    expect(tarefas.some((x) => x.status !== 'feito' && x.venceEm! < hoje)).toBe(true);
    expect(tarefas.some((x) => x.status === 'feito')).toBe(true);
    expect(tarefas.some((x) => x.processoId === null)).toBe(true);
  });

  it('é determinístico e repetível (rodar duas vezes dá o mesmo resultado)', async () => {
    await limpar(db);
    await semear(db, ITERACOES_TESTE, agora);
    const a = (await db.select().from(schema.prazo).orderBy(schema.prazo.id)).map((p) => [
      p.observacao,
      p.venceEm.toISOString(),
      p.status,
    ]);
    await semear(db, ITERACOES_TESTE, agora);
    const b = (await db.select().from(schema.prazo).orderBy(schema.prazo.id)).map((p) => [
      p.observacao,
      p.venceEm.toISOString(),
      p.status,
    ]);
    expect(b).toEqual(a);
    expect(await db.select().from(schema.cliente)).toHaveLength(24);
  });
});
