import { sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  semearClientes,
  semearFeriados,
  semearPrazos,
  semearProcessos,
  semearTarefas,
} from './seed';

/**
 * Reset diário da demonstração: apaga tudo que os visitantes criaram e recria o cenário fictício,
 * relativo a "hoje". NÃO mexe nos usuários nem recalcula senhas: o hash PBKDF2 é caro e o plano
 * gratuito do Workers dá ~10 ms de CPU por execução. As contas demo são criadas uma vez, pelo seed
 * local (`npm run seed`).
 *
 * Tudo na mesma transação: ou o cenário inteiro é recriado, ou nada muda.
 */
export async function resetarDemo(db: Db, agora: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await t.execute(
      sql`truncate table auditoria, sessao, tentativa_login, tarefa, prazo, feriado, processo, cliente restart identity cascade`,
    );
    await semearClientes(t);
    await semearProcessos(t);
    await semearFeriados(t, agora);
    await semearPrazos(t, agora);
    await semearTarefas(t, agora);
  });
}
