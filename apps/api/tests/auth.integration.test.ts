import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ACOES, PERMISSOES, PERFIS, type Acao } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { SENHA_DEMO, semear } from '../src/db/seed';
import { gerarHash } from '../src/auth/senha';
import { JANELA_BLOQUEIO_MIN, MAX_FALHAS } from '../src/app';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
let agora = new Date('2099-01-10T12:00:00Z');
const app = () => criarAppDeTeste(db, { agora: () => agora, sessaoDias: 7 });

beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());
beforeEach(async () => {
  agora = new Date('2099-01-10T12:00:00Z');
  await limpar(db);
  await semear(db, ITERACOES_TESTE);
});

const login = (email: string, senha: string) =>
  app().request('/api/auth/login', {
    method: 'POST',
    headers: csrf,
    body: JSON.stringify({ email, senha }),
  });

describe('login', () => {
  it('entra com credenciais certas e define cookie httpOnly', async () => {
    const res = await login('admin@demo.crm', SENHA_DEMO);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const corpo = (await res.json()) as { usuario: { perfil: string } };
    expect(corpo.usuario.perfil).toBe('admin');
  });

  it('o token do cookie não é o id gravado no banco (só o hash fica salvo)', async () => {
    const { cookie } = await entrar(app(), 'admin@demo.crm');
    const token = cookie.replace('sid=', '');
    const [s] = await db.select().from(schema.sessao);
    expect(s?.id).not.toBe(token);
    expect(s?.id).toHaveLength(64);
  });

  it('senha errada e e-mail inexistente dão a MESMA resposta genérica', async () => {
    const a = await login('admin@demo.crm', 'errada-errada');
    const b = await login('ninguem@demo.crm', 'errada-errada');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  it('usuário desativado não entra', async () => {
    await db
      .update(schema.usuario)
      .set({ ativo: false })
      .where(eq(schema.usuario.email, 'assistente@demo.crm'));
    expect((await login('assistente@demo.crm', SENHA_DEMO)).status).toBe(401);
  });

  it('bloqueia após 5 falhas, mesmo com a senha certa, com Retry-After', async () => {
    for (let i = 0; i < MAX_FALHAS; i++) await login('advogado@demo.crm', 'errada-errada');
    const res = await login('advogado@demo.crm', SENHA_DEMO);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(JANELA_BLOQUEIO_MIN * 60));
  });

  it('o bloqueio expira depois da janela e o sucesso zera as falhas', async () => {
    for (let i = 0; i < MAX_FALHAS; i++) await login('advogado@demo.crm', 'errada-errada');
    agora = new Date(agora.getTime() + (JANELA_BLOQUEIO_MIN + 1) * 60_000);
    expect((await login('advogado@demo.crm', SENHA_DEMO)).status).toBe(200);
    expect(await db.select().from(schema.tentativaLogin)).toHaveLength(0);
  });

  it('o bloqueio é por e-mail: outro usuário não é afetado', async () => {
    for (let i = 0; i < MAX_FALHAS; i++) await login('advogado@demo.crm', 'errada-errada');
    expect((await login('admin@demo.crm', SENHA_DEMO)).status).toBe(200);
  });

  it('recusa corpo inválido com 400', async () => {
    const res = await app().request('/api/auth/login', {
      method: 'POST',
      headers: csrf,
      body: '{"email":"nao-e-email"}',
    });
    expect(res.status).toBe(400);
  });
});

describe('sessão', () => {
  it('/api/me sem cookie → 401; com cookie → usuário', async () => {
    expect((await app().request('/api/me')).status).toBe(401);
    const { cookie } = await entrar(app(), 'advogado@demo.crm');
    const res = await app().request('/api/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { usuario: { email: string } }).usuario.email).toBe(
      'advogado@demo.crm',
    );
  });

  it('sessão expirada é recusada', async () => {
    const { cookie } = await entrar(app(), 'admin@demo.crm');
    agora = new Date(agora.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect((await app().request('/api/me', { headers: { cookie } })).status).toBe(401);
  });

  it('logout encerra a sessão no servidor', async () => {
    const { cookie } = await entrar(app(), 'admin@demo.crm');
    const out = await app().request('/api/auth/logout', {
      method: 'POST',
      headers: { ...csrf, cookie },
    });
    expect(out.status).toBe(200);
    expect((await app().request('/api/me', { headers: { cookie } })).status).toBe(401);
  });

  it('desativar o usuário derruba a sessão dele', async () => {
    const admin = await entrar(app(), 'admin@demo.crm');
    const outro = await entrar(app(), 'assistente@demo.crm');
    const [alvo] = await db
      .select()
      .from(schema.usuario)
      .where(eq(schema.usuario.email, 'assistente@demo.crm'));
    const res = await app().request(`/api/usuarios/${alvo?.id}/ativo`, {
      method: 'PATCH',
      headers: { ...csrf, cookie: admin.cookie },
      body: JSON.stringify({ ativo: false }),
    });
    expect(res.status).toBe(200);
    expect((await app().request('/api/me', { headers: { cookie: outro.cookie } })).status).toBe(
      401,
    );
  });
});

describe('CSRF', () => {
  it('POST sem X-Requested-With é recusado com 403', async () => {
    const res = await app().request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@demo.crm', senha: SENHA_DEMO }),
    });
    expect(res.status).toBe(403);
  });
});

