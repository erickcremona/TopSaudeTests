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
exports.FuncoesElementosHtml = exports.AcaoHtmlIndex = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var AcaoHtmlIndex;
(function (AcaoHtmlIndex) {
    AcaoHtmlIndex[AcaoHtmlIndex["Exibir"] = 1] = "Exibir";
    AcaoHtmlIndex[AcaoHtmlIndex["Preencher"] = 2] = "Preencher";
    AcaoHtmlIndex[AcaoHtmlIndex["Clicar"] = 3] = "Clicar";
    AcaoHtmlIndex[AcaoHtmlIndex["DuploClique"] = 4] = "DuploClique";
    AcaoHtmlIndex[AcaoHtmlIndex["CliqueDireito"] = 5] = "CliqueDireito";
    AcaoHtmlIndex[AcaoHtmlIndex["Hover"] = 6] = "Hover";
    AcaoHtmlIndex[AcaoHtmlIndex["Focar"] = 7] = "Focar";
    AcaoHtmlIndex[AcaoHtmlIndex["Desfocar"] = 8] = "Desfocar";
    AcaoHtmlIndex[AcaoHtmlIndex["Teclar"] = 9] = "Teclar";
    AcaoHtmlIndex[AcaoHtmlIndex["SelecionarValor"] = 10] = "SelecionarValor";
    AcaoHtmlIndex[AcaoHtmlIndex["SelecionarLabel"] = 11] = "SelecionarLabel";
    AcaoHtmlIndex[AcaoHtmlIndex["SelecionarIndice"] = 12] = "SelecionarIndice";
    AcaoHtmlIndex[AcaoHtmlIndex["Marcar"] = 13] = "Marcar";
    AcaoHtmlIndex[AcaoHtmlIndex["Desmarcar"] = 14] = "Desmarcar";
    AcaoHtmlIndex[AcaoHtmlIndex["Alternar"] = 15] = "Alternar";
    AcaoHtmlIndex[AcaoHtmlIndex["Upload"] = 16] = "Upload";
    AcaoHtmlIndex[AcaoHtmlIndex["Limpar"] = 17] = "Limpar";
    AcaoHtmlIndex[AcaoHtmlIndex["LerTexto"] = 18] = "LerTexto";
    AcaoHtmlIndex[AcaoHtmlIndex["LerValor"] = 19] = "LerValor";
    AcaoHtmlIndex[AcaoHtmlIndex["LerAtributo"] = 20] = "LerAtributo";
    AcaoHtmlIndex[AcaoHtmlIndex["EsperarVisivel"] = 21] = "EsperarVisivel";
    AcaoHtmlIndex[AcaoHtmlIndex["EsperarOculto"] = 22] = "EsperarOculto";
    AcaoHtmlIndex[AcaoHtmlIndex["Rolar"] = 23] = "Rolar";
    AcaoHtmlIndex[AcaoHtmlIndex["Screenshot"] = 24] = "Screenshot";
})(AcaoHtmlIndex || (exports.AcaoHtmlIndex = AcaoHtmlIndex = {}));
const DEFAULT_TIMEOUT_MS = 15000;
function normalizeId(id) {
    // Normaliza identificadores para comparacao e registro.
    return (id !== null && id !== void 0 ? id : '').trim();
}
function isCssSelectorLike(value) {
    // Heuristica para decidir se o valor parece um seletor CSS completo.
    if (!value)
        return false;
    if (value.startsWith('#') || value.startsWith('.') || value.startsWith('['))
        return true;
    if (value.includes(' ') || value.includes('>') || value.includes(':'))
        return true;
    if (value.includes('[') && value.includes(']'))
        return true;
    return false;
}
async function findFirstInAllFrames(page, fn) {
    // Procura um resultado no main frame e depois em todos os iframes.
    const fromPage = await fn(page);
    if (fromPage)
        return fromPage;
    for (const frame of page.frames()) {
        const found = await fn(frame);
        if (found)
            return found;
    }
    return null;
}
async function resolveLocatorById(page, idHtml) {
    // Resolve um locator procurando por id/name/data-testid/data-qa em qualquer frame.
    const id = normalizeId(idHtml);
    if (!id)
        return null;
    return findFirstInAllFrames(page, async (ctx) => {
        const selectors = [
            `#${id.replaceAll('"', '\\"')}`,
            `[id="${id.replaceAll('"', '\\"')}"]`,
            `[name="${id.replaceAll('"', '\\"')}"]`,
            `[data-testid="${id.replaceAll('"', '\\"')}"]`,
            `[data-qa="${id.replaceAll('"', '\\"')}"]`,
        ];
        for (const sel of selectors) {
            const loc = ctx.locator(sel).first();
            if ((await loc.count().catch(() => 0)) > 0)
                return loc;
        }
        return null;
    });
}
async function resolveLocatorBySelector(page, selector) {
    // Resolve um locator a partir de um seletor CSS em qualquer frame.
    if (!selector)
        return null;
    return findFirstInAllFrames(page, async (ctx) => {
        const loc = ctx.locator(selector).first();
        if ((await loc.count().catch(() => 0)) > 0)
            return loc;
        return null;
    });
}
async function scrollCenter(locator) {
    // Garante que o elemento esteja visivel e centralizado na viewport.
    await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
    await locator
        .evaluate((el) => {
        try {
            el.scrollIntoView({ block: 'center', inline: 'center' });
        }
        catch {
            // ignore
        }
    })
        .catch(() => { });
}
async function highlight(locator, color = '#00d2ff') {
    // Destaca visualmente o elemento para facilitar o debug/visualizacao.
    await locator
        .evaluate((el, c) => {
        const htmlEl = el;
        const prev = htmlEl.style.outline;
        const prevOffset = htmlEl.style.outlineOffset;
        htmlEl.style.outline = `3px solid ${c}`;
        htmlEl.style.outlineOffset = '2px';
        window.setTimeout(() => {
            htmlEl.style.outline = prev;
            htmlEl.style.outlineOffset = prevOffset;
        }, 650);
    }, color)
        .catch(() => { });
}
class FuncoesElementosHtml {
    constructor(page, opts) {
        var _a, _b, _c;
        // Inicializa a classe com pagina, logger, timeout e registro inicial.
        this.page = page;
        this.log = (_a = opts === null || opts === void 0 ? void 0 : opts.log) !== null && _a !== void 0 ? _a : (() => { });
        this.timeoutMs = (_b = opts === null || opts === void 0 ? void 0 : opts.timeoutMs) !== null && _b !== void 0 ? _b : DEFAULT_TIMEOUT_MS;
        this.registro = this.criarRegistro((_c = opts === null || opts === void 0 ? void 0 : opts.elementos) !== null && _c !== void 0 ? _c : []);
    }
    registrarElemento(el) {
        // Registra um elemento individual para resolucao por id ou indice.
        this.registro.porId.set(normalizeId(el.idHtml), el);
        this.registro.porIndex.set(el.index, el);
    }
    registrarElementos(elements) {
        // Registra uma lista de elementos.
        for (const el of elements)
            this.registrarElemento(el);
    }
    carregarElementosJson(filePath) {
        // Carrega elementos de um JSON externo e registra internamente.
        const full = path.resolve(filePath);
        const raw = fs.readFileSync(full, { encoding: 'utf-8' });
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            throw new Error(`Arquivo de elementos invalido: ${full}`);
        this.registrarElementos(parsed);
    }
    obterElementoPorIndice(index) {
        var _a;
        // Retorna o elemento pelo indice cadastrado.
        return (_a = this.registro.porIndex.get(index)) !== null && _a !== void 0 ? _a : null;
    }
    obterElementoPorId(idHtml) {
        var _a;
        // Retorna o elemento pelo idHtml cadastrado.
        return (_a = this.registro.porId.get(normalizeId(idHtml))) !== null && _a !== void 0 ? _a : null;
    }
    async ExibirObjetoHtml(idHtml, _acao) {
        // Exibe/destaca o elemento na tela (sem interacao).
        await this.executarAcao('exibir', idHtml);
    }
    async PreencherObjetoHtml(idHtml, informacao) {
        // Preenche o elemento com a informacao fornecida.
        await this.executarAcao('preencher', idHtml, { valor: informacao });
    }
    async PrencherObjetoHtml(idHtml, informacao) {
        // Alias (com grafia original) para PreencherObjetoHtml.
        await this.PreencherObjetoHtml(idHtml, informacao);
    }
    async ClickObjetoHtml(idHtml, _acao) {
        // Clica no elemento identificado.
        await this.executarAcao('clicar', idHtml);
    }
    async executarAcao(acao, idHtml, op) {
        var _a, _b, _c, _d;
        // Executa uma acao generica no elemento identificado.
        const key = this.normalizarAcao(acao);
        const locator = await this.resolveLocator(idHtml);
        if (!locator)
            throw new Error(`Elemento nao encontrado: ${idHtml}`);
        await scrollCenter(locator);
        await highlight(locator);
        this.log(`[HTML] ${key}: ${idHtml}`);
        const timeoutMs = (_a = op === null || op === void 0 ? void 0 : op.timeoutMs) !== null && _a !== void 0 ? _a : this.timeoutMs;
        switch (key) {
            case 'exibir':
                return;
            case 'clicar':
                await locator.click({ timeout: timeoutMs });
                return;
            case 'duplo-clique':
                await locator.dblclick({ timeout: timeoutMs });
                return;
            case 'clique-direito':
                await locator.click({ button: 'right', timeout: timeoutMs });
                return;
            case 'hover':
                await locator.hover({ timeout: timeoutMs });
                return;
            case 'focar':
                await locator.focus({ timeout: timeoutMs });
                return;
            case 'desfocar':
                await locator.evaluate((el) => el.blur());
                return;
            case 'preencher':
                await locator.fill((_b = op === null || op === void 0 ? void 0 : op.valor) !== null && _b !== void 0 ? _b : '', { timeout: timeoutMs });
                return;
            case 'teclar':
                if (!(op === null || op === void 0 ? void 0 : op.tecla))
                    throw new Error('teclar requer op.tecla');
                await locator.press(op.tecla, { timeout: timeoutMs });
                return;
            case 'selecionar-valor':
                if (!(op === null || op === void 0 ? void 0 : op.selectValue))
                    throw new Error('selecionar-valor requer op.selectValue');
                await locator.selectOption({ value: op.selectValue });
                return;
            case 'selecionar-label':
                if (!(op === null || op === void 0 ? void 0 : op.selectLabel))
                    throw new Error('selecionar-label requer op.selectLabel');
                await locator.selectOption({ label: op.selectLabel });
                return;
            case 'selecionar-indice':
                if ((op === null || op === void 0 ? void 0 : op.selectIndex) === undefined)
                    throw new Error('selecionar-indice requer op.selectIndex');
                await locator.selectOption({ index: op.selectIndex });
                return;
            case 'marcar':
                await locator.check({ timeout: timeoutMs });
                return;
            case 'desmarcar':
                await locator.uncheck({ timeout: timeoutMs });
                return;
            case 'alternar': {
                const isChecked = await locator.isChecked().catch(() => false);
                if (isChecked)
                    await locator.uncheck({ timeout: timeoutMs });
                else
                    await locator.check({ timeout: timeoutMs });
                return;
            }
            case 'upload':
                if (!((_c = op === null || op === void 0 ? void 0 : op.arquivos) === null || _c === void 0 ? void 0 : _c.length))
                    throw new Error('upload requer op.arquivos');
                await locator.setInputFiles(op.arquivos);
                return;
            case 'limpar':
                await locator.fill('', { timeout: timeoutMs });
                return;
            case 'ler-texto': {
                const text = await locator.innerText().catch(() => '');
                return text;
            }
            case 'ler-valor': {
                const value = await locator.inputValue().catch(() => '');
                return value;
            }
            case 'ler-atributo': {
                if (!(op === null || op === void 0 ? void 0 : op.atributo))
                    throw new Error('ler-atributo requer op.atributo');
                const value = await locator.getAttribute(op.atributo);
                return value !== null && value !== void 0 ? value : '';
            }
            case 'esperar-visivel':
                await locator.waitFor({ state: 'visible', timeout: timeoutMs });
                return;
            case 'esperar-oculto':
                await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
                return;
            case 'rolar':
                await scrollCenter(locator);
                return;
            case 'screenshot': {
                const out = (_d = op === null || op === void 0 ? void 0 : op.screenshotPath) !== null && _d !== void 0 ? _d : `elemento-${Date.now()}.png`;
                await locator.screenshot({ path: out });
                return out;
            }
            default:
                throw new Error(`Acao nao suportada: ${String(key)}`);
        }
    }
    async executarAcaoPorIndice(acaoIndex, elementoIndex, op) {
        // Executa uma acao usando o indice do elemento e o indice da acao.
        const el = this.obterElementoPorIndice(elementoIndex);
        if (!el)
            throw new Error(`Elemento nao encontrado no indice: ${elementoIndex}`);
        return this.executarAcao(acaoIndex, el.idHtml, op);
    }
    criarRegistro(elements) {
        // Cria os mapas de resolucao por id e por indice.
        const porId = new Map();
        const porIndex = new Map();
        for (const el of elements) {
            porId.set(normalizeId(el.idHtml), el);
            porIndex.set(el.index, el);
        }
        return { porId, porIndex };
    }
    normalizarAcao(acao) {
        // Converte indice de acao para chave textual.
        if (typeof acao === 'number')
            return this.acaoIndexToKey(acao);
        return acao;
    }
    acaoIndexToKey(index) {
        // Mapeia o indice numerico para a chave da acao.
        switch (index) {
            case AcaoHtmlIndex.Exibir:
                return 'exibir';
            case AcaoHtmlIndex.Preencher:
                return 'preencher';
            case AcaoHtmlIndex.Clicar:
                return 'clicar';
            case AcaoHtmlIndex.DuploClique:
                return 'duplo-clique';
            case AcaoHtmlIndex.CliqueDireito:
                return 'clique-direito';
            case AcaoHtmlIndex.Hover:
                return 'hover';
            case AcaoHtmlIndex.Focar:
                return 'focar';
            case AcaoHtmlIndex.Desfocar:
                return 'desfocar';
            case AcaoHtmlIndex.Teclar:
                return 'teclar';
            case AcaoHtmlIndex.SelecionarValor:
                return 'selecionar-valor';
            case AcaoHtmlIndex.SelecionarLabel:
                return 'selecionar-label';
            case AcaoHtmlIndex.SelecionarIndice:
                return 'selecionar-indice';
            case AcaoHtmlIndex.Marcar:
                return 'marcar';
            case AcaoHtmlIndex.Desmarcar:
                return 'desmarcar';
            case AcaoHtmlIndex.Alternar:
                return 'alternar';
            case AcaoHtmlIndex.Upload:
                return 'upload';
            case AcaoHtmlIndex.Limpar:
                return 'limpar';
            case AcaoHtmlIndex.LerTexto:
                return 'ler-texto';
            case AcaoHtmlIndex.LerValor:
                return 'ler-valor';
            case AcaoHtmlIndex.LerAtributo:
                return 'ler-atributo';
            case AcaoHtmlIndex.EsperarVisivel:
                return 'esperar-visivel';
            case AcaoHtmlIndex.EsperarOculto:
                return 'esperar-oculto';
            case AcaoHtmlIndex.Rolar:
                return 'rolar';
            case AcaoHtmlIndex.Screenshot:
                return 'screenshot';
            default:
                throw new Error(`Indice de acao invalido: ${index}`);
        }
    }
    async resolveLocator(idHtml) {
        var _a, _b;
        // Resolve o locator a partir do registro, seletor ou idHtml informado.
        const el = this.obterElementoPorId(idHtml);
        const selector = (_a = el === null || el === void 0 ? void 0 : el.selector) !== null && _a !== void 0 ? _a : '';
        const id = (_b = el === null || el === void 0 ? void 0 : el.idHtml) !== null && _b !== void 0 ? _b : idHtml;
        if (selector && isCssSelectorLike(selector)) {
            const locBySel = await resolveLocatorBySelector(this.page, selector);
            if (locBySel)
                return locBySel;
        }
        if (isCssSelectorLike(id)) {
            const locBySel = await resolveLocatorBySelector(this.page, id);
            if (locBySel)
                return locBySel;
        }
        return resolveLocatorById(this.page, id);
    }
}
exports.FuncoesElementosHtml = FuncoesElementosHtml;
