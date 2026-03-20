import type { Frame, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type ElementoHtml = {
  index: number;
  idHtml: string;
  selector?: string;
  descricao?: string;
};

export type RegistroElemento = {
  porId: Map<string, ElementoHtml>;
  porIndex: Map<number, ElementoHtml>;
};

export type AcaoHtmlKey =
  | 'exibir'
  | 'preencher'
  | 'clicar'
  | 'duplo-clique'
  | 'clique-direito'
  | 'hover'
  | 'focar'
  | 'desfocar'
  | 'teclar'
  | 'selecionar-valor'
  | 'selecionar-label'
  | 'selecionar-indice'
  | 'marcar'
  | 'desmarcar'
  | 'alternar'
  | 'upload'
  | 'limpar'
  | 'ler-texto'
  | 'ler-valor'
  | 'ler-atributo'
  | 'esperar-visivel'
  | 'esperar-oculto'
  | 'rolar'
  | 'screenshot';

export enum AcaoHtmlIndex {
  Exibir = 1,
  Preencher = 2,
  Clicar = 3,
  DuploClique = 4,
  CliqueDireito = 5,
  Hover = 6,
  Focar = 7,
  Desfocar = 8,
  Teclar = 9,
  SelecionarValor = 10,
  SelecionarLabel = 11,
  SelecionarIndice = 12,
  Marcar = 13,
  Desmarcar = 14,
  Alternar = 15,
  Upload = 16,
  Limpar = 17,
  LerTexto = 18,
  LerValor = 19,
  LerAtributo = 20,
  EsperarVisivel = 21,
  EsperarOculto = 22,
  Rolar = 23,
  Screenshot = 24,
}

export type AcaoOpcoes = {
  valor?: string;
  atributo?: string;
  tecla?: string;
  arquivos?: string[];
  selectValue?: string;
  selectLabel?: string;
  selectIndex?: number;
  timeoutMs?: number;
  screenshotPath?: string;
};

type Logger = (msg: string) => void;

const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeId(id: string): string {
  // Normaliza identificadores para comparacao e registro.
  return (id ?? '').trim();
}

function isCssSelectorLike(value: string): boolean {
  // Heuristica para decidir se o valor parece um seletor CSS completo.
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('.') || value.startsWith('[')) return true;
  if (value.includes(' ') || value.includes('>') || value.includes(':')) return true;
  if (value.includes('[') && value.includes(']')) return true;
  return false;
}

async function findFirstInAllFrames<T>(
  page: Page,
  fn: (context: Page | Frame) => Promise<T | null>,
): Promise<T | null> {
  // Procura um resultado no main frame e depois em todos os iframes.
  const fromPage = await fn(page);
  if (fromPage) return fromPage;
  for (const frame of page.frames()) {
    const found = await fn(frame);
    if (found) return found;
  }
  return null;
}

async function resolveLocatorById(page: Page, idHtml: string): Promise<Locator | null> {
  // Resolve um locator procurando por id/name/data-testid/data-qa em qualquer frame.
  const id = normalizeId(idHtml);
  if (!id) return null;
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
      if ((await loc.count().catch(() => 0)) > 0) return loc;
    }
    return null;
  });
}

async function resolveLocatorBySelector(page: Page, selector: string): Promise<Locator | null> {
  // Resolve um locator a partir de um seletor CSS em qualquer frame.
  if (!selector) return null;
  return findFirstInAllFrames(page, async (ctx) => {
    const loc = ctx.locator(selector).first();
    if ((await loc.count().catch(() => 0)) > 0) return loc;
    return null;
  });
}

async function scrollCenter(locator: Locator): Promise<void> {
  // Garante que o elemento esteja visivel e centralizado na viewport.
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await locator
    .evaluate((el) => {
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
    })
    .catch(() => {});
}

async function highlight(locator: Locator, color = '#00d2ff'): Promise<void> {
  // Destaca visualmente o elemento para facilitar o debug/visualizacao.
  await locator
    .evaluate(
      (el, c) => {
        const htmlEl = el as HTMLElement;
        const prev = htmlEl.style.outline;
        const prevOffset = htmlEl.style.outlineOffset;
        htmlEl.style.outline = `3px solid ${c}`;
        htmlEl.style.outlineOffset = '2px';
        window.setTimeout(() => {
          htmlEl.style.outline = prev;
          htmlEl.style.outlineOffset = prevOffset;
        }, 650);
      },
      color,
    )
    .catch(() => {});
}

export class FuncoesElementosHtml {
  private readonly page: Page;
  private readonly log: Logger;
  private readonly timeoutMs: number;
  private readonly registro: RegistroElemento;

  constructor(page: Page, opts?: { log?: Logger; timeoutMs?: number; elementos?: ElementoHtml[] }) {
    // Inicializa a classe com pagina, logger, timeout e registro inicial.
    this.page = page;
    this.log = opts?.log ?? (() => {});
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.registro = this.criarRegistro(opts?.elementos ?? []);
  }

  registrarElemento(el: ElementoHtml): void {
    // Registra um elemento individual para resolucao por id ou indice.
    this.registro.porId.set(normalizeId(el.idHtml), el);
    this.registro.porIndex.set(el.index, el);
  }

  registrarElementos(elements: ElementoHtml[]): void {
    // Registra uma lista de elementos.
    for (const el of elements) this.registrarElemento(el);
  }

