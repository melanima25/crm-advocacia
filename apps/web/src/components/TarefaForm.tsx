import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OpcoesResponseSchema,
  ProcessosResponseSchema,
  TarefaResponseSchema,
  podeFazer,
  type Perfil,
  type Tarefa,
} from '@crm/shared';
import { chamar } from '../api';

const campo = 'rounded border border-borda bg-bg px-3 py-2';

export function TarefaForm({
  tarefa,
  perfil,
  usuarioId,
  onFechar,
}: {
  tarefa: Tarefa | null;
  perfil: Perfil;
  usuarioId: number;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const atribuiOutros = podeFazer(perfil, 'tarefa:atribuir-outros');
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '');
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? '');
  const [processoId, setProcessoId] = useState(tarefa?.processoId ? String(tarefa.processoId) : '');
  const [responsavelId, setResponsavelId] = useState(String(tarefa?.responsavelId ?? usuarioId));
  const [venceEm, setVenceEm] = useState(tarefa?.venceEm ?? '');

  const processos = useQuery({
    queryKey: ['processos-opcoes'],
    queryFn: () => chamar('/api/processos?porPagina=100', ProcessosResponseSchema),
  });
  const opcoes = useQuery({
    queryKey: ['processos-opcoes-resp'],
    queryFn: () => chamar('/api/processos/opcoes', OpcoesResponseSchema),
    enabled: atribuiOutros,
  });

  const salvar = useMutation({
    mutationFn: () =>
      chamar(tarefa ? `/api/tarefas/${tarefa.id}` : '/api/tarefas', TarefaResponseSchema, {
        method: tarefa ? 'PUT' : 'POST',
        corpo: {
          titulo,
          descricao,
          processoId: processoId ? Number(processoId) : null,
          responsavelId: Number(responsavelId),
          venceEm: venceEm || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tarefas'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      onFechar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate();
  }

  return (
    <form
      onSubmit={enviar}
      aria-labelledby="titulo-form-tarefa"
      className="mb-4 grid gap-3 rounded-lg border border-borda bg-surface p-4 sm:grid-cols-2"
    >
      <h2 id="titulo-form-tarefa" className="text-lg font-medium sm:col-span-2">
        {tarefa ? 'Editar tarefa' : 'Nova tarefa'}
      </h2>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Título
        <input
          required
          minLength={3}
          maxLength={120}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Responsável
        {atribuiOutros ? (
          <select
            required
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            className={campo}
          >
            {opcoes.data?.responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        ) : (
          <input value="Eu" readOnly className={`${campo} text-suave`} />
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Vence em (opcional)
        <input
          type="date"
          value={venceEm}
          onChange={(e) => setVenceEm(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Processo (opcional)
        <select
          value={processoId}
          onChange={(e) => setProcessoId(e.target.value)}
          className={campo}
        >
          <option value="">Sem processo</option>
          {processos.data?.itens.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numeroCnj} — {p.clienteNome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Descrição (opcional)
        <textarea
          maxLength={500}
          rows={2}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className={campo}
        />
      </label>
      {salvar.error && (
        <p role="alert" className="text-sm text-red-300 sm:col-span-2">
          {salvar.error.message}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={salvar.isPending}
          className="rounded bg-ouro px-4 py-2 font-medium text-bg disabled:opacity-60"
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={onFechar} className="rounded border border-borda px-4 py-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}
