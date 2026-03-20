import type { Frame, Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type MenuIdentificadoresItem = {
  index?: number;
  text: string;
  tag: string;
  frameUrl: string;
  visible: boolean;
  level: number;
  path: string[];
  pathText: string;
  attrs: Record<string, string>;
  locatorSuggested?: string;
};

export type MenuLookup = {
  identificador: string;
  dataModuloFuncao: string;
  text: string;
  pathText: string;
};

type Logger = (msg: string) => void;

function repoRootFromThisFile(): string {
  // tests/src/funcoes_acesso_menu.ts -> repo root = ../..
  return path.resolve(__dirname, '..', '..');
}

function fixMojibake(s: string): string {
  if (!s) return s;
  if (!/[ÃƒÃ‚]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return s;
    return fixed;
  } catch {
    return s;
  }
}

function readMenuIdentificadoresJson(): MenuIdentificadoresItem[] {
  const repoRoot = repoRootFromThisFile();
  const jsonPath = path.join(repoRoot, 'tests', 'menu-identificadores', 'menu-identificadores.json');
  const raw = fs.readFileSync(jsonPath, { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`menu-identificadores.json inválido: esperado array (${jsonPath})`);
  return parsed as MenuIdentificadoresItem[];
}

function normalize(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

function normalizeLoose(s: string): string {
  // Like `normalize`, but also removes diacritics and normalizes separators/spaces for matching pathText.
  return (s ?? '')
    .replace(/\s*>\s*/g, ' > ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function findFirstInAllFrames<T>(page: Page, fn: (context: Page | Frame) => Promise<T | null>): Promise<T | null> {
  const fromPage = await fn(page);
  if (fromPage) return fromPage;
  for (const frame of page.frames()) {
    const found = await fn(frame);
    if (found) return found;
  }
  return null;
}

async function locatorInAnyFrame(page: Page, selectorOrLocator: { css?: string; id?: string; exactText?: string }): Promise<Locator | null> {
  return findFirstInAllFrames(page, async (ctx) => {
    let loc: Locator | null = null;

    if (selectorOrLocator.css) loc = ctx.locator(selectorOrLocator.css);
    if (!loc && selectorOrLocator.id) loc = ctx.locator(`[id="${selectorOrLocator.id.replaceAll('"', '\\"')}"]`);
    if (!loc && selectorOrLocator.exactText) loc = ctx.getByText(selectorOrLocator.exactText, { exact: true });

    if (!loc) return null;
    const count = await loc.count().catch(() => 0);
    if (!count) return null;
    return loc.first();
  });
}

async function scrollCenter(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  // Best-effort: nao aguardar `evaluate()` aqui (pode travar se o elemento desanexar).
  locator
    .evaluate((el) => {
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
    })
    .catch(() => {});
}

async function highlight(locator: Locator, color = 'magenta'): Promise<void> {
  // Best-effort: nao aguardar `evaluate()` aqui (pode travar se o elemento desanexar).
  locator
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
        }, 600);
      },
      color,
    )
    .catch(() => {});
}

