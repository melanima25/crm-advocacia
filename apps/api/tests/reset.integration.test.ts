import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count } from 'drizzle-orm';
import { schema, type Db } from '../src/db/client';
import { resetarDemo } from '../src/db/reset';
import { semear } from '../src/db/seed';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());

const total = async (
  t:
    | typeof schema.cliente
    | typeof schema.sessao
    | typeof schema.tentativaLogin
    | typeof schema.processo
    | typeof schema.prazo
    | typeof schema.tarefa
    | typeof schema.auditoria,
) => (await db.select({ n: count() }).from(t))[0]!.n;

describe('resetarDemo (reset diário da demonstração)', () => {
  const agora = new Date('2026-10-12T08:00:00Z');

  it('apaga o que os visitantes fizeram, recria o cenário e mantém as contas demo funcionando', async () => {
    await limpar(db);
    await semear(db, ITERACOES_TESTE, agora);
    const usuariosAntes = await db.select().from(schema.usuario).orderBy(schema.usuario.id);

    // um visitante entra e mexe: cliente novo, sessão, tentativa de login, auditoria
    const app = criarAppDeTeste(db, { agora: () => agora });
    const { cookie } = await entrar(app, 'advogado@demo.crm');
    const criado = await app.request('/api/clientes', {
      method: 'POST',
      headers: { ...csrf, Cookie: cookie },
      body: JSON.stringify({ tipo: 'PF', nome: 'Visitante Que Mexeu' }),
    });
    expect(criado.status).toBe(201);
    await app.request('/api/auth/login', {
      method: 'POST',
      headers: csrf,
      body: JSON.stringify({ email: 'admin@demo.crm', senha: 'errada-errada' }),
    });
    expect(await total(schema.sessao)).toBeGreaterThan(0);
    expect(await total(schema.tentativaLogin)).toBeGreaterThan(0);

    await resetarDemo(db, agora);

    expect(await total(schema.cliente)).toBe(24);
    expect(await total(schema.processo)).toBe(12);
    expect(await total(schema.prazo)).toBe(14);
    expect(await total(schema.tarefa)).toBe(12);
    expect(await total(schema.auditoria)).toBe(0);
    expect(await total(schema.sessao)).toBe(0);
    expect(await total(schema.tentativaLogin)).toBe(0);
    const nomes = (await db.select().from(schema.cliente)).map((c) => c.nome);
    expect(nomes).not.toContain('Visitante Que Mexeu');

    // contas intactas: mesmos ids e MESMOS hashes (o reset não recalcula senha) e o login continua funcionando
    const usuariosDepois = await db.select().from(schema.usuario).orderBy(schema.usuario.id);
    expect(usuariosDepois).toEqual(usuariosAntes);
    const login = await entrar(criarAppDeTeste(db, { agora: () => agora }), 'assistente@demo.crm');
    expect(login.res.status).toBe(200);
  });

  it('é repetível: rodar duas vezes dá o mesmo cenário (ids reiniciados)', async () => {
    await resetarDemo(db, agora);
    const a = (await db.select().from(schema.processo).orderBy(schema.processo.id)).map(
      (p) => [p.id, p.numeroCnj] as const,
    );
    await resetarDemo(db, agora);
    const b = (await db.select().from(schema.processo).orderBy(schema.processo.id)).map(
      (p) => [p.id, p.numeroCnj] as const,
    );
    expect(b).toEqual(a);
    expect(a[0]![0]).toBe(1);
  });

  it('é tudo-ou-nada: se algo falha no meio, os dados anteriores ficam como estavam', async () => {
    await resetarDemo(db, agora);
    const antes = await total(schema.cliente);
    const [um] = await db.select().from(schema.usuario).limit(1);
    // sem "admin@demo.crm" o seed de clientes ainda roda; forçamos falha com um relógio inválido
    await expect(resetarDemo(db, new Date('invalida'))).rejects.toThrow();
    expect(await total(schema.cliente)).toBe(antes);
    expect(um).toBeDefined();
  });
});
