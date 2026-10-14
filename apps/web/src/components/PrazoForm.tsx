import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalcularResponseSchema,
  OpcoesResponseSchema,
  PrazoResponseSchema,
  ProcessosResponseSchema,
  ROTULO_TIPO_PRAZO,
  TIPOS_PRAZO,
  dataIsoValida,
  type Prazo,
} from '@crm/shared';
import { chamar } from '../api';
import { dataBr, dataComDia } from '../datas';

const campo = 'rounded border border-borda bg-bg px-3 py-2';
const ROTULO_PULO = { sabado: 'sábado', domingo: 'domingo', feriado: 'feriado' } as const;

export function PrazoForm({ prazo, onFechar }: { prazo: Prazo | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const [processoId, setProcessoId] = useState(prazo ? String(prazo.processoId) : '');
  const [tipo, setTipo] = useState<Prazo['tipo']>(prazo?.tipo ?? 'prazo');
  const [modo, setModo] = useState<'contagem' | 'manual'>(
    prazo && prazo.intimacaoEm === null ? 'manual' : 'contagem',
  );
  const [intimacaoEm, setIntimacaoEm] = useState(prazo?.intimacaoEm ?? '');
  const [diasUteis, setDiasUteis] = useState(prazo?.diasUteis ? String(prazo.diasUteis) : '');
  const [venceLocal, setVenceLocal] = useState(
    prazo ? `${prazo.venceData}T${prazo.venceHora}` : '',
  );
  const [responsavelId, setResponsavelId] = useState(prazo ? String(prazo.responsavelId) : '');
  const [observacao, setObservacao] = useState(prazo?.observacao ?? '');

  const contagem = tipo === 'prazo' && modo === 'contagem';

  const processos = useQuery({
    queryKey: ['processos-para-selecao'],
    queryFn: () => chamar('/api/processos?porPagina=100', ProcessosResponseSchema),
  });
  const opcoes = useQuery({
    queryKey: ['processos-opcoes-resp'],
    queryFn: () => chamar('/api/processos/opcoes', OpcoesResponseSchema),
  });

  const dias = Number(diasUteis);
  const podeCalcular =
    contagem && dataIsoValida(intimacaoEm) && Number.isInteger(dias) && dias >= 1 && dias <= 365;
  const previa = useQuery({
    queryKey: ['prazo-previa', intimacaoEm, dias],
    queryFn: () =>
      chamar('/api/prazos/calcular', CalcularResponseSchema, {
        method: 'POST',
        corpo: { intimacaoEm, diasUteis: dias },
      }),
    enabled: podeCalcular,
  });

  const salvar = useMutation({
    mutationFn: () =>
      chamar(prazo ? `/api/prazos/${prazo.id}` : '/api/prazos', PrazoResponseSchema, {
        method: prazo ? 'PUT' : 'POST',
        corpo: {
          processoId: Number(processoId),
          tipo,
          responsavelId: Number(responsavelId),
          observacao,
          ...(contagem ? { intimacaoEm, diasUteis: dias } : { venceLocal }),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['prazos'] });
      await qc.invalidateQueries({ queryKey: ['agenda'] });
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
      aria-labelledby="titulo-form-prazo"
      className="mb-4 grid gap-3 rounded-lg border border-borda bg-surface p-4 sm:grid-cols-2"
    >
      <h2 id="titulo-form-prazo" className="text-lg font-medium sm:col-span-2">
        {prazo ? 'Editar prazo' : 'Novo prazo ou compromisso'}
      </h2>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Processo
        <select
          required
          value={processoId}
          onChange={(e) => setProcessoId(e.target.value)}
          className={campo}
        >
          <option value="">Selecione…</option>
          {processos.data?.itens.map((p) => (
            <option key={p.id} value={p.id}>
              {p.numeroCnj} — {p.clienteNome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tipo
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as Prazo['tipo'])}
          className={campo}
        >
          {TIPOS_PRAZO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_PRAZO[t]}
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

      {tipo === 'prazo' && (
        <fieldset className="flex flex-wrap gap-4 text-sm sm:col-span-2">
          <legend className="mb-1">Como definir o vencimento</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              checked={modo === 'contagem'}
              onChange={() => setModo('contagem')}
            />
            Contar em dias úteis a partir da intimação
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              checked={modo === 'manual'}
              onChange={() => setModo('manual')}
            />
            Informar data e hora
          </label>
        </fieldset>
      )}

      {contagem ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Data da intimação
            <input
              required
              type="date"
              value={intimacaoEm}
              onChange={(e) => setIntimacaoEm(e.target.value)}
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Dias úteis
            <input
              required
              type="number"
              min={1}
              max={365}
              value={diasUteis}
              onChange={(e) => setDiasUteis(e.target.value)}
              className={campo}
            />
          </label>
          <div
            aria-live="polite"
            className="rounded border border-borda bg-bg p-3 text-sm sm:col-span-2"
          >
            {!podeCalcular && (
              <p className="text-suave">
                Informe a intimação e os dias úteis para ver o vencimento calculado.
              </p>
            )}
            {podeCalcular && previa.isPending && <p className="text-suave">Calculando…</p>}
            {previa.error && (
              <p role="alert" className="text-red-300">
                {previa.error.message}
              </p>
            )}
            {previa.data && (
              <>
                <p>
                  <strong>Vence em {dataComDia(previa.data.venceEm)}</strong>, às 23:59 (Brasília).
                </p>
                <p className="mt-1 text-suave">
                  O dia da intimação não conta.{' '}
                  {previa.data.pulados.length > 0
                    ? 'Dias não contados: '
                    : 'Nenhum dia não útil no caminho.'}
                  {previa.data.pulados
                    .map((p) => `${dataBr(p.data)} (${ROTULO_PULO[p.motivo]})`)
                    .join(', ')}
                </p>
                {previa.data.aviso && (
                  <p role="alert" className="mt-2 text-amber-300">
                    ⚠ {previa.data.aviso}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Data e hora (horário de Brasília)
          <input
            required
            type="datetime-local"
            value={venceLocal}
            onChange={(e) => setVenceLocal(e.target.value)}
            className={campo}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Observação
        <input
          maxLength={500}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
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
          disabled={salvar.isPending || (contagem && !!previa.data?.aviso)}
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
