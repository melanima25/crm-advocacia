import { schema } from '../db/client';
import type { Db } from '../db/client';

/** Aceita o próprio banco ou uma transação: a auditoria entra na MESMA transação da escrita. */
type Executor = Pick<Db, 'insert'>;

export type RegistroAuditoria = {
  usuarioId: number | null;
  entidade: string;
  entidadeId?: string | number | null;
  acao: 'criar' | 'editar' | 'excluir' | 'login' | 'logout' | 'login_bloqueado';
  diff?: unknown;
};

export async function registrarAuditoria(ex: Executor, r: RegistroAuditoria): Promise<void> {
  await ex.insert(schema.auditoria).values({
    usuarioId: r.usuarioId,
    entidade: r.entidade,
    entidadeId: r.entidadeId == null ? null : String(r.entidadeId),
    acao: r.acao,
    diff: r.diff ?? null,
  });
}
