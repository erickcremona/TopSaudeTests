import * as fs from 'fs';
import * as path from 'path';
import { AcaoHtmlIndex, type AcaoHtmlKey, type AcaoOpcoes, type ElementoHtml } from './funcoes_elementos_html';

export type ParametrosMenuItem = {
  index: number;
  chave: string;
  data_modulo_funcao: string;
  texto?: string;
};

export type ParametrosTela = {
  frame_url_hint: string;
  campos?: Record<string, string>;
  acoes_html?: ParametrosAcaoHtml[];
};

export type ParametrosAcaoHtml = {
  index: number;
  acao_index: AcaoHtmlIndex;
  elemento_index: number;
  op?: AcaoOpcoes;
};

export type ParametrosEntradaSolicitacao = {
  sac: { numero: string; nome: string };
  env: {
    base_url: string;
    usuario: string;
    senha: string;
    base_db_preferida?: string;
  };
  entrada: Record<string, unknown>;
  menu: {
    fonte: string[];
    itens: ParametrosMenuItem[];
  };
  telas: Record<string, ParametrosTela>;
  elementos_html: { elementos: ElementoHtml[] };
  regras?: Record<string, unknown>;
  execucao?: Record<string, unknown>;
  saida?: Record<string, unknown>;
  passos?: string[];
  sucesso_quando?: string;
  referencias?: string[];
};

export type RequestSolicitacao = {
  sac: { numero: string; nome: string };
  env: ParametrosEntradaSolicitacao['env'];
  entrada: ParametrosEntradaSolicitacao['entrada'];
  menu: {
    fonte: string[];
    [chave: string]: { data_modulo_funcao: string; texto?: string } | string[];
  };
  telas: Record<string, ParametrosTela>;
  regras?: Record<string, unknown>;
  execucao?: Record<string, unknown>;
  saida?: Record<string, unknown>;
  passos?: string[];
  sucesso_quando?: string;
  referencias?: string[];
  acoes_html_indices: Record<number, AcaoHtmlKey>;
  parametros_entrada?: ParametrosEntradaSolicitacao;
};

export enum FuncaoSolicitacaoIndex {
  ObterRequestSolicitacao = 1,
  ObterParametrosEntradaPadrao = 2,
  CarregarParametrosDeArquivo = 3,
}

export class SolicitacaoRequestBuilder {
  // Retorna um request JSON completo com base nos parametros informados.
  ObterRequestSolicitacao(parametros: ParametrosEntradaSolicitacao): RequestSolicitacao {
    const acoes_html_indices = this.buildAcoesHtmlIndexMap();
    this.validateAcoesHtml(parametros, acoes_html_indices);

    const menu: RequestSolicitacao['menu'] = { fonte: parametros.menu.fonte };
    for (const item of parametros.menu.itens) {
      menu[item.chave] = {
        data_modulo_funcao: item.data_modulo_funcao,
        texto: item.texto,
      };
    }

    return {
      sac: parametros.sac,
      env: parametros.env,
      entrada: parametros.entrada,
      menu,
      telas: parametros.telas,
      regras: parametros.regras ?? {},
      execucao: parametros.execucao ?? {},
      saida: parametros.saida ?? {},
      passos: parametros.passos ?? [],
      sucesso_quando: parametros.sucesso_quando ?? '',
      referencias: parametros.referencias ?? [],
      acoes_html_indices,
      parametros_entrada: parametros,
    };
  }

  // Fornece um modelo base de parametros de entrada para edicao manual.
  ObterParametrosEntradaPadrao(): ParametrosEntradaSolicitacao {
    return {
      sac: { numero: 'SAC_XXXXXX', nome: 'NOME_DO_CENARIO' },
      env: {
        base_url: 'http://<host>/<app>/Home/AreaLogada',
        usuario: '',
        senha: '',
        base_db_preferida: 'DES8',
      },
      entrada: {
        contratos: ['00000000000'],
        aguardar_contrato_carregar_s: 10,
      },
      menu: {
        fonte: [
          'tests/menu-identificadores/menu-identificadores.json',
          'tests/menu-identificadores/MENU_IDENTIFICADORES.md',
          'skills/sac-request-authoring/SKILL.md',
          'skills/funcoes-elementos-html/SKILL.md',
        ],
        itens: [{ index: 1, chave: 'funcao_exemplo', data_modulo_funcao: '00.AAA0.0', texto: 'Texto (opcional)' }],
      },
      telas: {
        tela_exemplo: {
          frame_url_hint: 'xxx0000a.asp',
          campos: { campo_exemplo_id: 'campo_id' },
          acoes_html: [{ index: 1, acao_index: AcaoHtmlIndex.Exibir, elemento_index: 1 }],
        },
      },
      elementos_html: {
        elementos: [{ index: 1, idHtml: 'campo_id', descricao: 'Campo exemplo' }],
      },
      regras: {},
      execucao: {
        delay_entre_passos_ms: 2000,
        timeout_por_passo_ms: 30000,
        modo_visual: true,
        sempre_mostrar_cliques: true,
        sempre_logar_clique_fill_read: true,
      },
      saida: {
        spec_dir: 'tests/{numero_sac}/',
        video: { por_contrato: true, formato: 'webm', nome: '{contrato}.webm' },
        relatorio_md: '{numero_sac}_report.md',
      },
      passos: ['1-?: descreva os passos numerados aqui'],
      sucesso_quando: 'Defina o criterio de sucesso observavel na UI',
      referencias: ['skills/sac-request-authoring/assets/request.template.json'],
    };
  }

