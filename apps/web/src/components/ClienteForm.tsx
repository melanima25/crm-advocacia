import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClienteResponseSchema,
  ROTULO_TIPO_CLIENTE,
  TIPOS_CLIENTE,
  type Cliente,
} from '@crm/shared';
import { chamar } from '../api';

const campo = 'rounded border border-borda bg-bg px-3 py-2';

export function ClienteForm({
  cliente,
  onFechar,
}: {
  cliente: Cliente | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Cliente['tipo']>(cliente?.tipo ?? 'PF');
  const [nome, setNome] = useState(cliente?.nome ?? '');
  const [documento, setDocumento] = useState(cliente?.documento ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [telefone, setTelefone] = useState(cliente?.telefone ?? '');

  const salvar = useMutation({
    mutationFn: () =>
      chamar(cliente ? `/api/clientes/${cliente.id}` : '/api/clientes', ClienteResponseSchema, {
        method: cliente ? 'PUT' : 'POST',
        corpo: { tipo, nome, documento, email, telefone },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clientes'] });
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
      aria-labelledby="titulo-form-cliente"
      className="mb-4 grid gap-3 rounded-lg border border-borda bg-surface p-4 sm:grid-cols-2"
    >
      <h2 id="titulo-form-cliente" className="text-lg font-medium sm:col-span-2">
        {cliente ? 'Editar cliente' : 'Novo cliente'}
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        Tipo
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Cliente['tipo'])}
          className={campo}
        >
          {TIPOS_CLIENTE.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_CLIENTE[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nome
        <input
          required
          minLength={2}
          maxLength={120}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Documento (fictício)
        <input
          maxLength={30}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          placeholder="EXEMPLO-001"
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input
          type="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={campo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Telefone
        <input
          maxLength={30}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          className={campo}
        />
      </label>
      <p className="text-xs text-suave sm:col-span-2">
        Não use dados reais: este é um projeto de demonstração.
      </p>
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