async function innerTextBestEffort(locator: Locator, timeoutMs = 700): Promise<string> {
  // `locator.innerText()` pode aguardar muito tempo dependendo do estado do DOM;
  // para o modo visual, queremos manter o fluxo do menu sempre "andando".
  let timeout: NodeJS.Timeout | undefined;
  const guard = new Promise<string>((resolve) => {
    timeout = setTimeout(() => resolve(''), timeoutMs);
  });
  try {
    const result = await Promise.race([locator.innerText({ timeout: timeoutMs }).catch(() => ''), guard]);
    return result ?? '';
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function clickToExpandOrOpen(locator: Locator): Promise<void> {
  // Evita “colapsar” nós já expandidos quando temos sinal de estado.
  await locator.click({ timeout: 8000, noWaitAfter: true });
}

export class FuncoesAcessoMenu {
  private readonly page: Page;
  private readonly log: Logger;

  private readonly items: MenuIdentificadoresItem[];
  private readonly byDataModuloFuncao: Map<string, MenuIdentificadoresItem>;
  private readonly aliases: Map<string, string>;
  private mapFuncoesCache: Record<string, () => Promise<void>> | null = null;

  constructor(page: Page, opts?: { log?: Logger; aliases?: Record<string, string> }) {
    this.page = page;
    this.log = opts?.log ?? (() => {});

    this.items = readMenuIdentificadoresJson();

    this.byDataModuloFuncao = new Map();
    for (const it of this.items) {
      const dm = it.attrs?.['data-modulo-funcao'];
      if (dm) this.byDataModuloFuncao.set(dm, it);
    }

    this.aliases = new Map();

    // Registra automaticamente um identificador por item do menu (k_<data-modulo-funcao>).
    // Assim, o chamador pode passar o identificador sem precisar conhecer o dm.
    for (const dm of this.byDataModuloFuncao.keys()) {
      this.aliases.set(FuncoesAcessoMenu.identificadorPadrao(dm), dm);
    }

    // Aplica aliases customizados por último (override).
    for (const [k, v] of Object.entries(opts?.aliases ?? {})) this.aliases.set(k, v);
  }

  static identificadorPadrao(dataModuloFuncao: string): string {
    // Compatível com o estilo do menuReferences.generated.ts (k_80_CB10_4 etc.)
    return `k_${dataModuloFuncao.replace(/[^0-9A-Za-z]+/g, '_')}`;
  }

  registrarAlias(identificador: string, dataModuloFuncao: string): void {
    this.aliases.set(identificador, dataModuloFuncao);
  }

  resolverDataModuloFuncao(identificadorOuDataModuloFuncao: string): string {
    return this.aliases.get(identificadorOuDataModuloFuncao) ?? identificadorOuDataModuloFuncao;
  }

  temIdentificador(identificadorOuDataModuloFuncao: string): boolean {
    const dm = this.resolverDataModuloFuncao(identificadorOuDataModuloFuncao);
    return this.byDataModuloFuncao.has(dm);
  }

  async abrirPorIdentificador(identificador: string): Promise<void> {
    // Atalho semântico: aceita `k_<...>` ou qualquer alias registrado.
    await this.abrirMenu(identificador);
  }

  listarPorTexto(parteDoTexto: string, limit = 30): MenuLookup[] {
    const needle = normalize(parteDoTexto);
    const out: MenuLookup[] = [];
    for (const it of this.items) {
      const dm = it.attrs?.['data-modulo-funcao'];
      if (!dm) continue;
      if (!normalize(fixMojibake(it.text)).includes(needle) && !normalize(fixMojibake(it.pathText)).includes(needle)) continue;
      out.push({
        identificador: FuncoesAcessoMenu.identificadorPadrao(dm),
        dataModuloFuncao: dm,
        text: fixMojibake(it.text),
        pathText: fixMojibake(it.pathText),
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async abrirPorPathText(pathText: string): Promise<void> {
    const wanted = normalizeLoose(fixMojibake(pathText));
    const leaf =
      this.items.find((it) => normalizeLoose(fixMojibake(it.pathText)) === wanted) ??
      this.items.find((it) => normalizeLoose(fixMojibake(it.pathText)).includes(wanted));

    const dm = leaf?.attrs?.['data-modulo-funcao'];
    if (!leaf || !dm) {
      throw new Error(
        `Menu nao encontrado para pathText="${pathText}". Atualize/regenere tests/menu-identificadores/menu-identificadores.json.`,
      );
    }

    await this.abrirMenu(dm);
  }

  async abrirMenu(identificadorOuDataModuloFuncao: string): Promise<void> {
    const dm = this.resolverDataModuloFuncao(identificadorOuDataModuloFuncao);
    const leaf = this.byDataModuloFuncao.get(dm);
    if (!leaf) {
      throw new Error(
        `Menu não encontrado para data-modulo-funcao="${dm}". Atualize/regenere tests/menu-identificadores/menu-identificadores.json.`,
      );
    }

    // Usa os segmentos do path do leaf para expandir ancestrais pelo texto (DOM),
    // e abre a função pelo seletor estável data-modulo-funcao.
    const breadcrumb = fixMojibake(leaf.pathText ?? '');
    if (breadcrumb) this.log(`[MENU] PATH: ${breadcrumb}`);

    const segmentsRaw = leaf.path ?? [];
    const segments = segmentsRaw.map((s) => fixMojibake(s)).filter(Boolean);
    const ancestors = segments.slice(0, -1);

    const nav = await this.findMenuNav();
    for (const seg of ancestors) {
      await this.clickNavSegment(nav, seg, `EXPAND ${seg}`);
    }

    await this.clickByDataModuloFuncao(dm, `OPEN ${dm}`);
  }

  criarMapaFuncoes(): Record<string, () => Promise<void>> {
    // “Uma função por objeto do menu”: gera um mapping (identificador -> função) para uso por identificadores.
    // Identificador padrão: k_<data-modulo-funcao normalizado> (ex.: k_80_CB10_4).
    if (this.mapFuncoesCache) return this.mapFuncoesCache;

    const out: Record<string, () => Promise<void>> = {};
    for (const dm of this.byDataModuloFuncao.keys()) {
      const id = FuncoesAcessoMenu.identificadorPadrao(dm);
      out[id] = async () => this.abrirMenu(dm);
    }
    this.mapFuncoesCache = out;
    return out;
  }

  private async findMenuNav(): Promise<Locator> {
    const nav = await findFirstInAllFrames(this.page, async (ctx) => {
      const loc = ctx.locator('nav, aside, [role="navigation"]').first();
      const count = await loc.count().catch(() => 0);
      if (!count) return null;
      return loc;
    });
    if (!nav) throw new Error('Não foi possível localizar o container do menu (nav/aside/[role=navigation]).');
    return nav;
  }

  private async clickNavSegment(nav: Locator, segmentText: string, label: string): Promise<void> {
    const re = new RegExp(`^${segmentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const byRole = nav.getByRole('link', { name: re }).first();
    const byText = nav.getByText(segmentText, { exact: true }).first();
    const byContains = nav.getByText(segmentText, { exact: false }).first();

    const candidates: Locator[] = [byRole, byText, byContains];
    let foundButHidden = false;
    for (const c of candidates) {
      const count = await c.count().catch(() => 0);
      if (!count) continue;
      const visible = await c.isVisible().catch(() => false);
      if (!visible) {
        foundButHidden = true;
        continue;
      }
      await this.ensureExpanded(c, label);
      return;
    }

    if (foundButHidden) {
      throw new Error(`Segmento do menu encontrado, mas não está visível: "${segmentText}"`);
    }
    throw new Error(`Segmento do menu não encontrado: "${segmentText}"`);
  }

  private async clickByDataModuloFuncao(dm: string, label: string): Promise<void> {
    const loc = await locatorInAnyFrame(this.page, { css: `[data-modulo-funcao="${dm}"]` });
    if (!loc) throw new Error(`Item do menu não encontrado no DOM: data-modulo-funcao="${dm}"`);
    await this.clickLocator(loc, label);
  }

  private async clickLocator(locator: Locator, label: string): Promise<void> {
    await scrollCenter(locator);
    await highlight(locator);
    this.log(`[MENU] ${label}: ${fixMojibake((await innerTextBestEffort(locator).catch(() => '')) || '')}`.trim());
    await clickToExpandOrOpen(locator);
    await this.page.waitForTimeout(150);
  }

  private async ensureExpanded(locator: Locator, label: string): Promise<void> {
    await scrollCenter(locator);
    await highlight(locator);
    this.log(`[MENU] ${label}: ${fixMojibake((await innerTextBestEffort(locator).catch(() => '')) || '')}`.trim());

    const ariaExpanded = await locator.getAttribute('aria-expanded').catch(() => null);
    const className = await locator.getAttribute('class').catch(() => '') ?? '';
    const alreadyExpanded = ariaExpanded === 'true' && !/\bcollapsed\b/i.test(className);
    if (alreadyExpanded) {
      await this.page.waitForTimeout(80);
      return;
    }

    await clickToExpandOrOpen(locator);
    await this.page.waitForTimeout(150);
  }
}
