import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AREAS,
  ClientesResponseSchema,
  OpcoesResponseSchema,
  ProcessoResponseSchema,
  ROTULO_AREA,
  ROTULO_STATUS_PROCESSO,
  STATUS_PROCESSO,
  cnjValido,
  type Processo,
} from '@crm/shared';
import { chamar } from '../api';

const campo = 'rounded border border-borda bg-bg px-3 py-2';

export function ProcessoForm({
  processo,
  onFechar,
}: {
  processo: Processo | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [numeroCnj, setNumeroCnj] = useState(processo?.numeroCnj ?? '');
  const [clienteId, setClienteId] = useState(processo ? String(processo.clienteId) : '');
  const [area, setArea] = useState<Processo['area']>(processo?.area ?? 'civel');
  const [vara, setVara] = useState(processo?.vara ?? '');
  const [status, setStatus] = useState<Processo['status']>(processo?.status ?? 'em_andamento');
  const [responsavelId, setResponsavelId] = useState(
    processo ? String(processo.responsavelId) : '',
  );
  const [abertoEm, setAbertoEm] = useState(processo?.abertoEm ?? '');
  const [tocouCnj, setTocouCnj] = useState(false);

  // Demo: carrega até 100 clientes para o seletor (em produção seria uma busca com autocomplete).
  const clientes = useQuery({
    queryKey: ['clientes-opcoes'],
    queryFn: () => chamar('/api/clientes?porPagina=100', ClientesResponseSchema),
  });
  const opcoes = useQuery({
    queryKey: ['processos-opcoes'],
    queryFn: () => chamar('/api/processos/opcoes', OpcoesResponseSchema),
  });

  const cnjOk = cnjValido(numeroCnj.trim());
  const erroCnj =
    tocouCnj && !cnjOk
      ? 'Número CNJ inválido (NNNNNNN-DD.AAAA.J.TR.OOOO, com dígito verificador correto)'
      : null;

  const salvar = useMutation({
    mutationFn: () =>
      chamar(
        processo ? `/api/processos/${processo.id}` : '/api/processos',
        ProcessoResponseSchema,
        {
          method: processo ? 'PUT' : 'POST',
          corpo: {
            numeroCnj: numeroCnj.trim(),
            clienteId: Number(clienteId),
            area,
            vara,
            status,
            responsavelId: Number(responsavelId),
            abertoEm,
          },
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['processos'] });
      onFechar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setTocouCnj(true);
    if (cnjOk) salvar.mutate();
  }

  return (
    <form
      onSubmit={enviar}
      aria-labelledby="titulo-form-processo"
      className="mb-4 grid gap-3 rounded-lg border border-borda bg-surface p-4 sm:grid-cols-2"
    >
      <h2 id="titulo-form-processo" className="text-lg font-medium sm:col-span-2">
        {processo ? 'Editar processo' : 'Novo processo'}
      </h2>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Número CNJ
        <input
          required
          value={numeroCnj}
          onChange={(e) => setNumeroCnj(e.target.value)}
          onBlur={() => setTocouCnj(true)}
          placeholder="0000001-11.2099.8.26.0100"
          aria-invalid={erroCnj ? true : undefined}
          aria-describedby="ajuda-cnj"
          className={campo}
        />
        <span
          id="ajuda-cnj"
          role={erroCnj ? 'alert' : undefined}
          className={erroCnj ? 'text-red-300' : 'text-xs text-suave'}
        >
          {erroCnj ?? 'Números fictícios usam o ano 2099.'}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Cliente
        <select
          required
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className={campo}
        >
          <option value="">Selecione…</option>
          {clientes.data?.itens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Responsável
        <select
          required
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          className={campo}
        >
          <option value="">Selecione…</option>
          {opcoes.data?.responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Área
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as Processo['area'])}
          className={campo}
        >
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {ROTULO_AREA[a]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Processo['status'])}
          className={campo}
        >
          {STATUS_PROCESSO.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_PROCESSO[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Vara
        <input
          required
          minLength={2}
          maxLength={120}
          value={vara}
          onChange={(e) => setVara(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Data de abertura
        <input
          required
          type="date"
          value={abertoEm}
          onChange={(e) => setAbertoEm(e.target.value)}
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
