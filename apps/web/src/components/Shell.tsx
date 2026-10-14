import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ACOES, ROTULO_PERFIL, acoesDoPerfil, podeFazer, type UsuarioPublico } from '@crm/shared';
import { chamar } from '../api';
import { Dashboard } from './Dashboard';
import { LimiteDeErro } from './LimiteDeErro';
import { Tarefas } from './Tarefas';
import { Clientes } from './Clientes';
import { Processos } from './Processos';
import { Prazos } from './Prazos';
import { Agenda } from './Agenda';
import { Feriados } from './Feriados';
import { Auditoria } from './Auditoria';
import { Permissoes } from './Permissoes';

type Aba =
  | 'painel'
  | 'tarefas'
  | 'clientes'
  | 'processos'
  | 'prazos'
  | 'agenda'
  | 'feriados'
  | 'permissoes'
  | 'auditoria';

export function Shell({ usuario }: { usuario: UsuarioPublico }) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('painel');
  const sair = useMutation({
    mutationFn: () => chamar('/api/auth/logout', z.object({ ok: z.boolean() }), { method: 'POST' }),
    onSuccess: () => qc.resetQueries(),
  });
  const verAuditoria = podeFazer(usuario.perfil, 'auditoria:ver');
  const verFeriados = podeFazer(usuario.perfil, 'feriado:gerenciar');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda pb-4">
        <div>
          <h1 className="text-xl font-semibold text-ouro">CRM Advocacia</h1>
          <p className="text-sm text-suave">
            {usuario.nome} · {ROTULO_PERFIL[usuario.perfil]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => sair.mutate()}
          className="rounded border border-borda px-3 py-1.5 text-sm hover:border-ouro"
        >
          Sair
        </button>
      </header>
      <nav aria-label="Seções" className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={aba === 'painel'}
          onClick={() => setAba('painel')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Painel
        </button>
        <button
          type="button"
          aria-pressed={aba === 'clientes'}
          onClick={() => setAba('clientes')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Clientes
        </button>
        <button
          type="button"
          aria-pressed={aba === 'processos'}
          onClick={() => setAba('processos')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Processos
        </button>
        <button
          type="button"
          aria-pressed={aba === 'prazos'}
          onClick={() => setAba('prazos')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Prazos
        </button>
        <button
          type="button"
          aria-pressed={aba === 'agenda'}
          onClick={() => setAba('agenda')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Agenda
        </button>
        <button
          type="button"
          aria-pressed={aba === 'tarefas'}
          onClick={() => setAba('tarefas')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Tarefas
        </button>
        {verFeriados && (
          <button
            type="button"
            aria-pressed={aba === 'feriados'}
            onClick={() => setAba('feriados')}
            className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
          >
            Feriados
          </button>
        )}
        <button
          type="button"
          aria-pressed={aba === 'permissoes'}
          onClick={() => setAba('permissoes')}
          className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
        >
          Minhas permissões
        </button>
        {verAuditoria && (
          <button
            type="button"
            aria-pressed={aba === 'auditoria'}
            onClick={() => setAba('auditoria')}
            className="rounded px-3 py-1.5 text-sm aria-pressed:bg-surface aria-pressed:text-ouro"
          >
            Auditoria
          </button>
        )}
      </nav>
      <main className="mt-4">
        <LimiteDeErro chave={aba}>
          {aba === 'painel' && <Dashboard />}
          {aba === 'tarefas' && <Tarefas perfil={usuario.perfil} usuarioId={usuario.id} />}
          {aba === 'clientes' && <Clientes perfil={usuario.perfil} />}
          {aba === 'processos' && <Processos perfil={usuario.perfil} />}
          {aba === 'prazos' && <Prazos perfil={usuario.perfil} usuarioId={usuario.id} />}
          {aba === 'agenda' && <Agenda />}
          {aba === 'feriados' && verFeriados && <Feriados />}
          {aba === 'permissoes' && (
            <Permissoes
              perfil={usuario.perfil}
              total={ACOES.length}
              permitidas={acoesDoPerfil(usuario.perfil)}
            />
          )}
          {aba === 'auditoria' && verAuditoria && <Auditoria />}
        </LimiteDeErro>
      </main>
    </div>
  );
}
