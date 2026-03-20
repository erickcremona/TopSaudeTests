import { test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://10.130.113.19/TSNMVC/TSNMVC/Home/AreaLogada';
const USUARIO = process.env.TOPSAUDE_USUARIO ?? process.env.USUARIO ?? '';
const SENHA = process.env.TOPSAUDE_SENHA ?? process.env.SENHA ?? '';

if (!USUARIO || !SENHA) {
  throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA (ou USUARIO/SENHA) no ambiente.');
}

const OUTPUT_DIR = path.resolve(__dirname);
const OUTPUT_MD = path.join(OUTPUT_DIR, 'MENU_IDENTIFICADORES.md');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'menu-identificadores.json');

const DELAY_MS = 300;
const TIMEOUT_MS = 5 * 60 * 1000;

type MenuItem = {
  index: number;
  text: string;
  tag: string;
  frameUrl: string;
  visible: boolean;
  level: number;
  path: string[];
  pathText: string;
  attrs: Record<string, string>;
  locatorSuggested: string;
};

function fixMojibake(s: string): string {
  // Corrige casos comuns onde texto UTF-8 foi decodificado como latin1 (ex.: "Autorizações").
  if (!s) return s;
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    // Evita "consertar" quando piora (caracter de substituicao).
    if (fixed.includes('\uFFFD')) return s;
    return fixed;
  } catch {
    return s;
  }
}

function fixRecord(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = fixMojibake(v);
  return out;
}

function allFrames(page: Page): Frame[] {
  // inclui frame principal (url = page.url())? Nao: Playwright expõe main frame como page.mainFrame().
  // Ainda assim, page.frames() inclui o main frame.
  return page.frames();
}

async function fillFirst(locators: Locator[], value: string, field: string): Promise<void> {
  for (const l of locators) {
    const el = l.first();
    if (!(await el.count())) continue;
    try {
      await el.fill(value, { timeout: 8000 });
      return;
    } catch {
      // next
    }
  }
  throw new Error(`Nao foi possivel preencher: ${field}`);
}

async function clickFirst(locators: Locator[], what: string): Promise<void> {
  for (const l of locators) {
    const el = l.first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: 8000 });
      return;
    } catch {
      // next
    }
  }
  throw new Error(`Nao foi possivel clicar em: ${what}`);
}

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  await fillFirst(
    [
      page.getByLabel(/Usu[aá]rio/i),
      page.locator('input[name*="usuario" i], input[id*="usuario" i], input[name*="login" i], input[id*="login" i]'),
      page.locator('input[type="text"], input:not([type])').first(),
    ],
    USUARIO,
    'Usuario',
  );

  await fillFirst(
    [
      page.getByLabel(/Senha/i),
      page.locator('input[type="password"]'),
      page.locator('input[name*="senha" i], input[id*="senha" i]'),
    ],
    SENHA,
    'Senha',
  );

  await clickFirst(
    [
      page.getByRole('button', { name: /Entrar|Acessar|Login/i }),
      page.locator('input[type="submit"], button[type="submit"]'),
      page.getByText(/Entrar|Acessar|Login/i),
    ],
    'Entrar',
  );

  // algumas telas fazem postback sem navegacao; espere um pouco e siga.
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function expandMenuInFrame(frame: Frame): Promise<void> {
  // Tenta expandir apenas itens "expansores" para evitar navegacao.
  // Executa varias passadas ate nao encontrar mais.
  for (let pass = 0; pass < 40; pass += 1) {
    const expandedAny = await frame.evaluate(() => {
      const clickable = (el: Element): el is HTMLElement => el instanceof HTMLElement;
      const isVisible = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            '[aria-expanded="false"]',
            'a[href^="#dropdown" i]',
            '[data-bs-toggle="collapse"]',
            '[data-toggle="collapse"]',
            '[data-toggle="dropdown"]',
            '.collapsed',
          ].join(','),
        ),
      ).filter((el) => clickable(el) && isVisible(el));

      let clicked = 0;
      for (const el of candidates) {
        // Evita clicar em links que parecem navegar.
        const tag = el.tagName.toLowerCase();
        const href = tag === 'a' ? (el.getAttribute('href') ?? '') : '';
        const looksNavigational =
          href &&
          href !== '#' &&
          !href.toLowerCase().startsWith('javascript:') &&
          !href.toLowerCase().includes('void(0)');

        if (looksNavigational && !el.hasAttribute('aria-expanded')) continue;

        try {
          el.click();
          clicked += 1;
        } catch {
          // ignore
        }
      }

      return clicked > 0;
    });

    if (!expandedAny) break;
    await frame.page().waitForTimeout(DELAY_MS);
  }
}

