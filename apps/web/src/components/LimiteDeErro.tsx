import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** muda quando o usuário troca de aba: limpa o erro */ chave?: string;
};
type Estado = { erro: Error | null; chave?: string };

/**
 * Se uma tela quebrar ao renderizar, só ela some (com uma mensagem e botão de tentar de novo);
 * o menu e a sessão continuam funcionando. Trocar de aba também limpa o erro.
 */
export class LimiteDeErro extends Component<Props, Estado> {
  override state: Estado = { erro: null, chave: this.props.chave };

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro };
  }

  static getDerivedStateFromProps(props: Props, estado: Estado): Partial<Estado> | null {
    return props.chave !== estado.chave ? { erro: null, chave: props.chave } : null;
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro ao renderizar a tela:', erro, info.componentStack);
  }

  override render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="rounded-lg border border-borda bg-surface p-4">
        <p className="font-medium">Algo deu errado ao mostrar esta tela.</p>
        <p className="mt-1 text-sm text-suave">
          Seus dados não foram alterados. Tente de novo ou volte para outra seção.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ erro: null })}
          className="mt-3 rounded border border-borda px-3 py-1.5 text-sm hover:border-ouro"
        >
          Tentar de novo
        </button>
      </div>
    );
  }
}