describe('autorização por perfil (rotas existentes)', () => {
  const rotas: { acao: Acao; metodo: string; caminho: string; corpo?: unknown }[] = [
    { acao: 'usuario:gerenciar', metodo: 'GET', caminho: '/api/usuarios' },
    { acao: 'auditoria:ver', metodo: 'GET', caminho: '/api/auditoria' },
    {
      acao: 'usuario:gerenciar',
      metodo: 'PATCH',
      caminho: '/api/usuarios/999/ativo',
      corpo: { ativo: true },
    },
  ];
  for (const perfil of PERFIS) {
    for (const r of rotas) {
      const permitido = PERMISSOES[r.acao].includes(perfil);
      it(`${perfil} ${permitido ? 'PODE' : 'NÃO pode'} ${r.metodo} ${r.caminho}`, async () => {
        const { cookie } = await entrar(app(), `${perfil}@demo.crm`);
        const res = await app().request(r.caminho, {
          method: r.metodo,
          headers: { ...csrf, cookie },
          body: r.corpo ? JSON.stringify(r.corpo) : undefined,
        });
        if (permitido) expect(res.status).not.toBe(403);
        else expect(res.status).toBe(403);
      });
    }
  }
  it('a lista de ações cobre todas as rotas testadas', () => {
    for (const r of rotas) expect(ACOES).toContain(r.acao);
  });
});

describe('auditoria', () => {
  it('login, logout e edição de usuário geram linhas', async () => {
    const admin = await entrar(app(), 'admin@demo.crm');
    const [alvo] = await db
      .select()
      .from(schema.usuario)
      .where(eq(schema.usuario.email, 'assistente@demo.crm'));
    await app().request(`/api/usuarios/${alvo?.id}/ativo`, {
      method: 'PATCH',
      headers: { ...csrf, cookie: admin.cookie },
      body: JSON.stringify({ ativo: false }),
    });
    await app().request('/api/auth/logout', {
      method: 'POST',
      headers: { ...csrf, cookie: admin.cookie },
    });
    const linhas = await db.select().from(schema.auditoria).orderBy(schema.auditoria.id);
    expect(linhas.map((l) => `${l.entidade}:${l.acao}`)).toEqual([
      'sessao:login',
      'usuario:editar',
      'sessao:logout',
    ]);
    expect(linhas[1]?.diff).toEqual({ ativo: { de: true, para: false } });
    expect(linhas[1]?.entidadeId).toBe(String(alvo?.id));
  });

  it('admin não pode desativar a si mesmo (409) e nada é auditado', async () => {
    const admin = await entrar(app(), 'admin@demo.crm');
    const [eu] = await db
      .select()
      .from(schema.usuario)
      .where(eq(schema.usuario.email, 'admin@demo.crm'));
    const antes = (await db.select().from(schema.auditoria)).length;
    const res = await app().request(`/api/usuarios/${eu?.id}/ativo`, {
      method: 'PATCH',
      headers: { ...csrf, cookie: admin.cookie },
      body: JSON.stringify({ ativo: false }),
    });
    expect(res.status).toBe(409);
    expect((await db.select().from(schema.auditoria)).length).toBe(antes);
  });

  it('GET /api/auditoria pagina e filtra por entidade', async () => {
    const admin = await entrar(app(), 'admin@demo.crm');
    await entrar(app(), 'advogado@demo.crm');
    const res = await app().request('/api/auditoria?porPagina=1&entidade=sessao', {
      headers: { cookie: admin.cookie },
    });
    const corpo = (await res.json()) as { total: number; itens: unknown[]; porPagina: number };
    expect(corpo.total).toBe(2);
    expect(corpo.itens).toHaveLength(1);
  });

  it('usuário inexistente → 404 e parâmetros ruins → 400', async () => {
    const admin = await entrar(app(), 'admin@demo.crm');
    const h = { ...csrf, cookie: admin.cookie };
    expect(
      (
        await app().request('/api/usuarios/9999/ativo', {
          method: 'PATCH',
          headers: h,
          body: '{"ativo":false}',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app().request('/api/usuarios/abc/ativo', {
          method: 'PATCH',
          headers: h,
          body: '{"ativo":false}',
        })
      ).status,
    ).toBe(400);
  });
});

describe('hash legado', () => {
  it('senha gerada com outro número de iterações continua válida', async () => {
    const hash = await gerarHash(SENHA_DEMO, 2000);
    await db
      .update(schema.usuario)
      .set({ senhaHash: hash })
      .where(eq(schema.usuario.email, 'admin@demo.crm'));
    expect((await login('admin@demo.crm', SENHA_DEMO)).status).toBe(200);
  });
});
