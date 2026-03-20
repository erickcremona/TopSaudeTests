"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolicitacaoRequestBuilder = exports.FuncaoSolicitacaoIndex = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const funcoes_elementos_html_1 = require("./funcoes_elementos_html");
var FuncaoSolicitacaoIndex;
(function (FuncaoSolicitacaoIndex) {
    FuncaoSolicitacaoIndex[FuncaoSolicitacaoIndex["ObterRequestSolicitacao"] = 1] = "ObterRequestSolicitacao";
    FuncaoSolicitacaoIndex[FuncaoSolicitacaoIndex["ObterParametrosEntradaPadrao"] = 2] = "ObterParametrosEntradaPadrao";
    FuncaoSolicitacaoIndex[FuncaoSolicitacaoIndex["CarregarParametrosDeArquivo"] = 3] = "CarregarParametrosDeArquivo";
})(FuncaoSolicitacaoIndex || (exports.FuncaoSolicitacaoIndex = FuncaoSolicitacaoIndex = {}));
class SolicitacaoRequestBuilder {
    // Retorna um request JSON completo com base nos parametros informados.
    ObterRequestSolicitacao(parametros) {
        var _a, _b, _c, _d, _e, _f;
        const acoes_html_indices = this.buildAcoesHtmlIndexMap();
        this.validateAcoesHtml(parametros, acoes_html_indices);
        const menu = { fonte: parametros.menu.fonte };
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
            regras: (_a = parametros.regras) !== null && _a !== void 0 ? _a : {},
            execucao: (_b = parametros.execucao) !== null && _b !== void 0 ? _b : {},
            saida: (_c = parametros.saida) !== null && _c !== void 0 ? _c : {},
            passos: (_d = parametros.passos) !== null && _d !== void 0 ? _d : [],
            sucesso_quando: (_e = parametros.sucesso_quando) !== null && _e !== void 0 ? _e : '',
            referencias: (_f = parametros.referencias) !== null && _f !== void 0 ? _f : [],
            acoes_html_indices,
            parametros_entrada: parametros,
        };
    }
    // Fornece um modelo base de parametros de entrada para edicao manual.
    ObterParametrosEntradaPadrao() {
        return {
            sac: { numero: 'SAC_XXXXXX', nome: 'NOME_DO_CENARIO' },
            env: {
                base_url: 'http://<host>/<app>/Home/AreaLogada',
                usuario: 'Admin',
                senha: 'topdown',
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
                    acoes_html: [{ index: 1, acao_index: funcoes_elementos_html_1.AcaoHtmlIndex.Exibir, elemento_index: 1 }],
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
    CarregarParametrosDeArquivo(filePath) {
        const full = path.resolve(filePath);
        const raw = fs.readFileSync(full, { encoding: 'utf-8' });
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !('parametros_entrada' in parsed)) {
            throw new Error(`Arquivo invalido (esperado { parametros_entrada }): ${full}`);
        }
        const parametros = parsed.parametros_entrada;
        return parametros;
    }
    // Executa uma funcao pelo indice numerico para facilitar chamada.
    ExecutarPorIndice(index, parametros, filePath) {
        switch (index) {
            case FuncaoSolicitacaoIndex.ObterRequestSolicitacao:
                if (!parametros)
                    throw new Error('Parametros obrigatorios para ObterRequestSolicitacao');
                return this.ObterRequestSolicitacao(parametros);
            case FuncaoSolicitacaoIndex.ObterParametrosEntradaPadrao:
                return this.ObterParametrosEntradaPadrao();
            case FuncaoSolicitacaoIndex.CarregarParametrosDeArquivo:
                if (!filePath)
                    throw new Error('filePath obrigatorio para CarregarParametrosDeArquivo');
                return this.CarregarParametrosDeArquivo(filePath);
            default:
                throw new Error(`Indice de funcao invalido: ${index}`);
        }
    }
    buildAcoesHtmlIndexMap() {
        return {
            [funcoes_elementos_html_1.AcaoHtmlIndex.Exibir]: 'exibir',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Preencher]: 'preencher',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Clicar]: 'clicar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.DuploClique]: 'duplo-clique',
            [funcoes_elementos_html_1.AcaoHtmlIndex.CliqueDireito]: 'clique-direito',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Hover]: 'hover',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Focar]: 'focar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Desfocar]: 'desfocar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Teclar]: 'teclar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.SelecionarValor]: 'selecionar-valor',
            [funcoes_elementos_html_1.AcaoHtmlIndex.SelecionarLabel]: 'selecionar-label',
            [funcoes_elementos_html_1.AcaoHtmlIndex.SelecionarIndice]: 'selecionar-indice',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Marcar]: 'marcar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Desmarcar]: 'desmarcar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Alternar]: 'alternar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Upload]: 'upload',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Limpar]: 'limpar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.LerTexto]: 'ler-texto',
            [funcoes_elementos_html_1.AcaoHtmlIndex.LerValor]: 'ler-valor',
            [funcoes_elementos_html_1.AcaoHtmlIndex.LerAtributo]: 'ler-atributo',
            [funcoes_elementos_html_1.AcaoHtmlIndex.EsperarVisivel]: 'esperar-visivel',
            [funcoes_elementos_html_1.AcaoHtmlIndex.EsperarOculto]: 'esperar-oculto',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Rolar]: 'rolar',
            [funcoes_elementos_html_1.AcaoHtmlIndex.Screenshot]: 'screenshot',
        };
    }
    validateAcoesHtml(parametros, acoesHtmlIndices) {
        var _a;
        for (const tela of Object.values(parametros.telas)) {
            for (const acao of (_a = tela.acoes_html) !== null && _a !== void 0 ? _a : []) {
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
exports.SolicitacaoRequestBuilder = SolicitacaoRequestBuilder;
