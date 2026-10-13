import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { PERFIS, gerarCnj, type Dashboard, type Perfil, type Tarefa } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { semearClientes, semearUsuarios } from '../src/db/seed';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
// segunda-feira 12/10/2026, 12:00 em Brasília
let agora = new Date('2026-10-12T15:00:00Z');
const app = () => criarAppDeTeste(db, { agora: () => agora, sessaoDias: 90 });
const cookies = {} as Record<Perfil, string>;
const ids = {} as Record<Perfil, number>;
let processoId = 0;

beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());
beforeEach(async () => {
  agora = new Date('2026-10-12T15:00:00Z');
  await limpar(db);
  await semearUsuarios(db, ITERACOES_TESTE);
  await semearClientes(db);
  for (const p of PERFIS) cookies[p] = (await entrar(app(), `${p}@demo.crm`)).cookie;
  for (const u of await db.select().from(schema.usuario)) ids[u.perfil] = u.id;
  const clienteId = (await db.select().from(schema.cliente))[0]!.id;
  processoId = (
    await db
      .insert(schema.processo)
      .values({
        numeroCnj: gerarCnj({
          sequencial: '0000001',
          ano: '2099',
          justica: '8',
          tribunal: '26',
          origem: '0100',
        }),
        clienteId,
        area: 'civel',
        vara: 'Vara Teste',
        responsavelId: ids.advogado,
        abertoEm: '2099-01-01',
      })
      .returning()
  )[0]!.id;
});

