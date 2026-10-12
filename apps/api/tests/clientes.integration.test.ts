import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { PERFIS, PERMISSOES, type Acao, type Cliente, type Perfil } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { semearClientes, semearUsuarios } from '../src/db/seed';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
const app = () => criarAppDeTeste(db);
const cookies = {} as Record<Perfil, string>;

beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());
beforeEach(async () => {
  await limpar(db);
  await semearUsuarios(db, ITERACOES_TESTE);
  for (const p of PERFIS) cookies[p] = (await entrar(app(), `${p}@demo.crm`)).cookie;
});

const chamar = (perfil: Perfil, metodo: string, caminho: string, corpo?: unknown) =>
  app().request(caminho, {
    method: metodo,
    headers: { ...csrf, cookie: cookies[perfil] },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

const novo = {
  tipo: 'PF',
  nome: 'Maria Exemplo',
  email: 'maria@exemplo.test',
  documento: 'EXEMPLO-1',
};
const criar = async (perfil: Perfil = 'admin', corpo: object = novo) => {
  const res = await chamar(perfil, 'POST', '/api/clientes', corpo);
  return { res, cliente: ((await res.json()) as { cliente: Cliente }).cliente };
};
const auditoriaDe = async () =>
  (await db.select().from(schema.auditoria).orderBy(schema.auditoria.id)).filter(
    (a) => a.entidade === 'cliente',
  );

describe('CRUD', () => {
  it('cria, lê, edita e exclui', async () => {
    const { res, cliente } = await criar();
    expect(res.status).toBe(201);
    expect(cliente).toMatchObject({ nome: 'Maria Exemplo', tipo: 'PF', telefone: null });

    const lido = await chamar('assistente', 'GET', `/api/clientes/${cliente.id}`);
    expect(lido.status).toBe(200);

    const ed = await chamar('advogado', 'PUT', `/api/clientes/${cliente.id}`, {
      ...novo,
      nome: 'Maria Editada',
    });
    expect(ed.status).toBe(200);
    expect(((await ed.json()) as { cliente: Cliente }).cliente.nome).toBe('Maria Editada');

    expect((await chamar('admin', 'DELETE', `/api/clientes/${cliente.id}`)).status).toBe(200);
    expect((await chamar('admin', 'GET', `/api/clientes/${cliente.id}`)).status).toBe(404);
  });

  it('recusa dados inválidos (400) e ids malucos', async () => {
    expect((await criar('admin', { tipo: 'PF', nome: 'A' })).res.status).toBe(400);
    expect((await criar('admin', { ...novo, email: 'ruim' })).res.status).toBe(400);
    expect((await chamar('admin', 'GET', '/api/clientes/abc')).status).toBe(400);
    expect((await chamar('admin', 'GET', '/api/clientes/99999999999')).status).toBe(400);
    expect((await chamar('admin', 'PUT', '/api/clientes/9999', novo)).status).toBe(404);
    expect((await chamar('admin', 'DELETE', '/api/clientes/9999')).status).toBe(404);
  });

  it('sem login → 401', async () => {
    expect((await app().request('/api/clientes')).status).toBe(401);
  });
});

describe('permissões (matriz × rotas)', () => {
  const rotas: { acao: Acao; chamada: (id: number) => [string, string, unknown?] }[] = [
    { acao: 'cliente:ver', chamada: () => ['GET', '/api/clientes'] },
    { acao: 'cliente:ver', chamada: (id) => ['GET', `/api/clientes/${id}`] },
    { acao: 'cliente:criar', chamada: () => ['POST', '/api/clientes', novo] },
    {
      acao: 'cliente:editar',
      chamada: (id) => ['PUT', `/api/clientes/${id}`, { ...novo, nome: 'Outro Nome' }],
    },
    { acao: 'cliente:excluir', chamada: (id) => ['DELETE', `/api/clientes/${id}`] },
  ];
  for (const perfil of PERFIS) {
    for (const r of rotas) {
      const permitido = PERMISSOES[r.acao].includes(perfil);
      it(`${perfil} ${permitido ? 'PODE' : 'NÃO pode'} ${r.acao} (${r.chamada(1)[0]})`, async () => {
        const { cliente } = await criar('admin');
        const [metodo, caminho, corpo] = r.chamada(cliente.id);
        const res = await chamar(perfil, metodo, caminho, corpo);
        if (permitido) expect(res.status).toBeLessThan(300);
        else expect(res.status).toBe(403);
      });
    }
  }

  it('403 não altera nada nem gera auditoria', async () => {
    const { cliente } = await criar('admin');
    const antes = (await auditoriaDe()).length;
    await chamar('assistente', 'DELETE', `/api/clientes/${cliente.id}`);
    await chamar('advogado', 'DELETE', `/api/clientes/${cliente.id}`);
    expect((await chamar('admin', 'GET', `/api/clientes/${cliente.id}`)).status).toBe(200);
    expect((await auditoriaDe()).length).toBe(antes);
  });
});

describe('listagem', () => {
  beforeEach(async () => {
    await semearClientes(db);
  });
  const listar = async (qs = '') => {
    const res = await chamar('assistente', 'GET', `/api/clientes${qs}`);
    return (await res.json()) as {
      total: number;
      itens: Cliente[];
      pagina: number;
      porPagina: number;
    };
  };

  it('pagina no servidor, ordenado por nome', async () => {
    const p1 = await listar('?porPagina=10');
    expect(p1.total).toBe(24);
    expect(p1.itens).toHaveLength(10);
    const p3 = await listar('?porPagina=10&pagina=3');
    expect(p3.itens).toHaveLength(4);
    const nomes = p1.itens.map((i) => i.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('filtra por tipo e busca por nome, e-mail ou documento (sem diferenciar maiúsculas)', async () => {
    expect((await listar('?tipo=PJ')).total).toBe(8);
    expect((await listar('?q=ltda')).total).toBe(8);
    expect((await listar('?q=CLIENTE3@')).total).toBe(1);
    expect((await listar('?q=exemplo-pf-016')).total).toBe(1);
    expect((await listar('?q=ltda&tipo=PF')).total).toBe(0);
  });

  it('trata % e _ da busca como texto, não como curinga', async () => {
    expect((await listar('?q=%25')).total).toBe(0);
    expect((await listar('?q=_')).total).toBe(0);
  });

  it('parâmetros inválidos → 400', async () => {
    expect((await chamar('admin', 'GET', '/api/clientes?porPagina=500')).status).toBe(400);
    expect((await chamar('admin', 'GET', '/api/clientes?tipo=XX')).status).toBe(400);
  });
});

describe('auditoria', () => {
  it('criar, editar e excluir geram uma linha cada, com diff e autor', async () => {
    const { cliente } = await criar('advogado');
    await chamar('assistente', 'PUT', `/api/clientes/${cliente.id}`, {
      ...novo,
      telefone: '(00) 0000-0000',
    });
    await chamar('admin', 'DELETE', `/api/clientes/${cliente.id}`);
    const a = await auditoriaDe();
    expect(a.map((x) => x.acao)).toEqual(['criar', 'editar', 'excluir']);
    expect(a.every((x) => x.entidadeId === String(cliente.id))).toBe(true);
    expect(a[1]?.diff).toEqual({ telefone: { de: null, para: '(00) 0000-0000' } });
    expect(a[2]?.diff).toMatchObject({ removido: { nome: 'Maria Exemplo' } });
    const usuarios = await db.select().from(schema.usuario);
    const idDe = (p: string) => usuarios.find((u) => u.perfil === p)?.id;
    expect(a.map((x) => x.usuarioId)).toEqual([
      idDe('advogado'),
      idDe('assistente'),
      idDe('admin'),
    ]);
  });

  it('edição sem mudança não grava nem audita', async () => {
    const { cliente } = await criar('admin');
    const antes = (await auditoriaDe()).length;
    const res = await chamar('admin', 'PUT', `/api/clientes/${cliente.id}`, novo);
    expect(res.status).toBe(200);
    expect((await auditoriaDe()).length).toBe(antes);
  });

  it('se a auditoria falhar, a escrita é desfeita (mesma transação)', async () => {
    // Gatilho de teste: faz qualquer INSERT em auditoria de "cliente" falhar.
    await db.execute(sql`create or replace function falhar_auditoria() returns trigger as $$
      begin if new.entidade = 'cliente' then raise exception 'falha simulada'; end if; return new; end; $$ language plpgsql`);
    await db.execute(
      sql`create trigger t_falhar before insert on auditoria for each row execute function falhar_auditoria()`,
    );
    try {
      const res = await chamar('admin', 'POST', '/api/clientes', novo);
      expect(res.status).toBe(500);
      expect(await db.select().from(schema.cliente)).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger if exists t_falhar on auditoria`);
    }
  });
});
