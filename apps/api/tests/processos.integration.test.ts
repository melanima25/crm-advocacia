import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERFIS, PERMISSOES, gerarCnj, type Acao, type Perfil, type Processo } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { semearClientes, semearProcessos, semearUsuarios } from '../src/db/seed';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
const app = () => criarAppDeTeste(db);
const cookies = {} as Record<Perfil, string>;
let clienteId = 0;
let advogadoId = 0;

beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());
beforeEach(async () => {
  await limpar(db);
  await semearUsuarios(db, ITERACOES_TESTE);
  await semearClientes(db);
  for (const p of PERFIS) cookies[p] = (await entrar(app(), `${p}@demo.crm`)).cookie;
  clienteId = (await db.select().from(schema.cliente).orderBy(schema.cliente.id))[0]!.id;
  advogadoId = (await db.select().from(schema.usuario)).find((u) => u.perfil === 'advogado')!.id;
});

const chamar = (perfil: Perfil, metodo: string, caminho: string, corpo?: unknown) =>
  app().request(caminho, {
    method: metodo,
    headers: { ...csrf, cookie: cookies[perfil] },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

const cnj = (n: number) =>
  gerarCnj({
    sequencial: String(n).padStart(7, '0'),
    ano: '2099',
    justica: '8',
    tribunal: '26',
    origem: '0100',
  });
const corpoValido = (n = 1) => ({
  numeroCnj: cnj(n),
  clienteId,
  area: 'civel',
  vara: '1ª Vara Cível Fictícia',
  status: 'em_andamento',
  responsavelId: advogadoId,
  abertoEm: '2099-03-10',
});
const criar = async (perfil: Perfil = 'advogado', corpo: object = corpoValido()) => {
  const res = await chamar(perfil, 'POST', '/api/processos', corpo);
  return { res, processo: ((await res.json()) as { processo: Processo }).processo };
};
const auditoriaDe = async () =>
  (await db.select().from(schema.auditoria).orderBy(schema.auditoria.id)).filter(
    (a) => a.entidade === 'processo',
  );

describe('CRUD', () => {
  it('cria, lê (com nomes do cliente e do responsável), edita e exclui', async () => {
    const { res, processo } = await criar();
    expect(res.status).toBe(201);
    expect(processo).toMatchObject({
      numeroCnj: cnj(1),
      responsavelNome: 'Bruno Advogado',
      area: 'civel',
    });
    expect(processo.clienteNome).toBeTruthy();

    expect((await chamar('assistente', 'GET', `/api/processos/${processo.id}`)).status).toBe(200);
    const ed = await chamar('advogado', 'PUT', `/api/processos/${processo.id}`, {
      ...corpoValido(),
      status: 'suspenso',
    });
    expect(((await ed.json()) as { processo: Processo }).processo.status).toBe('suspenso');
    expect((await chamar('admin', 'DELETE', `/api/processos/${processo.id}`)).status).toBe(200);
    expect((await chamar('admin', 'GET', `/api/processos/${processo.id}`)).status).toBe(404);
  });

  it('número CNJ com dígito errado ou formato errado → 400, nada gravado', async () => {
    const ruim = cnj(1).replace(/-\d\d\./, '-99.');
    expect((await criar('admin', { ...corpoValido(), numeroCnj: ruim })).res.status).toBe(400);
    expect((await criar('admin', { ...corpoValido(), numeroCnj: '123' })).res.status).toBe(400);
    expect(await db.select().from(schema.processo)).toHaveLength(0);
  });

  it('número CNJ duplicado → 409 (tanto criando quanto editando)', async () => {
    await criar('admin', corpoValido(1));
    expect((await criar('admin', corpoValido(1))).res.status).toBe(409);
    const { processo } = await criar('admin', corpoValido(2));
    const res = await chamar('admin', 'PUT', `/api/processos/${processo.id}`, corpoValido(1));
    expect(res.status).toBe(409);
  });

  it('cliente ou responsável inexistente → 400', async () => {
    expect((await criar('admin', { ...corpoValido(), clienteId: 999999 })).res.status).toBe(400);
    expect((await criar('admin', { ...corpoValido(), responsavelId: 999999 })).res.status).toBe(
      400,
    );
  });

  it('ids malucos e inexistentes', async () => {
    expect((await chamar('admin', 'GET', '/api/processos/abc')).status).toBe(400);
    expect((await chamar('admin', 'PUT', '/api/processos/9999', corpoValido())).status).toBe(404);
    expect((await chamar('admin', 'DELETE', '/api/processos/9999')).status).toBe(404);
  });
});

describe('permissões (matriz × rotas)', () => {
  const rotas: { acao: Acao; chamada: (id: number) => [string, string, unknown?] }[] = [
    { acao: 'processo:ver', chamada: () => ['GET', '/api/processos'] },
    { acao: 'processo:ver', chamada: (id) => ['GET', `/api/processos/${id}`] },
    { acao: 'processo:ver', chamada: () => ['GET', '/api/processos/opcoes'] },
    { acao: 'processo:criar', chamada: () => ['POST', '/api/processos', corpoValido(50)] },
    {
      acao: 'processo:editar',
      chamada: (id) => ['PUT', `/api/processos/${id}`, { ...corpoValido(), vara: 'Outra Vara' }],
    },
    { acao: 'processo:excluir', chamada: (id) => ['DELETE', `/api/processos/${id}`] },
  ];
  for (const perfil of PERFIS) {
    for (const r of rotas) {
      const permitido = PERMISSOES[r.acao].includes(perfil);
      it(`${perfil} ${permitido ? 'PODE' : 'NÃO pode'} ${r.chamada(1)[0]} ${r.chamada(1)[1].replace(/\/\d+$/, '/:id')}`, async () => {
        const { processo } = await criar('admin');
        const [metodo, caminho, corpo] = r.chamada(processo.id);
        const res = await chamar(perfil, metodo, caminho, corpo);
        if (permitido) expect(res.status).toBeLessThan(300);
        else expect(res.status).toBe(403);
      });
    }
  }

  it('assistente recebe 403 ao excluir processo e nada muda', async () => {
    const { processo } = await criar('admin');
    const antes = (await auditoriaDe()).length;
    expect((await chamar('assistente', 'DELETE', `/api/processos/${processo.id}`)).status).toBe(
      403,
    );
    expect((await chamar('advogado', 'DELETE', `/api/processos/${processo.id}`)).status).toBe(403);
    expect((await chamar('admin', 'GET', `/api/processos/${processo.id}`)).status).toBe(200);
    expect((await auditoriaDe()).length).toBe(antes);
  });
});

describe('integridade com clientes', () => {
  it('cliente com processo não pode ser excluído (409) e continua existindo', async () => {
    await criar('admin');
    const res = await chamar('admin', 'DELETE', `/api/clientes/${clienteId}`);
    expect(res.status).toBe(409);
    expect((await chamar('admin', 'GET', `/api/clientes/${clienteId}`)).status).toBe(200);
  });
  it('depois de excluir o processo, o cliente pode ser excluído', async () => {
    const { processo } = await criar('admin');
    await chamar('admin', 'DELETE', `/api/processos/${processo.id}`);
    expect((await chamar('admin', 'DELETE', `/api/clientes/${clienteId}`)).status).toBe(200);
  });
});

describe('listagem', () => {
  beforeEach(async () => {
    await semearProcessos(db);
  });
  const listar = async (qs = '') =>
    (await (await chamar('assistente', 'GET', `/api/processos${qs}`)).json()) as {
      total: number;
      itens: Processo[];
    };

  it('pagina e ordena do mais recente para o mais antigo', async () => {
    const p1 = await listar('?porPagina=5');
    expect(p1.total).toBe(12);
    expect(p1.itens).toHaveLength(5);
    const datas = p1.itens.map((i) => i.abertoEm);
    expect(datas).toEqual([...datas].sort().reverse());
    expect((await listar('?porPagina=5&pagina=3')).itens).toHaveLength(2);
  });

  it('filtra por status, área e responsável; busca por número, vara ou cliente', async () => {
    const todos = (await listar('?porPagina=100')).itens;
    const conta = (f: (p: Processo) => boolean) => todos.filter(f).length;
    expect((await listar('?status=em_andamento')).total).toBe(
      conta((p) => p.status === 'em_andamento'),
    );
    expect((await listar('?area=familia')).total).toBe(conta((p) => p.area === 'familia'));
    const resp = todos[0]!.responsavelId;
    expect((await listar(`?responsavelId=${resp}`)).total).toBe(
      conta((p) => p.responsavelId === resp),
    );
    expect((await listar(`?q=${encodeURIComponent(todos[3]!.numeroCnj)}`)).total).toBe(1);
    // a busca não ignora acentos (limitação conhecida: seria preciso a extensão unaccent)
    expect((await listar(`?q=${encodeURIComponent('Família')}`)).total).toBe(
      conta((p) => p.vara.includes('Família')),
    );
    expect(conta((p) => p.vara.includes('Família'))).toBeGreaterThan(0);
    expect((await listar('?q=%25')).total).toBe(0);
  });

  it('filtros combinam (E)', async () => {
    const r = await listar('?status=em_andamento&area=civel');
    expect(r.itens.every((p) => p.status === 'em_andamento' && p.area === 'civel')).toBe(true);
  });

  it('parâmetros inválidos → 400', async () => {
    expect((await chamar('admin', 'GET', '/api/processos?status=xx')).status).toBe(400);
    expect((await chamar('admin', 'GET', '/api/processos?porPagina=500')).status).toBe(400);
  });

  it('/opcoes lista só usuários ativos', async () => {
    await db
      .update(schema.usuario)
      .set({ ativo: false })
      .where((await import('drizzle-orm')).eq(schema.usuario.email, 'assistente@demo.crm'));
    const res = await chamar('admin', 'GET', '/api/processos/opcoes');
    const nomes = ((await res.json()) as { responsaveis: { nome: string }[] }).responsaveis.map(
      (r) => r.nome,
    );
    expect(nomes).not.toContain('Carla Assistente');
    expect(nomes).toContain('Bruno Advogado');
  });
});

describe('auditoria', () => {
  it('criar, editar e excluir geram uma linha cada, com diff', async () => {
    const { processo } = await criar('advogado');
    await chamar('admin', 'PUT', `/api/processos/${processo.id}`, {
      ...corpoValido(),
      status: 'arquivado',
    });
    await chamar('admin', 'DELETE', `/api/processos/${processo.id}`);
    const a = await auditoriaDe();
    expect(a.map((x) => x.acao)).toEqual(['criar', 'editar', 'excluir']);
    expect(a[1]?.diff).toEqual({ status: { de: 'em_andamento', para: 'arquivado' } });
    expect(a[2]?.diff).toMatchObject({ removido: { numeroCnj: cnj(1) } });
  });
  it('edição sem mudança não audita; erro 409 não deixa rastro', async () => {
    const { processo } = await criar('admin');
    const antes = (await auditoriaDe()).length;
    await chamar('admin', 'PUT', `/api/processos/${processo.id}`, corpoValido());
    await criar('admin', corpoValido(1)); // duplicado
    expect((await auditoriaDe()).length).toBe(antes);
  });
});
