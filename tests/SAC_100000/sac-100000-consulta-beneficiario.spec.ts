import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FuncoesAcessoMenu } from '../src/funcoes_acesso_menu';
import { AcaoHtmlIndex, FuncoesElementosHtml, type ElementoHtml } from '../src/funcoes_elementos_html';

type RequestSAC = {
  sac: { numero: string; nome: string };
  env: { base_url: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: { associados: string[]; aguardar_contrato_carregar_s?: number };
  menu?: { consulta_beneficiario?: { data_modulo_funcao: string; texto?: string } };
  telas: { consulta_beneficiario: { frame_url_hint: string } };
  parametros_entrada?: {
    menu?: { itens?: { chave: string; data_modulo_funcao: string; texto?: string }[] };
    elementos_html?: { elementos: ElementoHtml[] };
  };
  execucao?: { delay_entre_passos_ms?: number; timeout_por_passo_ms?: number };
};

function readRequest(): RequestSAC {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const sacNumero = 'SAC_100000';
  const candidates = [
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}`),
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}.json`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}.json`),
  ];
  const requestPath = candidates.find((p) => fs.existsSync(p));
  if (!requestPath) {
    throw new Error(`Request nao encontrado. Tentativas:\n${candidates.map((c) => `- ${c}`).join('\n')}`);
  }
  const raw = fs.readFileSync(requestPath, { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as RequestSAC;
  return parsed.parametros_entrada ? { ...parsed, ...parsed.parametros_entrada } : parsed;
}

const REQUEST = readRequest();
const BASE_URL = REQUEST.env.base_url;
const BASE_DB_PREFERIDA = REQUEST.env.base_db_preferida ?? '';
const USUARIO = process.env.TOPSAUDE_USUARIO ?? REQUEST.env.usuario ?? '';
const SENHA = process.env.TOPSAUDE_SENHA ?? REQUEST.env.senha ?? '';

if (!USUARIO || !SENHA) {
  throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
}
const ASSOCIADOS = REQUEST.entrada.associados;
const AGUARDAR_TELA_S = REQUEST.entrada.aguardar_contrato_carregar_s ?? 10;
const MENU_CONSULTA = (() => {
  const direto = REQUEST.menu?.consulta_beneficiario?.data_modulo_funcao;
  if (direto) return direto;
  const itens = REQUEST.parametros_entrada?.menu?.itens ?? [];
  const item = itens.find((i) => i.chave === 'consulta_beneficiario');
  if (!item?.data_modulo_funcao) throw new Error('Menu consulta_beneficiario nao encontrado no request');
  return item.data_modulo_funcao;
})();
const FRAME_HINT = REQUEST.telas.consulta_beneficiario.frame_url_hint;

const STEP_DELAY_MS = REQUEST.execucao?.delay_entre_passos_ms ?? 2000;
const STEP_TIMEOUT_MS = REQUEST.execucao?.timeout_por_passo_ms ?? 30_000;

const REPO_ROOT = path.resolve(__dirname, '..', '..');
let currentStepName = '';

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timeout apos ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function step(page: Page, name: string, fn: () => Promise<void>, timeoutMs = STEP_TIMEOUT_MS): Promise<void> {
  await test.step(name, async () => {
    currentStepName = name;
    await withTimeout(fn(), timeoutMs, name);
  });
  await page.waitForTimeout(STEP_DELAY_MS);
}

async function describeElement(locator: Locator): Promise<string> {
  try {
    return await locator.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return '<non-HTMLElement>';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().replace(/\s+/g, '.')}` : '';
      const name = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '';
      const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
      const aria = el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : '';
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const text = txt ? ` text="${txt}"` : '';
      return `${tag}${id}${cls}${name}${role}${aria}${text}`;
    });
  } catch {
    return '<unavailable>';
  }
}

