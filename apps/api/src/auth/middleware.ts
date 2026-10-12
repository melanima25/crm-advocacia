import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { podeFazer, type Acao } from '@crm/shared';
import type { Db } from '../db/client';
import { buscarUsuarioDaSessao, type UsuarioLogado } from './sessao';

export const COOKIE_SESSAO = 'sid';

export type Variaveis = { usuario: UsuarioLogado; token: string };
export type AppEnv = { Variables: Variaveis };

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF para requisições que alteram dados: além do cookie SameSite=Lax, exige o
 * cabeçalho `X-Requested-With`. Um site de terceiros não consegue enviá-lo sem passar por CORS.
 */
export const protegerCsrf = createMiddleware(async (c, next) => {
  if (!METODOS_SEGUROS.has(c.req.method) && c.req.header('x-requested-with') !== 'fetch') {
    return c.json({ erro: 'Requisição recusada (cabeçalho X-Requested-With ausente)' }, 403);
  }
  await next();
});

/** 401 sem sessão válida; senão coloca o usuário no contexto. */
export const autenticar = (db: Db, agora: () => Date) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, COOKIE_SESSAO);
    const usuario = token ? await buscarUsuarioDaSessao(db, token, agora()) : null;
    if (!token || !usuario) return c.json({ erro: 'Não autenticado' }, 401);
    c.set('usuario', usuario);
    c.set('token', token);
    await next();
  });

/** 403 se o perfil do usuário não tem a ação. ÚNICO ponto de autorização das rotas. */
export const exigir = (acao: Acao) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!podeFazer(c.get('usuario').perfil, acao))
      return c.json({ erro: 'Sem permissão para esta ação' }, 403);
    await next();
  });