  carregarElementosJson(filePath: string): void {
    // Carrega elementos de um JSON externo e registra internamente.
    const full = path.resolve(filePath);
    const raw = fs.readFileSync(full, { encoding: 'utf-8' });
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`Arquivo de elementos invalido: ${full}`);
    this.registrarElementos(parsed as ElementoHtml[]);
  }

  obterElementoPorIndice(index: number): ElementoHtml | null {
    // Retorna o elemento pelo indice cadastrado.
    return this.registro.porIndex.get(index) ?? null;
  }

  obterElementoPorId(idHtml: string): ElementoHtml | null {
    // Retorna o elemento pelo idHtml cadastrado.
    return this.registro.porId.get(normalizeId(idHtml)) ?? null;
  }

  async ExibirObjetoHtml(idHtml: string, _acao?: string): Promise<void> {
    // Exibe/destaca o elemento na tela (sem interacao).
    await this.executarAcao('exibir', idHtml);
  }

  async PreencherObjetoHtml(idHtml: string, informacao: string): Promise<void> {
    // Preenche o elemento com a informacao fornecida.
    await this.executarAcao('preencher', idHtml, { valor: informacao });
  }

  async PrencherObjetoHtml(idHtml: string, informacao: string): Promise<void> {
    // Alias (com grafia original) para PreencherObjetoHtml.
    await this.PreencherObjetoHtml(idHtml, informacao);
  }

  async ClickObjetoHtml(idHtml: string, _acao?: string): Promise<void> {
    // Clica no elemento identificado.
    await this.executarAcao('clicar', idHtml);
  }

  async executarAcao(
    acao: AcaoHtmlKey | AcaoHtmlIndex,
    idHtml: string,
    op?: AcaoOpcoes,
  ): Promise<string | void> {
    // Executa uma acao generica no elemento identificado.
    const key = this.normalizarAcao(acao);
    const locator = await this.resolveLocator(idHtml);
    if (!locator) throw new Error(`Elemento nao encontrado: ${idHtml}`);

    await scrollCenter(locator);
    await highlight(locator);
    this.log(`[HTML] ${key}: ${idHtml}`);

    const timeoutMs = op?.timeoutMs ?? this.timeoutMs;

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
        await locator.evaluate((el) => (el as HTMLElement).blur());
        return;
      case 'preencher':
        await locator.fill(op?.valor ?? '', { timeout: timeoutMs });
        return;
      case 'teclar':
        if (!op?.tecla) throw new Error('teclar requer op.tecla');
        await locator.press(op.tecla, { timeout: timeoutMs });
        return;
      case 'selecionar-valor':
        if (!op?.selectValue) throw new Error('selecionar-valor requer op.selectValue');
        await locator.selectOption({ value: op.selectValue });
        return;
      case 'selecionar-label':
        if (!op?.selectLabel) throw new Error('selecionar-label requer op.selectLabel');
        await locator.selectOption({ label: op.selectLabel });
        return;
      case 'selecionar-indice':
        if (op?.selectIndex === undefined) throw new Error('selecionar-indice requer op.selectIndex');
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
        if (isChecked) await locator.uncheck({ timeout: timeoutMs });
        else await locator.check({ timeout: timeoutMs });
        return;
      }
      case 'upload':
        if (!op?.arquivos?.length) throw new Error('upload requer op.arquivos');
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
        if (!op?.atributo) throw new Error('ler-atributo requer op.atributo');
        const value = await locator.getAttribute(op.atributo);
        return value ?? '';
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
        const out = op?.screenshotPath ?? `elemento-${Date.now()}.png`;
        await locator.screenshot({ path: out });
        return out;
      }
      default:
        throw new Error(`Acao nao suportada: ${String(key)}`);
    }
  }

  async executarAcaoPorIndice(
    acaoIndex: AcaoHtmlIndex,
    elementoIndex: number,
    op?: AcaoOpcoes,
  ): Promise<string | void> {
    // Executa uma acao usando o indice do elemento e o indice da acao.
    const el = this.obterElementoPorIndice(elementoIndex);
    if (!el) throw new Error(`Elemento nao encontrado no indice: ${elementoIndex}`);
    return this.executarAcao(acaoIndex, el.idHtml, op);
  }

  private criarRegistro(elements: ElementoHtml[]): RegistroElemento {
    // Cria os mapas de resolucao por id e por indice.
    const porId = new Map<string, ElementoHtml>();
    const porIndex = new Map<number, ElementoHtml>();
    for (const el of elements) {
      porId.set(normalizeId(el.idHtml), el);
      porIndex.set(el.index, el);
    }
    return { porId, porIndex };
  }

  private normalizarAcao(acao: AcaoHtmlKey | AcaoHtmlIndex): AcaoHtmlKey {
    // Converte indice de acao para chave textual.
    if (typeof acao === 'number') return this.acaoIndexToKey(acao);
    return acao;
  }

  private acaoIndexToKey(index: AcaoHtmlIndex): AcaoHtmlKey {
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

  private async resolveLocator(idHtml: string): Promise<Locator | null> {
    // Resolve o locator a partir do registro, seletor ou idHtml informado.
    const el = this.obterElementoPorId(idHtml);
    const selector = el?.selector ?? '';
    const id = el?.idHtml ?? idHtml;

    if (selector && isCssSelectorLike(selector)) {
      const locBySel = await resolveLocatorBySelector(this.page, selector);
      if (locBySel) return locBySel;
    }

    if (isCssSelectorLike(id)) {
      const locBySel = await resolveLocatorBySelector(this.page, id);
      if (locBySel) return locBySel;
    }

    return resolveLocatorById(this.page, id);
  }
}