function logAction(action: string, element: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${currentStepName || 'step?'}] ${action}: ${element}`);
}

async function clickCentered(locator: Locator, label = 'CLICK'): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', inline: 'center' });
  });
  logAction('CLICK', await describeElement(locator));
  await flashElement(locator, label);
  await locator.click({ timeout: STEP_TIMEOUT_MS });
  await locator.page().waitForTimeout(150);
}

async function showCentered(locator: Locator, label = 'SHOW'): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', inline: 'center' });
  });
  logAction('SHOW', await describeElement(locator));
  await flashElement(locator, label);
  await locator.page().waitForTimeout(150);
}

async function flashElement(locator: Locator, label: string): Promise<void> {
  await locator.evaluate(
    (el, text) => {
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = `${Math.max(0, rect.left - 6)}px`;
      overlay.style.top = `${Math.max(0, rect.top - 6)}px`;
      overlay.style.width = `${Math.max(0, rect.width + 12)}px`;
      overlay.style.height = `${Math.max(0, rect.height + 12)}px`;
      overlay.style.border = '3px solid #00d2ff';
      overlay.style.borderRadius = '8px';
      overlay.style.boxShadow = '0 0 0 6px rgba(0, 210, 255, 0.18)';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';
      overlay.style.opacity = '1';
      overlay.style.transition = 'opacity 650ms ease';

      const tag = document.createElement('div');
      tag.textContent = String(text || '');
      tag.style.position = 'absolute';
      tag.style.left = '6px';
      tag.style.top = '-12px';
      tag.style.padding = '2px 6px';
      tag.style.font = '12px/1.2 Arial, sans-serif';
      tag.style.color = '#001018';
      tag.style.background = 'rgba(0, 210, 255, 0.95)';
      tag.style.borderRadius = '6px';
      tag.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
      overlay.appendChild(tag);

      document.documentElement.appendChild(overlay);
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 700);
      }, 100);
    },
    label,
  );
  await locator.page().waitForTimeout(120);
}

async function fillFirst(locators: Locator[], value: string, field: string): Promise<void> {
  for (const l of locators) {
    const el = l.first();
    if (!(await el.count())) continue;
    try {
      await flashElement(el, `FILL: ${field}`);
      logAction(`FILL(${field})`, await describeElement(el));
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
      await clickCentered(el, `CLICK: ${what}`);
      return;
    } catch {
      // next
    }
  }
  throw new Error(`Nao foi possivel clicar em: ${what}`);
}

async function clickFirstFast(locators: Locator[], what: string, timeoutMs = 3000): Promise<void> {
  for (const l of locators) {
    const el = l.first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: timeoutMs, force: true });
      return;
    } catch {
      // next
    }
  }
  throw new Error(`Nao foi possivel clicar em: ${what}`);
}

async function installClickHighlighter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const markerId = '__pw_click_marker';
    if (document.getElementById(markerId)) return;

    const root = document.createElement('div');
    root.id = markerId;
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '0';
    root.style.height = '0';
    root.style.zIndex = '2147483647';
    root.style.pointerEvents = 'none';
    document.documentElement.appendChild(root);

    const add = (x: number, y: number) => {
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.left = `${Math.max(0, x - 14)}px`;
      el.style.top = `${Math.max(0, y - 14)}px`;
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.border = '3px solid #ff2d55';
      el.style.borderRadius = '999px';
      el.style.boxShadow = '0 0 0 4px rgba(255, 45, 85, 0.2)';
      el.style.background = 'rgba(255, 45, 85, 0.08)';
      el.style.pointerEvents = 'none';
      el.style.transition = 'opacity 600ms ease';
      root.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 650);
      }, 50);
    };

    window.addEventListener(
      'pointerdown',
      (e) => {
        const pe = e as PointerEvent;
        add(pe.clientX, pe.clientY);
      },
      { capture: true },
    );
  });
}

async function login(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      await page.waitForTimeout(1000);
    }
  }

  const baseDb = page.getByRole('combobox').first();
  if (await baseDb.count()) {
    if (BASE_DB_PREFERIDA) {
      await baseDb.selectOption({ label: BASE_DB_PREFERIDA }).catch(async () => {
        await baseDb.selectOption({ index: 1 }).catch(() => {});
      });
    } else {
      await baseDb.selectOption({ index: 1 }).catch(() => {});
    }
  }

  await fillFirst(
    [
      page.getByLabel(/Usu[aÃ¡]rio/i),
      page.locator('input[name*="usuario" i], input[id*="usuario" i], input[name*="login" i], input[id*="login" i]'),
      page.locator('input[type="text"], input:not([type])').first(),
    ],
    USUARIO,
    'Usuario',
  );

  await fillFirst(
    [page.getByLabel(/Senha/i), page.locator('input[type="password"]'), page.locator('input[name*="senha" i], input[id*="senha" i]')],
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

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
}

async function assertAreaLogada(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/TSNMVC\/TSNMVC\/Home\/AreaLogada/i, { timeout: 15_000 });
  await expect(page.locator('#btn-menu')).toHaveCount(1, { timeout: 15_000 });
}

async function ensureMenuOpen(page: Page): Promise<void> {
  const btn = page.locator('#btn-menu').first();
  if (await btn.count()) {
    await clickCentered(btn, 'CLICK: btn-menu').catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function waitForFrameByUrlPart(page: Page, urlPart: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frames = page.frames();
    const found = frames.find((f) => (f.url() ?? '').toLowerCase().includes(urlPart.toLowerCase()));
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw new Error(`Frame nao encontrado: url contem '${urlPart}' (timeout ${timeoutMs}ms)`);
}

async function waitForFrameWithSelector(page: Page, selector: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.locator(selector).first().count()) return frame;
      } catch {
        // ignore detached frames
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Frame nao encontrado: seletor '${selector}' (timeout ${timeoutMs}ms)`);
}

