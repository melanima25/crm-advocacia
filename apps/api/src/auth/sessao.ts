import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '../db/client';

const bytesParaBase64Url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

async function sha256Hex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Buffer.from(d).toString('hex');
}

export type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: 'admin' | 'advogado' | 'assistente';
};

/** Cria a sessão e devolve o TOKEN (vai no cookie). No banco fica só o hash dele. */
export async function criarSessao(
  db: Db,
  usuarioId: number,
  agora: Date,
  dias: number,
): Promise<{ token: string; expiraEm: Date }> {
  const token = bytesParaBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiraEm = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
  await db
    .insert(schema.sessao)
    .values({ id: await sha256Hex(token), usuarioId, criadaEm: agora, expiraEm });
  return { token, expiraEm };
}

/** Usuário dono do token, se a sessão existe, não expirou e o usuário continua ativo. */
export async function buscarUsuarioDaSessao(
  db: Db,
  token: string,
  agora: Date,
): Promise<UsuarioLogado | null> {
  const [linha] = await db
    .select({
      id: schema.usuario.id,
      nome: schema.usuario.nome,
      email: schema.usuario.email,
      perfil: schema.usuario.perfil,
    })
    .from(schema.sessao)
    .innerJoin(schema.usuario, eq(schema.usuario.id, schema.sessao.usuarioId))
    .where(
      and(
        eq(schema.sessao.id, await sha256Hex(token)),
        gt(schema.sessao.expiraEm, agora),
        eq(schema.usuario.ativo, true),
      ),
    );
  return linha ?? null;
}

export async function encerrarSessao(db: Db, token: string): Promise<void> {
  await db.delete(schema.sessao).where(eq(schema.sessao.id, await sha256Hex(token)));
}
