import { describe, expect, it } from 'vitest';
import { cookieSeguro, parseEnv } from './env';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('parseEnv', () => {
  it('padrões e validação', () => {
    expect(parseEnv(base)).toMatchObject({ PORT: 3000, NODE_ENV: 'development', SESSAO_DIAS: 7 });
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
    expect(() => parseEnv({ ...base, COOKIE_SEGURO: 'talvez' })).toThrow(/COOKIE_SEGURO/);
  });
  it('a mensagem de erro não vaza o valor da variável', () => {
    try {
      parseEnv({ DATABASE_URL: 'mysql://usuario:segredo123@host/db' });
    } catch (e) {
      expect(String(e)).not.toContain('segredo123');
    }
  });
});

describe('cookieSeguro', () => {
  it('Secure por padrão só em produção', () => {
    expect(cookieSeguro({ NODE_ENV: 'production', COOKIE_SEGURO: undefined })).toBe(true);
    expect(cookieSeguro({ NODE_ENV: 'development', COOKIE_SEGURO: undefined })).toBe(false);
  });
  it('pode ser desligado explicitamente em produção (http://localhost no Docker) e ligado fora dela', () => {
    expect(cookieSeguro({ NODE_ENV: 'production', COOKIE_SEGURO: 'false' })).toBe(false);
    expect(cookieSeguro({ NODE_ENV: 'development', COOKIE_SEGURO: 'true' })).toBe(true);
  });
});
