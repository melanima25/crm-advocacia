import type { z } from 'zod';

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** fetch com credenciais, cabeçalho anti-CSRF e validação da resposta com o schema compartilhado. */
export async function chamar<T>(
  caminho: string,
  schema: z.ZodType<T>,
  init: { method?: string; corpo?: unknown } = {},
): Promise<T> {
  const res = await fetch(caminho, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof json === 'object' && json && 'erro' in json
        ? String((json as { erro: unknown }).erro)
        : 'Falha na requisição';
    throw new ErroApi(msg, res.status);
  }
  return schema.parse(json);
}