async function waitForMenuPresence(page: Page): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    let found = false;
    for (const frame of allFrames(page)) {
      try {
        const count = await frame.locator('nav a, aside a, [role="navigation"] a, a, button').count();
        if (count >= 5) {
          found = true;
          break;
        }
      } catch {
        // frame pode estar mudando
      }
    }
    if (found) return;
    await page.waitForTimeout(400);
  }
}

async function collectMenuItemsFromFrame(frame: Frame): Promise<Omit<MenuItem, 'index'>[]> {
  return frame.evaluate(() => {
    type RawItem = {
      text: string;
      tag: string;
      frameUrl: string;
      visible: boolean;
      level: number;
      path: string[];
      pathText: string;
      attrs: Record<string, string>;
      locatorSuggested: string;
    };

    const doc = document;
    const frameUrl = window.location.href;

    const isVisible = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const pickMenuRoot = (): HTMLElement => {
      const roots = Array.from(
        doc.querySelectorAll<HTMLElement>(
          [
            'nav',
            'aside',
            '[role="navigation"]',
            '[id*="menu" i]',
            '[class*="menu" i]',
            '[class*="nav" i]',
            '[class*="sidebar" i]',
          ].join(','),
        ),
      ).filter((el) => isVisible(el));

      const scored = roots
        .map((el) => {
          const links = el.querySelectorAll('a, button, [role="menuitem"]').length;
          return { el, links };
        })
        .sort((a, b) => b.links - a.links);

      // Se nao encontrou nada "tipico", cai no body.
      return scored[0]?.el ?? (doc.body as HTMLElement);
    };

    const menuRoot = pickMenuRoot();

    const clickablesVisible = Array.from(
      menuRoot.querySelectorAll<HTMLElement>('a, button, [role="menuitem"], [onclick]'),
    ).filter((el) => isVisible(el));

    const moduloFuncaoCandidates = Array.from(doc.querySelectorAll<HTMLElement>('[data-modulo-funcao]')).filter((el) => {
      // Mantem apenas elementos potencialmente clicaveis.
      if (el.matches('a, button, [role="link"], [role="menuitem"], [onclick]')) return true;
      return false;
    });

    const clickablesAll = [...clickablesVisible, ...moduloFuncaoCandidates];

    const normText = (el: HTMLElement): string => {
      const raw =
        (el.innerText || '').trim() ||
        (el.getAttribute('aria-label') ?? '').trim() ||
        (el.getAttribute('title') ?? '').trim();
      return raw.replace(/\s+/g, ' ').trim();
    };

    const dedupePreserveOrder = (arr: string[]): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const s of arr) {
        const v = (s ?? '').trim();
        if (!v) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      return out;
    };

    const hierarchyByLi = (el: HTMLElement, selfText: string): string[] => {
      const parents: string[] = [];
      let li = el.closest('li');
      while (li) {
        const parentLi = li.parentElement?.closest('li') ?? null;
        if (!parentLi) break;
        const toggle = parentLi.querySelector<HTMLElement>(':scope > a, :scope > button, :scope > [role="menuitem"]');
        const t = toggle ? normText(toggle) : '';
        if (t) parents.unshift(t);
        li = parentLi;
      }
      const full = [...parents, selfText].filter(Boolean);
      return dedupePreserveOrder(full);
    };

    const hierarchyByDropdownId = (el: HTMLElement, selfText: string): string[] => {
      const parents: string[] = [];
      const visited = new Set<string>();
      let current: HTMLElement | null = el;

      while (current) {
        const container =
          current.closest<HTMLElement>('[id^="dropdown"], [id*="dropdown" i], .collapse, .dropdown-menu') ?? null;
        if (!container) break;
        const id = (container.getAttribute('id') ?? '').trim();
        if (!id) break;
        if (visited.has(id)) break;
        visited.add(id);

        const toggle =
          doc.querySelector<HTMLElement>(
            `a[href="#${CSS.escape(id)}"], button[data-bs-target="#${CSS.escape(id)}"], [data-target="#${CSS.escape(id)}"]`,
          ) ?? null;
        if (!toggle) break;
        const t = normText(toggle);
        if (t) parents.unshift(t);

        current = toggle;
      }

      const full = [...parents, selfText].filter(Boolean);
      return dedupePreserveOrder(full);
    };

    const menuHierarchy = (el: HTMLElement, selfText: string): { path: string[]; level: number; pathText: string } => {
      const p1 = hierarchyByLi(el, selfText);
      const p2 = hierarchyByDropdownId(el, selfText);

      const path = (p2.length >= p1.length ? p2 : p1) || [];
      const level = Math.max(0, path.length - 1);
      const pathText = path.join(' > ');
      return { path, level, pathText };
    };

    const relevantAttrs = (el: HTMLElement): Record<string, string> => {
      const out: Record<string, string> = {};

      const add = (k: string, v: string | null) => {
        const vv = (v ?? '').trim();
        if (!vv) return;
        // evita arquivo gigante com atributos enormes
        out[k] = vv.length > 200 ? `${vv.slice(0, 200)}...` : vv;
      };

      add('id', el.getAttribute('id'));
      add('name', el.getAttribute('name'));
      add('role', el.getAttribute('role'));
      add('href', el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') : null);
      add('title', el.getAttribute('title'));
      add('aria-label', el.getAttribute('aria-label'));
      add('aria-expanded', el.getAttribute('aria-expanded'));
      add('onclick', el.getAttribute('onclick'));

      // data-* "importantes" (inclui data-modulo-funcao, frequentemente usado no TSNMVC)
      for (const attr of Array.from(el.attributes)) {
        if (!attr.name.toLowerCase().startsWith('data-')) continue;
        add(attr.name, attr.value);
      }

      // class ajuda quando nao existe outro identificador
      add('class', el.getAttribute('class'));

      return out;
    };

    const escapeAttr = (s: string) => s.replace(/"/g, '\\"');

    const roleSuggested = (el: HTMLElement, text: string): string | null => {
      const tag = el.tagName.toLowerCase();
      if (!text) return null;
      if (tag === 'a') return `page.getByRole('link', { name: ${JSON.stringify(text)} })`;
      if (tag === 'button') return `page.getByRole('button', { name: ${JSON.stringify(text)} })`;
      const role = el.getAttribute('role')?.toLowerCase() ?? '';
      if (role === 'menuitem') return `page.getByRole('menuitem', { name: ${JSON.stringify(text)} })`;
      return null;
    };

    const selectorSuggested = (attrs: Record<string, string>, text: string, el: HTMLElement): string => {
      const dm = attrs['data-modulo-funcao'];
      if (dm) return `page.locator('[data-modulo-funcao="${escapeAttr(dm)}"]')`;
      const id = attrs.id;
      if (id) return `page.locator('#${escapeAttr(id)}')`;

      // data-testid-like
      for (const key of Object.keys(attrs)) {
        if (!key.startsWith('data-')) continue;
        if (key === 'data-modulo-funcao') continue;
        const val = attrs[key];
        const lower = key.toLowerCase();
        const looksTestId =
          lower.includes('test') || lower.includes('qa') || lower.includes('cy') || lower.includes('e2e');
        if (looksTestId && val) return `page.locator('[${key}="${escapeAttr(val)}"]')`;
      }

      const byRole = roleSuggested(el, text);
      if (byRole) return byRole;
      if (text) return `page.getByText(${JSON.stringify(text)})`;
      return `page.locator('${el.tagName.toLowerCase()}')`;
    };

    const uniq = new Map<string, RawItem>();
    for (const el of clickablesAll) {
      const text = normText(el);
      const h = menuHierarchy(el, text);
      const attrs = relevantAttrs(el);
      const visible = isVisible(el);
      if (!text && !attrs['data-modulo-funcao'] && !attrs.id && !attrs.href) continue;

      const locatorSuggested = selectorSuggested(attrs, text, el);
      const tag = el.tagName.toLowerCase();

      const key = JSON.stringify({
        text,
        tag,
        dm: attrs['data-modulo-funcao'] ?? '',
        id: attrs.id ?? '',
        href: attrs.href ?? '',
        path: h.pathText,
      });
      if (uniq.has(key)) continue;
      uniq.set(key, { text, tag, frameUrl, visible, level: h.level, path: h.path, pathText: h.pathText, attrs, locatorSuggested });
    }

    return Array.from(uniq.values()).sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'));
  });
}

function asMarkdown(items: MenuItem[], meta: { generatedAt: string; baseUrl: string; pageUrl: string }): string {
  const lines: string[] = [];
  lines.push('# Identificadores do Menu Principal (Esquerda)');
  lines.push('');
  lines.push(`Gerado em: \`${meta.generatedAt}\``);
  lines.push(`Base URL: \`${meta.baseUrl}\``);
  lines.push(`URL apos login: \`${meta.pageUrl}\``);
  lines.push('');
  lines.push('## Como Gerar/Regerar');
  lines.push('');
  lines.push('Comando sugerido:');
  lines.push('');
  lines.push('```powershell');
  lines.push('npx playwright test "menu-identificadores/menu-identificadores.spec.ts" --headed --output "menu-identificadores/pw-results-menu"');
  lines.push('```');
  lines.push('');
  lines.push(`Arquivo de saida: \`${OUTPUT_MD}\``);
  lines.push('');
  lines.push('## Resumo (Indexado)');
  lines.push('');
  lines.push('| # | Funcao (texto) | Nivel | Caminho | data-modulo-funcao | id | href | Visivel | Locator sugerido | Frame URL |');
  lines.push('| -: | --- | -: | --- | --- | --- | --- | --- | --- | --- |');

  for (const it of items) {
    const dm = it.attrs['data-modulo-funcao'] ?? '';
    const id = it.attrs.id ?? '';
    const href = it.attrs.href ?? '';
    lines.push(
      `| ${it.index} | ${escapeMd(it.text)} | ${it.level} | ${escapeMd(it.pathText)} | ${escapeMd(dm)} | ${escapeMd(
        id,
      )} | ${escapeMd(href)} | ${it.visible ? 'sim' : 'nao'} | ${escapeMd(it.locatorSuggested)} | ${escapeMd(
        it.frameUrl,
      )} |`,
    );
  }

  lines.push('');
  lines.push('## Detalhes');
  lines.push('');

  for (const it of items) {
    lines.push(`### ${it.index}. ${it.text ? escapeMd(it.text) : '(sem texto)'}`);
    lines.push('');
    lines.push(`Tag: \`${it.tag}\``);
    lines.push(`Visivel: \`${it.visible ? 'sim' : 'nao'}\``);
    lines.push(`Nivel: \`${it.level}\``);
    lines.push(`Caminho: \`${it.pathText}\``);
    lines.push(`Frame URL: \`${it.frameUrl}\``);
    lines.push(`Locator sugerido: \`${it.locatorSuggested}\``);
    lines.push('');
    lines.push('Atributos:');
    const keys = Object.keys(it.attrs).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (!keys.length) {
      lines.push('- (nenhum)');
    } else {
      for (const k of keys) {
        lines.push(`- \`${k}\`: \`${it.attrs[k]}\``);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function escapeMd(s: string): string {
  return (s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test.setTimeout(TIMEOUT_MS);

test('Extrair identificadores do menu esquerdo', async ({ page }) => {
  await login(page);
  await waitForMenuPresence(page);

  // Expande menus em todos os frames (o menu pode estar no main frame ou em iframe).
  for (const frame of allFrames(page)) {
    try {
      await expandMenuInFrame(frame);
    } catch {
      // ignore
    }
  }

  // Forca cliques em expansores "dropdown" para renderizar subitens preguiçosos.
  for (const frame of allFrames(page)) {
    try {
      await expandMenuInFrame(frame);
    } catch {
      // ignore
    }
  }

  // Coleta de itens.
  const collected: Omit<MenuItem, 'index'>[] = [];
  for (const frame of allFrames(page)) {
    try {
      const items = await collectMenuItemsFromFrame(frame);
      for (const it of items) {
        collected.push({
          ...it,
          text: fixMojibake(it.text),
          attrs: fixRecord(it.attrs),
          locatorSuggested: fixMojibake(it.locatorSuggested),
        });
      }
    } catch {
      // ignore
    }
  }

  // Deduplicacao global e indexacao.
  const uniq = new Map<string, Omit<MenuItem, 'index'>>();
  for (const it of collected) {
    const dm = it.attrs['data-modulo-funcao'] ?? '';
    const key = JSON.stringify({ t: it.text, tag: it.tag, dm, id: it.attrs.id ?? '', href: it.attrs.href ?? '', frame: it.frameUrl });
    if (uniq.has(key)) continue;
    uniq.set(key, it);
  }

  const items = Array.from(uniq.values())
    .sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'))
    .map((it, i) => ({ ...it, index: i + 1 }));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2), { encoding: 'utf-8' });

  const md = asMarkdown(items, {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    pageUrl: page.url(),
  });
  fs.writeFileSync(OUTPUT_MD, md, { encoding: 'utf-8' });
});
