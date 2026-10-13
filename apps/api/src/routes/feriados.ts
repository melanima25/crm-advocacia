import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { FeriadoBodySchema, FeriadosResponseSchema, dataIsoValida } from '@crm/shared';
import { registrarAuditoria } from '../auth/auditoria';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { codigoPg } from '../db/erros';

export function feriadosRoutes(db: Db, logado: MiddlewareHandler<AppEnv>) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  r.get('/', exigir('prazo:ver'), async (c) => {
    const lista = await db.select().from(schema.feriado).orderBy(schema.feriado.data);
    return c.json(
      FeriadosResponseSchema.parse({
        feriados: lista.map((f) => ({ data: f.data, nome: f.nome })),
      }),
    );
  });

  r.post('/', exigir('feriado:gerenciar'), async (c) => {
    const corpo = FeriadoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.feriado).values(corpo.data);
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'feriado',
          entidadeId: corpo.data.data,
          acao: 'criar',
          diff: { nome: { de: null, para: corpo.data.nome } },
        });
      });
    } catch (e) {
      if (codigoPg(e) === '23505') return c.json({ erro: 'Já existe um feriado nesta data' }, 409);
      throw e;
    }
    return c.json({ data: corpo.data.data, nome: corpo.data.nome }, 201);
  });

  r.delete('/:data', exigir('feriado:gerenciar'), async (c) => {
    const data = c.req.param('data');
    if (!dataIsoValida(data)) return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    const ok = await db.transaction(async (tx) => {
      const [removido] = await tx
        .delete(schema.feriado)
        .where(eq(schema.feriado.data, data))
        .returning();
      if (!removido) return false;
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'feriado',
        entidadeId: data,
        acao: 'excluir',
        diff: { removido: { nome: removido.nome } },
      });
      return true;
    });
    if (!ok) return c.json({ erro: 'Feriado não encontrado' }, 404);
    return c.json({ ok: true });
  });

  return r;
}