async function findFirstInFrames(page: Page, selector: string): Promise<Locator | null> {
  for (const frame of page.frames()) {
    try {
      const loc = frame.locator(selector).first();
      if (await loc.count()) return loc;
    } catch {
      // ignore detached frames
    }
  }
  return null;
}

async function forceClickByDataModuloFuncao(page: Page, dm: string): Promise<void> {
  const selector = `[data-modulo-funcao="${dm}"]`;
  const loc = await findFirstInFrames(page, selector);
  if (!loc) throw new Error(`Item do menu nao encontrado: ${selector}`);
  await loc.evaluate((el) => {
    (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
    (el as HTMLElement).click();
  });
}

async function slowScrollFrame(frame: Frame, direction: 'down' | 'up'): Promise<void> {
  const step = direction === 'down' ? 450 : -450;
  for (let i = 0; i < 10; i += 1) {
    try {
      await withTimeout(frame.evaluate((d) => window.scrollBy(0, d), step), 1500, `scroll(${direction})#${i + 1}`);
    } catch {
      break;
    }
    await frame.page().waitForTimeout(180);
  }
}

async function waitForAnyFrameText(page: Page, pattern: RegExp, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const hit = frame.getByText(pattern).first();
        if (await hit.count()) return;
      } catch {
        // ignore detached frames
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Texto nao encontrado em nenhum frame: ${String(pattern)} (timeout ${timeoutMs}ms)`);
}

async function clickContinuarInFrame(frame: Frame): Promise<void> {
  const selectors = [
    'input[type="submit" i][value*="continuar" i]',
    'input[type="image" i][alt*="continuar" i]',
    'img[alt*="continuar" i], img[title*="continuar" i]',
    '.barimg',
    'button:has-text("Continuar")',
    'a:has-text("Continuar")',
  ];

  const clicked = await frame.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.click();
        return true;
      } catch {
        // ignore
      }
    }
    return false;
  }, selectors);

  if (clicked) return;

  await clickFirstFast(
    [
      frame.getByRole('button', { name: /Continuar/i }),
      frame.getByRole('img', { name: /Continuar/i }),
      frame.getByText(/Continuar/i),
      frame.locator('input[type="submit" i][value*="continuar" i]'),
      frame.locator('input[type="image" i][alt*="continuar" i]'),
      frame.locator('img[alt*="continuar" i], img[title*="continuar" i]'),
      frame.locator('.barimg'),
    ],
    'Continuar',
  );
}

async function clickSairAtendimento(page: Page): Promise<void> {
  await clickFirst(
    [
      page.getByRole('button', { name: /Sair do atendimento|Sair|Encerrar/i }),
      page.getByText(/Sair do atendimento|Sair|Encerrar/i),
      page.locator('input[type="submit" i][value*="sair" i]'),
    ],
    'Sair do atendimento',
  );
}

test.setTimeout(20 * 60 * 1000);
test.use({ video: 'on' });

const SAC_NUMERO = REQUEST.sac.numero;
const OUT_DIR = path.resolve(REPO_ROOT, 'tests', SAC_NUMERO);
const VIDEO_DIR = path.resolve(OUT_DIR, 'videos');
const REPORT_PATH = path.resolve(OUT_DIR, `${SAC_NUMERO}_report.md`);

function nowIso(): string {
  return new Date().toISOString();
}

function extractAssociadoFromTitle(title: string): string {
  const m = title.match(/\b\d{8,}\b/);
  return m ? m[0] : 'unknown';
}

test.describe.serial(`SAC_100000 (Consulta Beneficiario): ${REQUEST.sac.nome}`, () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
    const header = [
      `# Relatorio ${SAC_NUMERO} (Consulta Beneficiario)`,
      '',
      `Gerado em: ${nowIso()}`,
      '',
      '| Associado | Status | Executado em |',
      '| --- | --- | --- |',
      '',
    ].join('\n');
    fs.writeFileSync(REPORT_PATH, header, { encoding: 'utf-8' });
  });

  test.afterEach(async ({}, testInfo) => {
    const associado = testInfo.annotations.find((a) => a.type === 'associado')?.description ?? extractAssociadoFromTitle(testInfo.title);
    const status = testInfo.status;

    fs.appendFileSync(REPORT_PATH, `| ${associado} | ${status} | ${nowIso()} |\n`, { encoding: 'utf-8' });

    if (!associado || associado === 'unknown') return;

    const dst = path.resolve(VIDEO_DIR, `${associado}.webm`);
    fs.mkdirSync(VIDEO_DIR, { recursive: true });

    const rootsToSearch = [
      testInfo.outputDir,
      path.dirname(testInfo.outputDir),
      path.dirname(path.dirname(testInfo.outputDir)),
      path.resolve(OUT_DIR, 'pw-results-sac100000'),
      path.resolve(REPO_ROOT, 'test-results'),
    ];

    const seen = new Set<string>();
    const findVideo = (root: string): string => {
      if (!root || seen.has(root)) return '';
      seen.add(root);
      if (!fs.existsSync(root)) return '';

      const stack: string[] = [root];
      while (stack.length) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (/node_modules/i.test(ent.name)) continue;
            stack.push(full);
            continue;
          }
          if (!ent.isFile()) continue;
          if (ent.name.toLowerCase() !== 'video.webm') continue;
          if (!full.includes(associado)) continue;
          return full;
        }
      }
      return '';
    };

    let src = '';
    for (const r of rootsToSearch) {
      src = findVideo(r);
      if (src) break;
    }
    if (!src) {
      const fromVideo = testInfo.video?.path();
      if (fromVideo && fs.existsSync(fromVideo)) src = fromVideo;
    }
    if (!src) return;

    try {
      fs.copyFileSync(src, dst);
    } catch {
      // ignore
    }
  });

  for (const associado of ASSOCIADOS) {
    test(`Associado ${associado}`, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'associado', description: associado });

      const menu = new FuncoesAcessoMenu(page, { log: (msg) => logAction('MENU', msg) });
      const elementos = REQUEST.parametros_entrada?.elementos_html?.elementos ?? [];
      const html = new FuncoesElementosHtml(page, {
        log: (msg) => logAction('HTML', msg),
        elementos,
      });

      await installClickHighlighter(page);

      await step(page, '1-4: Login', async () => {
        await login(page);
        await assertAreaLogada(page);
      });

      await step(page, `5-6: Validar area logada (associado ${associado})`, async () => {
        await assertAreaLogada(page);
      });

      await step(page, `7: Abrir menu Consulta Beneficiario (${MENU_CONSULTA}) (associado ${associado})`, async () => {
        try {
          await menu.abrirMenu(MENU_CONSULTA);
        } catch {
          await ensureMenuOpen(page);
          try {
            await menu.abrirMenu(MENU_CONSULTA);
          } catch {
            await forceClickByDataModuloFuncao(page, MENU_CONSULTA);
          }
        }
      });

      await step(page, `8-10: Informar num_associado (associado ${associado})`, async () => {
        const frame = await waitForFrameByUrlPart(page, FRAME_HINT, 30_000);

        try {
          await html.executarAcaoPorIndice(AcaoHtmlIndex.Preencher, 1, { valor: associado });
          await html.executarAcaoPorIndice(AcaoHtmlIndex.Clicar, 2);
        } catch {
          const numAssociado = await findFirstInFrames(page, '#num_associado');
          if (numAssociado) {
            await clickCentered(numAssociado, 'CLICK: num_associado');
            await numAssociado.fill(associado, { timeout: 8000 });
          } else {
            throw new Error('Campo num_associado nao encontrado');
          }

          await clickContinuarInFrame(frame);
        }
      });

      await step(page, `11: Aguardar carregar tela (cal0087b) (associado ${associado})`, async () => {
        await waitForFrameByUrlPart(page, 'cal0087b', AGUARDAR_TELA_S * 1000).catch(async () => {
          await waitForAnyFrameText(page, /Benefici[aÃ¡]rio/i, AGUARDAR_TELA_S * 1000);
        });
      });

      await step(page, `12: Scroll ate o fim do frame (associado ${associado})`, async () => {
        const frame = await waitForFrameWithSelector(page, 'body', 15_000);
        await slowScrollFrame(frame, 'down');
      });

      await step(page, `13: Mostrar dados do beneficiario (associado ${associado})`, async () => {
        const nome = await findFirstInFrames(page, '#nome_beneficiario');
        if (nome) {
          await showCentered(nome, 'SHOW: nome_beneficiario');
          return;
        }
        const qualquer = await findFirstInFrames(page, '[id*="benefici" i], [name*="benefici" i]');
        if (qualquer) {
          await showCentered(qualquer, 'SHOW: beneficiario');
        }
      });

      await step(page, `14: Scroll ate o inicio do frame (associado ${associado})`, async () => {
        const frame = await waitForFrameWithSelector(page, 'body', 15_000);
        await slowScrollFrame(frame, 'up');
      });

      await step(page, `15: Sair do atendimento (associado ${associado})`, async () => {
        await clickSairAtendimento(page);
      });
    });
  }
});