const chamar = (perfil: Perfil, caminho: string, metodo = 'GET', corpo?: unknown) =>
  app().request(`/api/tarefas${caminho}`, {
    method: metodo,
    headers: { ...csrf, Cookie: cookies[perfil] },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
const criar = async (perfil: Perfil, corpo: Record<string, unknown>) =>
  ((await (await chamar(perfil, '', 'POST', corpo)).json()) as { tarefa: Tarefa }).tarefa;

describe('autenticação', () => {
  it('sem sessão: 401 em tarefas e dashboard', async () => {
    expect((await app().request('/api/tarefas')).status).toBe(401);
    expect((await app().request('/api/dashboard')).status).toBe(401);
  });
});

describe('POST /api/tarefas', () => {
  it('cria para si por padrão, com auditoria', async () => {
    const res = await chamar('advogado', '', 'POST', { titulo: 'Revisar contrato', processoId });
    expect(res.status).toBe(201);
    const { tarefa } = (await res.json()) as { tarefa: Tarefa };
    expect(tarefa).toMatchObject({
      responsavelId: ids.advogado,
      status: 'a_fazer',
      processoId,
      vencida: false,
    });
    expect(tarefa.processoNumero).toMatch(/^\d{7}-\d{2}\.2099\./);
    const aud = await db
      .select()
      .from(schema.auditoria)
      .where(eq(schema.auditoria.entidade, 'tarefa'));
    expect(aud).toHaveLength(1);
    expect(aud[0]).toMatchObject({ acao: 'criar', usuarioId: ids.advogado });
  });

  it('admin e advogado atribuem a outra pessoa; assistente não', async () => {
    const ok = await chamar('advogado', '', 'POST', {
      titulo: 'Para a Carla',
      responsavelId: ids.assistente,
    });
    expect(ok.status).toBe(201);
    const no = await chamar('assistente', '', 'POST', {
      titulo: 'Para o Bruno',
      responsavelId: ids.advogado,
    });
    expect(no.status).toBe(403);
    const eu = await chamar('assistente', '', 'POST', {
      titulo: 'Para mim',
      responsavelId: ids.assistente,
    });
    expect(eu.status).toBe(201);
  });

  it('recusa responsável inativo ou inexistente e processo inexistente', async () => {
    await db
      .update(schema.usuario)
      .set({ ativo: false })
      .where(eq(schema.usuario.id, ids.assistente));
    const inativo = await chamar('admin', '', 'POST', {
      titulo: 'Tarefa',
      responsavelId: ids.assistente,
    });
    expect(inativo.status).toBe(400);
    const inexistente = await chamar('admin', '', 'POST', {
      titulo: 'Tarefa',
      responsavelId: 99999,
    });
    expect(inexistente.status).toBe(400);
    const semProc = await chamar('admin', '', 'POST', { titulo: 'Tarefa', processoId: 99999 });
    expect(semProc.status).toBe(400);
  });

  it.each([[{ titulo: 'ab' }], [{ titulo: 'Tarefa', venceEm: '2026-02-30' }], [null]])(
    'dados inválidos %j → 400',
    async (corpo) => {
      expect((await chamar('admin', '', 'POST', corpo)).status).toBe(400);
    },
  );

  it('exige o cabeçalho CSRF', async () => {
    const res = await app().request('/api/tarefas', {
      method: 'POST',
      headers: { Cookie: cookies.admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Tarefa' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/tarefas', () => {
  beforeEach(async () => {
    await criar('advogado', { titulo: 'Atrasada', venceEm: '2026-10-11' });
    await criar('advogado', { titulo: 'Vence hoje', venceEm: '2026-10-12' });
    await criar('advogado', { titulo: 'Sem data' });
    await criar('assistente', { titulo: 'Da Carla', venceEm: '2026-10-20' });
  });
  const lista = async (perfil: Perfil, q = '') =>
    (await (await chamar(perfil, q)).json()) as { total: number; itens: Tarefa[] };

  it('ordena por data (sem data por último) e marca vencida só quando passou do dia', async () => {
    const { itens, total } = await lista('assistente');
    expect(total).toBe(4);
    expect(itens.map((t) => t.titulo)).toEqual(['Atrasada', 'Vence hoje', 'Da Carla', 'Sem data']);
    expect(itens.map((t) => t.vencida)).toEqual([true, false, false, false]);
  });

  it('filtros: responsável, status, vencidas, processo', async () => {
    expect(
      (await lista('admin', `?responsavelId=${ids.assistente}`)).itens.map((t) => t.titulo),
    ).toEqual(['Da Carla']);
    expect((await lista('admin', '?vencidas=true')).itens.map((t) => t.titulo)).toEqual([
      'Atrasada',
    ]);
    expect((await lista('admin', '?status=feito')).total).toBe(0);
    expect((await lista('admin', `?processoId=${processoId}`)).total).toBe(0);
  });

  it('vencida muda com o relógio; feita nunca é vencida', async () => {
    agora = new Date('2026-10-13T15:00:00Z'); // terça: "Vence hoje" virou atrasada
    expect((await lista('admin', '?vencidas=true')).itens.map((t) => t.titulo)).toEqual([
      'Atrasada',
      'Vence hoje',
    ]);
    const id = (await lista('admin', '?vencidas=true')).itens[0]!.id;
    await chamar('admin', `/${id}/status`, 'PATCH', { status: 'feito' });
    expect((await lista('admin', '?vencidas=true')).itens.map((t) => t.titulo)).toEqual([
      'Vence hoje',
    ]);
  });

  it('parâmetros inválidos → 400; id inexistente → 404', async () => {
    expect((await chamar('admin', '?vencidas=false')).status).toBe(400);
    expect((await chamar('admin', '/99999')).status).toBe(404);
    expect((await chamar('admin', '/abc')).status).toBe(400);
  });
});

describe('PUT e PATCH — quem pode mexer', () => {
  it('assistente edita e move a própria tarefa, mas não a dos outros', async () => {
    const minha = await criar('assistente', { titulo: 'Minha tarefa' });
    const dele = await criar('advogado', { titulo: 'Tarefa do advogado' });

    expect(
      (await chamar('assistente', `/${minha.id}`, 'PUT', { titulo: 'Minha tarefa 2' })).status,
    ).toBe(200);
    expect(
      (await chamar('assistente', `/${minha.id}/status`, 'PATCH', { status: 'fazendo' })).status,
    ).toBe(200);

    expect((await chamar('assistente', `/${dele.id}`, 'PUT', { titulo: 'Invadindo' })).status).toBe(
      403,
    );
    expect(
      (await chamar('assistente', `/${dele.id}/status`, 'PATCH', { status: 'feito' })).status,
    ).toBe(403);
    const [intacta] = await db.select().from(schema.tarefa).where(eq(schema.tarefa.id, dele.id));
    expect(intacta).toMatchObject({ titulo: 'Tarefa do advogado', status: 'a_fazer' });
  });

  it('assistente não repassa a própria tarefa a outra pessoa', async () => {
    const minha = await criar('assistente', { titulo: 'Minha tarefa' });
    const res = await chamar('assistente', `/${minha.id}`, 'PUT', {
      titulo: 'Minha tarefa',
      responsavelId: ids.advogado,
    });
    expect(res.status).toBe(403);
  });

  it('advogado e admin mexem em qualquer tarefa e reatribuem', async () => {
    const t = await criar('assistente', { titulo: 'Da Carla' });
    const res = await chamar('advogado', `/${t.id}`, 'PUT', {
      titulo: 'Da Carla',
      responsavelId: ids.admin,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tarefa: Tarefa }).tarefa.responsavelId).toBe(ids.admin);
    expect((await chamar('admin', `/${t.id}/status`, 'PATCH', { status: 'feito' })).status).toBe(
      200,
    );
  });

  it('editar sem informar responsável mantém o atual (não "puxa" a tarefa)', async () => {
    const t = await criar('assistente', { titulo: 'Da Carla' });
    const res = await chamar('advogado', `/${t.id}`, 'PUT', { titulo: 'Da Carla (ajustada)' });
    expect(((await res.json()) as { tarefa: Tarefa }).tarefa.responsavelId).toBe(ids.assistente);
  });

  it('audita só o que mudou; sem mudança não gera registro', async () => {
    const t = await criar('admin', { titulo: 'Original' });
    await chamar('admin', `/${t.id}`, 'PUT', { titulo: 'Original' }); // igual
    await chamar('admin', `/${t.id}`, 'PUT', { titulo: 'Alterada' });
    await chamar('admin', `/${t.id}/status`, 'PATCH', { status: 'a_fazer' }); // igual
    await chamar('admin', `/${t.id}/status`, 'PATCH', { status: 'fazendo' });
    const aud = await db
      .select()
      .from(schema.auditoria)
      .where(eq(schema.auditoria.entidade, 'tarefa'));
    expect(aud.map((a) => a.acao)).toEqual(['criar', 'editar', 'editar']);
    expect(aud[1]!.diff).toEqual({ titulo: { de: 'Original', para: 'Alterada' } });
    expect(aud[2]!.diff).toEqual({ status: { de: 'a_fazer', para: 'fazendo' } });
  });

  it('status inválido → 400; tarefa inexistente → 404', async () => {
    const t = await criar('admin', { titulo: 'Qualquer' });
    expect((await chamar('admin', `/${t.id}/status`, 'PATCH', { status: 'pronto' })).status).toBe(
      400,
    );
    expect((await chamar('admin', '/99999/status', 'PATCH', { status: 'feito' })).status).toBe(404);
    expect((await chamar('admin', '/99999', 'PUT', { titulo: 'Qualquer' })).status).toBe(404);
  });
});

describe('integridade', () => {
  it('não apaga processo que tem tarefa (RESTRICT)', async () => {
    await criar('admin', { titulo: 'Ligada ao processo', processoId });
    await expect(
      db.delete(schema.processo).where(eq(schema.processo.id, processoId)),
    ).rejects.toThrow();
  });
});

describe('GET /api/dashboard', () => {
  const painel = async (perfil: Perfil) => {
    const res = await app().request('/api/dashboard', { headers: { Cookie: cookies[perfil] } });
    return { res, corpo: (await res.json()) as Dashboard };
  };
  const prazo = (venceEm: string, extra: Record<string, unknown> = {}) =>
    db.insert(schema.prazo).values({
      processoId,
      tipo: 'prazo',
      venceEm: new Date(venceEm),
      responsavelId: ids.advogado,
      ...extra,
    });

  it('agrega prazos pendentes por dia na janela de 7 dias (Brasília)', async () => {
    await prazo('2026-10-12T18:00:00Z'); // hoje 15:00 (agora é 12:00) → ainda vai vencer
    await prazo('2026-10-12T14:00:00Z'); // hoje 11:00 → já passou: vencido
    await prazo('2026-10-14T02:30:00Z'); // 13/10 23:30 em Brasília (não 14/10!)
    await prazo('2026-10-18T23:00:00Z'); // 18/10 20:00 → último dia da janela
    await prazo('2026-10-19T12:00:00Z'); // 19/10 → fora da janela
    await prazo('2026-10-13T15:00:00Z', { status: 'cumprido' }); // não conta
    const { corpo } = await painel('admin');
    expect(corpo.hoje).toBe('2026-10-12');
    expect(corpo.prazos.vencidos).toBe(1);
    expect(corpo.prazos.hoje).toBe(1);
    expect(corpo.prazos.proximos7).toBe(3);
    expect(corpo.prazos.porDia).toHaveLength(7);
    expect(corpo.prazos.porDia.map((d) => d.data)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(corpo.prazos.porDia.map((d) => d.total)).toEqual([1, 1, 0, 0, 0, 0, 1]);
  });

  it('tarefas abertas por pessoa (feitas não entram), com atrasadas', async () => {
    await criar('advogado', { titulo: 'Tarefa A', venceEm: '2026-10-01' });
    await criar('advogado', { titulo: 'Tarefa B' });
    const c = await criar('advogado', { titulo: 'Tarefa C' });
    await chamar('advogado', `/${c.id}/status`, 'PATCH', { status: 'fazendo' });
    const d = await criar('advogado', { titulo: 'Tarefa D' });
    await chamar('advogado', `/${d.id}/status`, 'PATCH', { status: 'feito' });
    await criar('assistente', { titulo: 'Tarefa E' });
    const { corpo } = await painel('admin');
    expect(corpo.tarefas).toMatchObject({ abertas: 4, vencidas: 1 });
    expect(corpo.tarefas.porPessoa).toEqual([
      { usuarioId: ids.advogado, nome: 'Bruno Advogado', aFazer: 2, fazendo: 1, vencidas: 1 },
      { usuarioId: ids.assistente, nome: 'Carla Assistente', aFazer: 1, fazendo: 0, vencidas: 0 },
    ]);
  });

  it('processos por status e área incluem categorias com zero, na ordem do domínio', async () => {
    const { corpo } = await painel('advogado');
    expect(corpo.processos!.total).toBe(1);
    expect(corpo.processos!.porStatus).toHaveLength(4);
    expect(corpo.processos!.porStatus.find((s) => s.status === 'em_andamento')!.total).toBe(1);
    expect(corpo.processos!.porStatus.filter((s) => s.total === 0)).toHaveLength(3);
    expect(corpo.processos!.porArea.find((a) => a.area === 'civel')!.total).toBe(1);
  });

  it('assistente recebe o painel básico: a seção de processos NÃO é enviada', async () => {
    const { res, corpo } = await painel('assistente');
    expect(res.status).toBe(200);
    expect(corpo.processos).toBeNull();
    expect(corpo.tarefas).toBeDefined();
    expect(corpo.prazos).toBeDefined();
  });

  it('a janela acompanha o relógio (virada de mês)', async () => {
    agora = new Date('2026-12-30T15:00:00Z');
    const { corpo } = await painel('admin');
    expect(corpo.prazos.porDia.map((d) => d.data)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
      '2027-01-05',
    ]);
  });
});
