import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { and, count, desc, eq, gt } from 'drizzle-orm';
import {
  AtivoBodySchema,
  AuditoriaQuerySchema,
  AuditoriaResponseSchema,
  LoginBodySchema,
  MeResponseSchema,
  UsuariosResponseSchema,
} from '@crm/shared';
import { schema, type Db } from './db/client';
import { registrarAuditoria } from './auth/auditoria';
import { autenticar, COOKIE_SESSAO, exigir, protegerCsrf, type AppEnv } from './auth/middleware';
import { criarSessao, encerrarSessao } from './auth/sessao';
import { clientesRoutes } from './routes/clientes';
import { feriadosRoutes } from './routes/feriados';
import { prazosRoutes } from './routes/prazos';
import { processosRoutes } from './routes/processos';
import { HASH_FALSO, verificarSenha } from './auth/senha';

export type AppOptions = {
  /** Cookie com flag Secure (só HTTPS). Ligado em produção. */
  cookieSeguro?: boolean;
  sessaoDias?: number;
  /** Relógio injetável para os testes (expiração de sessão, janela de bloqueio). */
  agora?: () => Date;
};

export const MAX_FALHAS = 5;
export const JANELA_BLOQUEIO_MIN = 15;

export function createApp(db: Db, options: AppOptions = {}) {
  const agora = options.agora ?? (() => new Date());
  const sessaoDias = options.sessaoDias ?? 7;
  const app = new Hono<AppEnv>();
  const logado = autenticar(db, agora);

  app.use(
    '/api/*',
    bodyLimit({ maxSize: 100_000, onError: (c) => c.json({ erro: 'Corpo grande demais' }, 413) }),
  );
  app.use('/api/*', protegerCsrf);

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // ---------------- autenticação ----------------
  app.post('/api/auth/login', async (c) => {
    const corpo = LoginBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success) return c.json({ erro: 'Informe um e-mail e uma senha válidos' }, 400);
    const { email, senha } = corpo.data;
    const t = agora();

    // 1) bloqueio: falhas recentes deste e-mail (vale mesmo que a senha agora esteja certa)
    const desde = new Date(t.getTime() - JANELA_BLOQUEIO_MIN * 60_000);
    const [{ falhas } = { falhas: 0 }] = await db
      .select({ falhas: count() })
      .from(schema.tentativaLogin)
      .where(
        and(
          eq(schema.tentativaLogin.email, email),
          eq(schema.tentativaLogin.sucesso, false),
          gt(schema.tentativaLogin.ocorridaEm, desde),
        ),
      );
    if (falhas >= MAX_FALHAS) {
      c.header('Retry-After', String(JANELA_BLOQUEIO_MIN * 60));
      return c.json(
        { erro: `Muitas tentativas. Tente de novo em ${JANELA_BLOQUEIO_MIN} minutos.` },
        429,
      );
    }

    // 2) confere a senha (gasta o mesmo tempo se o e-mail não existe)
    const [u] = await db.select().from(schema.usuario).where(eq(schema.usuario.email, email));
    const senhaOk = await verificarSenha(senha, u?.senhaHash ?? HASH_FALSO);
    if (!u || !u.ativo || !senhaOk) {
      await db.insert(schema.tentativaLogin).values({ email, sucesso: false, ocorridaEm: t });
      return c.json({ erro: 'E-mail ou senha inválidos' }, 401);
    }

    // 3) sucesso: zera as falhas, cria a sessão e audita
    const { token } = await db.transaction(async (tx) => {
      await tx.delete(schema.tentativaLogin).where(eq(schema.tentativaLogin.email, email));
      await registrarAuditoria(tx, { usuarioId: u.id, entidade: 'sessao', acao: 'login' });
      return criarSessao(tx as unknown as Db, u.id, t, sessaoDias);
    });
    setCookie(c, COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: options.cookieSeguro ?? false,
      path: '/',
      maxAge: sessaoDias * 24 * 60 * 60,
    });
    return c.json(
      MeResponseSchema.parse({
        usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo },
      }),
    );
  });

  app.post('/api/auth/logout', logado, async (c) => {
    const u = c.get('usuario');
    await db.transaction(async (tx) => {
      await registrarAuditoria(tx, { usuarioId: u.id, entidade: 'sessao', acao: 'logout' });
      await encerrarSessao(tx as unknown as Db, c.get('token'));
    });
    deleteCookie(c, COOKIE_SESSAO, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/me', logado, (c) => {
    const u = c.get('usuario');
    return c.json(MeResponseSchema.parse({ usuario: { ...u, ativo: true } }));
  });

  app.route('/api/clientes', clientesRoutes(db, logado));
  app.route('/api/processos', processosRoutes(db, logado));
  app.route('/api/prazos', prazosRoutes(db, logado, agora));
  app.route('/api/feriados', feriadosRoutes(db, logado));

  // ---------------- usuários (só admin) ----------------
  app.get('/api/usuarios', logado, exigir('usuario:gerenciar'), async (c) => {
    const lista = await db.select().from(schema.usuario).orderBy(schema.usuario.id);
    return c.json(
      UsuariosResponseSchema.parse({
        usuarios: lista.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          perfil: u.perfil,
          ativo: u.ativo,
        })),
      }),
    );
  });

  app.patch('/api/usuarios/:id/ativo', logado, exigir('usuario:gerenciar'), async (c) => {
    const id = Number(c.req.param('id'));
    const corpo = AtivoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!Number.isInteger(id) || id < 1 || !corpo.success)
      return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    if (id === eu.id && !corpo.data.ativo)
      return c.json({ erro: 'Você não pode desativar a si mesmo' }, 409);

    const resultado = await db.transaction(async (tx) => {
      const [antes] = await tx.select().from(schema.usuario).where(eq(schema.usuario.id, id));
      if (!antes) return null;
      await tx
        .update(schema.usuario)
        .set({ ativo: corpo.data.ativo })
        .where(eq(schema.usuario.id, id));
      if (!corpo.data.ativo) await tx.delete(schema.sessao).where(eq(schema.sessao.usuarioId, id)); // derruba as sessões
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'usuario',
        entidadeId: id,
        acao: 'editar',
        diff: { ativo: { de: antes.ativo, para: corpo.data.ativo } },
      });
      return { id, ativo: corpo.data.ativo };
    });
    if (!resultado) return c.json({ erro: 'Usuário não encontrado' }, 404);
    return c.json(resultado);
  });

  // ---------------- auditoria (só admin) ----------------
  app.get('/api/auditoria', logado, exigir('auditoria:ver'), async (c) => {
    const q = AuditoriaQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json({ erro: 'Parâmetros inválidos' }, 400);
    const { pagina, porPagina, entidade } = q.data;
    const filtro = entidade ? eq(schema.auditoria.entidade, entidade) : undefined;
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(schema.auditoria)
      .where(filtro);
    const linhas = await db
      .select({
        id: schema.auditoria.id,
        usuarioId: schema.auditoria.usuarioId,
        usuarioNome: schema.usuario.nome,
        entidade: schema.auditoria.entidade,
        entidadeId: schema.auditoria.entidadeId,
        acao: schema.auditoria.acao,
        diff: schema.auditoria.diff,
        criadoEm: schema.auditoria.criadoEm,
      })
      .from(schema.auditoria)
      .leftJoin(schema.usuario, eq(schema.usuario.id, schema.auditoria.usuarioId))
      .where(filtro)
      .orderBy(desc(schema.auditoria.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return c.json(
      AuditoriaResponseSchema.parse({
        pagina,
        porPagina,
        total,
        itens: linhas.map((l) => ({ ...l, criadoEm: l.criadoEm.toISOString() })),
      }),
    );
  });

  app.notFound((c) => c.json({ erro: 'Rota não encontrada' }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ erro: 'Erro interno' }, 500);
  });
  return app;
}
