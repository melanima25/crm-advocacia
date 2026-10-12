import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { chamar, ErroApi } from './api';

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('chamar', () => {
  it('envia o cabeçalho anti-CSRF e valida a resposta com o schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const dados = await chamar('/api/x', z.object({ ok: z.boolean() }), {
      method: 'POST',
      corpo: { a: 1 },
    });
    expect(dados).toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('fetch');
    expect(init.body).toBe('{"a":1}');
  });

  it('transforma erro da API em ErroApi com status e mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ erro: 'Não autenticado' }, 401)));
    const e = await chamar('/api/me', z.object({})).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroApi);
    expect((e as ErroApi).status).toBe(401);
    expect((e as ErroApi).message).toBe('Não autenticado');
  });

  it('rejeita resposta fora do formato esperado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ ok: 'sim' })));
    await expect(chamar('/api/x', z.object({ ok: z.boolean() }))).rejects.toThrow();
  });
});
