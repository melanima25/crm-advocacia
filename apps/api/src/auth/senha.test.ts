import { describe, expect, it } from 'vitest';
import { gerarHash, hashFalso, verificarSenha } from './senha';

describe('hash de senha', () => {
  it('aceita a senha certa e recusa a errada', async () => {
    const h = await gerarHash('segredo-123', 1000);
    expect(await verificarSenha('segredo-123', h)).toBe(true);
    expect(await verificarSenha('segredo-124', h)).toBe(false);
  });
  it('usa sal: o mesmo texto gera hashes diferentes', async () => {
    expect(await gerarHash('x', 1000)).not.toBe(await gerarHash('x', 1000));
  });
  it('guarda as iterações no formato e não vaza a senha', async () => {
    const h = await gerarHash('minha-senha', 1000);
    expect(h).toMatch(/^pbkdf2\$sha256\$1000\$/);
    expect(h).not.toContain('minha-senha');
  });
  it('recusa formatos inválidos sem lançar erro', async () => {
    expect(await verificarSenha('a', 'lixo')).toBe(false);
    expect(await verificarSenha('a', 'bcrypt$x$1$a$b')).toBe(false);
  });
});

describe('hashFalso (e-mail inexistente)', () => {
  it('usa as iterações pedidas, para gastar o mesmo tempo dos hashes reais', () => {
    expect(hashFalso(10_000)).toMatch(/^pbkdf2\$sha256\$10000\$/);
    expect(hashFalso()).toMatch(/^pbkdf2\$sha256\$600000\$/);
  });
  it('é um hash válido que nunca confere (e roda no número de iterações configurado)', async () => {
    expect(await verificarSenha('qualquer-coisa', hashFalso(1000))).toBe(false);
  });
});