  // Carrega parametros de um arquivo JSON.
  CarregarParametrosDeArquivo(filePath: string): ParametrosEntradaSolicitacao {
    const full = path.resolve(filePath);
    const raw = fs.readFileSync(full, { encoding: 'utf-8' });
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('parametros_entrada' in (parsed as Record<string, unknown>))) {
      throw new Error(`Arquivo invalido (esperado { parametros_entrada }): ${full}`);
    }
    const parametros = (parsed as { parametros_entrada: ParametrosEntradaSolicitacao }).parametros_entrada;
    return parametros;
  }

  // Executa uma funcao pelo indice numerico para facilitar chamada.
  ExecutarPorIndice(
    index: FuncaoSolicitacaoIndex,
    parametros?: ParametrosEntradaSolicitacao,
    filePath?: string,
  ): RequestSolicitacao | ParametrosEntradaSolicitacao {
    switch (index) {
      case FuncaoSolicitacaoIndex.ObterRequestSolicitacao:
        if (!parametros) throw new Error('Parametros obrigatorios para ObterRequestSolicitacao');
        return this.ObterRequestSolicitacao(parametros);
      case FuncaoSolicitacaoIndex.ObterParametrosEntradaPadrao:
        return this.ObterParametrosEntradaPadrao();
      case FuncaoSolicitacaoIndex.CarregarParametrosDeArquivo:
        if (!filePath) throw new Error('filePath obrigatorio para CarregarParametrosDeArquivo');
        return this.CarregarParametrosDeArquivo(filePath);
      default:
        throw new Error(`Indice de funcao invalido: ${index}`);
    }
  }

  private buildAcoesHtmlIndexMap(): Record<number, AcaoHtmlKey> {
    return {
      [AcaoHtmlIndex.Exibir]: 'exibir',
      [AcaoHtmlIndex.Preencher]: 'preencher',
      [AcaoHtmlIndex.Clicar]: 'clicar',
      [AcaoHtmlIndex.DuploClique]: 'duplo-clique',
      [AcaoHtmlIndex.CliqueDireito]: 'clique-direito',
      [AcaoHtmlIndex.Hover]: 'hover',
      [AcaoHtmlIndex.Focar]: 'focar',
      [AcaoHtmlIndex.Desfocar]: 'desfocar',
      [AcaoHtmlIndex.Teclar]: 'teclar',
      [AcaoHtmlIndex.SelecionarValor]: 'selecionar-valor',
      [AcaoHtmlIndex.SelecionarLabel]: 'selecionar-label',
      [AcaoHtmlIndex.SelecionarIndice]: 'selecionar-indice',
      [AcaoHtmlIndex.Marcar]: 'marcar',
      [AcaoHtmlIndex.Desmarcar]: 'desmarcar',
      [AcaoHtmlIndex.Alternar]: 'alternar',
      [AcaoHtmlIndex.Upload]: 'upload',
      [AcaoHtmlIndex.Limpar]: 'limpar',
      [AcaoHtmlIndex.LerTexto]: 'ler-texto',
      [AcaoHtmlIndex.LerValor]: 'ler-valor',
      [AcaoHtmlIndex.LerAtributo]: 'ler-atributo',
      [AcaoHtmlIndex.EsperarVisivel]: 'esperar-visivel',
      [AcaoHtmlIndex.EsperarOculto]: 'esperar-oculto',
      [AcaoHtmlIndex.Rolar]: 'rolar',
      [AcaoHtmlIndex.Screenshot]: 'screenshot',
    };
  }

  private validateAcoesHtml(
    parametros: ParametrosEntradaSolicitacao,
    acoesHtmlIndices: Record<number, AcaoHtmlKey>,
  ): void {
    for (const tela of Object.values(parametros.telas)) {
      for (const acao of tela.acoes_html ?? []) {
        if (!acoesHtmlIndices[acao.acao_index]) {
          throw new Error(`acao_index invalido em telas.*.acoes_html: ${acao.acao_index}`);
        }
        const elemento = parametros.elementos_html.elementos.find((e) => e.index === acao.elemento_index);
        if (!elemento) {
          throw new Error(`elemento_index nao encontrado: ${acao.elemento_index}`);
        }
      }
    }
  }
}
