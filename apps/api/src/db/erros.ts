/** Código SQLSTATE do Postgres (23505 = duplicado, 23503 = chave estrangeira), mesmo embrulhado pelo Drizzle. */
export function codigoPg(e: unknown): string | undefined {
  let atual: unknown = e;
  for (let i = 0; i < 4 && atual && typeof atual === 'object'; i++) {
    const c = (atual as { code?: unknown }).code;
    if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return c;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}
