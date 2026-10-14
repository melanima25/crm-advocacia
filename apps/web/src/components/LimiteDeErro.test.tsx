import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LimiteDeErro } from './LimiteDeErro';

describe('LimiteDeErro', () => {
  it('sem erro, mostra o conteúdo normalmente', () => {
    const html = renderToStaticMarkup(
      <LimiteDeErro>
        <p>tudo certo</p>
      </LimiteDeErro>,
    );
    expect(html).toContain('tudo certo');
    expect(html).not.toContain('role="alert"');
  });

  it('getDerivedStateFromError guarda o erro; com erro mostra o aviso e o botão', () => {
    const erro = new Error('quebrou');
    expect(LimiteDeErro.getDerivedStateFromError(erro)).toEqual({ erro });
    const instancia = new LimiteDeErro({ children: null });
    instancia.state = { erro, chave: undefined };
    const html = renderToStaticMarkup(<>{instancia.render()}</>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Algo deu errado');
    expect(html).toContain('Tentar de novo');
  });

  it('trocar de aba (chave) limpa o erro', () => {
    const estado = { erro: new Error('x'), chave: 'prazos' };
    expect(
      LimiteDeErro.getDerivedStateFromProps({ children: null, chave: 'prazos' }, estado),
    ).toBeNull();
    expect(
      LimiteDeErro.getDerivedStateFromProps({ children: null, chave: 'agenda' }, estado),
    ).toEqual({
      erro: null,
      chave: 'agenda',
    });
  });

  it('registra o erro no console (para quem for depurar)', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new LimiteDeErro({ children: null }).componentDidCatch(new Error('x'), {
      componentStack: 'pilha',
    });
    expect(espiao).toHaveBeenCalled();
    espiao.mockRestore();
  });
});
