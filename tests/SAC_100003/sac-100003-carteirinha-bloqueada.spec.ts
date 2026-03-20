import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

type RequestSAC = {
  sac: { numero: string; nome: string };
  env: { base_url: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: { associados: string[]; aguardar_contrato_carregar_s?: number };
  menu: { consulta_beneficiario: { data_modulo_funcao: string; texto?: string } };
  telas: { consulta_beneficiario: { frame_url_hint: string; campos?: { num_associado_id?: string; acao_continuar_id?: string } } };
  execucao?: { delay_entre_passos_ms?: number; timeout_por_passo_ms?: number };
};

function resolveExistingPath(candidates: string[]): string {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Request nao encontrado. Tentativas:\n${candidates.map((c) => `- ${c}`).join('\n')}`);
}

function readRequest(): RequestSAC {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const sacNumero = 'SAC_100003';
  const requestPath = resolveExistingPath([
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}`),
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}.json`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}.json`),
  ]);
  const raw = fs.readFileSync(requestPath, { encoding: 'utf-8' });
  return JSON.parse(raw) as RequestSAC;
}

const REQUEST = readRequest();
const BASE_URL = REQUEST.env.base_url;
const USUARIO = process.env.TOPSAUDE_USUARIO ?? REQUEST.env.usuario ?? '';
const SENHA = process.env.TOPSAUDE_SENHA ?? REQUEST.env.senha ?? '';

if (!USUARIO || !SENHA) {
  throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
}
const ASSOCIADO = REQUEST.entrada.associados[0];
const MENU_CONSULTA = REQUEST.menu.consulta_beneficiario.data_modulo_funcao;
const FRAME_HINT = REQUEST.telas.consulta_beneficiario.frame_url_hint;
const NUM_ASSOCIADO_ID = REQUEST.telas.consulta_beneficiario.campos?.num_associado_id ?? 'num_associado';
const BTN_CONTINUAR_ID = REQUEST.telas.consulta_beneficiario.campos?.acao_continuar_id ?? 'btn_acao_continuar';

const STEP_DELAY_MS = REQUEST.execucao?.delay_entre_passos_ms ?? 2000;
const STEP_TIMEOUT_MS = REQUEST.execucao?.timeout_por_passo_ms ?? 30_000;

let currentStepName = '';

type MenuIdentificadoresItem = {
  text: string;
  pathText?: string;
  attrs?: Record<string, string>;
};

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

function log(action: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${currentStepName || 'step?'}] ${action}: ${msg}`);
}

async function gotoWithRetry(page: Page, url: string, timeoutMs = 30_000): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      return;
    } catch (e) {
      if (attempt >= 2) throw e;
      await page.waitForTimeout(1000);
    }
  }
}

async function flash(locator: Locator, label: string): Promise<void> {
  await locator.evaluate(
    (el, text) => {
      if (!(el instanceof HTMLElement)) return;
      const badge = document.createElement('div');
      badge.textContent = text;
      badge.style.position = 'fixed';
      badge.style.left = '12px';
      badge.style.top = '12px';
      badge.style.padding = '6px 10px';
      badge.style.borderRadius = '10px';
      badge.style.background = 'rgba(15, 23, 42, 0.92)';
      badge.style.color = '#fff';
      badge.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      badge.style.fontSize = '12px';
      badge.style.zIndex = '2147483647';

      const prevOutline = el.style.outline;
      const prevOffset = el.style.outlineOffset;
      el.style.outline = '3px solid #ff2d55';
      el.style.outlineOffset = '2px';

      document.body.appendChild(badge);
      window.setTimeout(() => {
        badge.remove();
        el.style.outline = prevOutline;
        el.style.outlineOffset = prevOffset;
      }, 750);
    },
    label,
  ).catch(() => {});
}

async function clickCentered(locator: Locator, label: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }).catch(() => {});
  await flash(locator, label);
  await locator.click({ timeout: STEP_TIMEOUT_MS });
  await locator.page().waitForTimeout(150);
}

async function showCentered(locator: Locator, label: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }).catch(() => {});
  await flash(locator, label);
  await locator.page().waitForTimeout(150);
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

    document.addEventListener(
      'click',
      (ev) => {
        const e = ev as MouseEvent;
        const dot = document.createElement('div');
        dot.style.position = 'fixed';
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
        dot.style.width = '14px';
        dot.style.height = '14px';
        dot.style.marginLeft = '-7px';
        dot.style.marginTop = '-7px';
        dot.style.borderRadius = '50%';
        dot.style.border = '2px solid #00d4ff';
        dot.style.background = 'rgba(0, 212, 255, 0.18)';
        dot.style.boxShadow = '0 0 0 6px rgba(0, 212, 255, 0.10)';
        dot.style.pointerEvents = 'none';
        dot.style.transform = 'scale(0.9)';
        dot.style.transition = 'transform 140ms ease, opacity 420ms ease';
        root.appendChild(dot);
        requestAnimationFrame(() => {
          dot.style.transform = 'scale(1.12)';
          dot.style.opacity = '0';
        });
        window.setTimeout(() => dot.remove(), 500);
      },
      true,
    );

    document.documentElement.appendChild(root);
  });
}

async function ensureMenuVisible(page: Page): Promise<void> {
  const nav = page.locator('nav, aside, [role="navigation"]').first();
  const navVisible = await nav.isVisible().catch(() => false);
  if (navVisible) return;

  const btn = page.locator('#btn-menu').first();
  if (await btn.count()) {
    await clickCentered(btn, 'CLICK: btn-menu').catch(() => {});
    await nav.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function findNavContainer(page: Page): Promise<Locator> {
  const nav = page.locator('nav, aside, [role="navigation"]').first();
  if (await nav.count().catch(() => 0)) return nav;
  // fallback: procura em frames (caso o shell mude)
  const fromFrames = await findFirstInFrames(page, 'nav, aside, [role="navigation"]');
  if (fromFrames) return fromFrames;
  throw new Error('Container do menu (nav/aside/[role=navigation]) nao encontrado');
}

async function openMenuConsultaBeneficiario(page: Page, dm: string): Promise<void> {
  const nav = await findNavContainer(page);

  const nivel2 = nav.locator(`[data-modulo-funcao="${dm}"]`).first();
  const nivel1 = nav
    .locator('a[href^="#dropdown-"], a[href^="#dropdown-lvl"]')
    .filter({ hasText: /Consulta\s+Benefici[aá]rio/i })
    .first();

  // Garantir que o nivel 2 esteja visivel antes de clicar nele.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const n2Visible = await nivel2.isVisible().catch(() => false);
    if (n2Visible) break;
    if (await nivel1.count().catch(() => 0)) {
      await clickCentered(nivel1, 'MENU N1: Consulta Beneficiario');
      await page.waitForTimeout(350);
    }
  }

  // Agora abre o item (nivel 2).
  if (!(await nivel2.count().catch(() => 0))) {
    // fallback: procurar no DOM inteiro (algumas skins movem o item para fora do nav).
    const any = await findFirstInFrames(page, `[data-modulo-funcao="${dm}"]`);
    if (!any) throw new Error(`Item do menu nivel 2 nao encontrado: data-modulo-funcao="${dm}"`);
    await clickCentered(any, `MENU N2: OPEN ${dm}`);
    return;
  }

  await clickCentered(nivel2, `MENU N2: OPEN ${dm}`);
}

async function showBanner(page: Page, text: string, ms = 1300): Promise<void> {
  await page.evaluate(
    ({ t, durationMs }) => {
      const id = '__pw_banner';
      const prev = document.getElementById(id);
      if (prev) prev.remove();

      const el = document.createElement('div');
      el.id = id;
      el.textContent = t;
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.top = '12px';
      el.style.transform = 'translateX(-50%)';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '14px';
      el.style.background = 'rgba(2, 6, 23, 0.92)';
      el.style.color = '#fff';
      el.style.fontFamily =
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
      el.style.fontSize = '12px';
      el.style.letterSpacing = '0.2px';
      el.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.35)';
      el.style.zIndex = '2147483647';
      el.style.maxWidth = '90vw';
      el.style.whiteSpace = 'nowrap';
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'ellipsis';

      document.documentElement.appendChild(el);
      window.setTimeout(() => el.remove(), Math.max(300, durationMs));
    },
    { t: text, durationMs: ms },
  ).catch(() => {});
}

function readMenuIdentificadores(dm: string): { pathText: string; text: string } {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const jsonPath = path.resolve(repoRoot, 'tests', 'menu-identificadores', 'menu-identificadores.json');
  const raw = fs.readFileSync(jsonPath, { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as unknown;
  const items = (Array.isArray(parsed) ? parsed : []) as MenuIdentificadoresItem[];
  const found = items.find((it) => (it?.attrs?.['data-modulo-funcao'] ?? '') === dm);
  const text = (found?.text ?? '').trim() || dm;
  const pathText = (found?.pathText ?? '').trim() || text;
  return { pathText, text };
}

async function waitForFrameByUrlPart(page: Page, urlPart: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = page.frames().find((f) => (f.url() ?? '').toLowerCase().includes(urlPart.toLowerCase()));
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw new Error(`Frame nao encontrado: url contem '${urlPart}' (timeout ${timeoutMs}ms)`);
}

async function findFirstInFrames(page: Page, selector: string): Promise<Locator | null> {
  const fromPage = page.locator(selector);
  if (await fromPage.count().catch(() => 0)) return fromPage.first();
  for (const frame of page.frames()) {
    const loc = frame.locator(selector);
    if (await loc.count().catch(() => 0)) return loc.first();
  }
  return null;
}

async function findNumeroBeneficiarioField(frame: Frame): Promise<Locator> {
  // Preferir ID conhecido do fluxo antigo.
  const byId = frame.locator(`#${NUM_ASSOCIADO_ID}`).first();
  if (await byId.count().catch(() => 0)) return byId;

  // Fallback: procura pelo label visível na linha e pega o primeiro input.
  const byRow = frame
    .locator('tr')
    .filter({ hasText: /N[úu]mero\s+Benefici[aá]rio/i })
    .locator('input, textarea')
    .first();
  if (await byRow.count().catch(() => 0)) return byRow;

  // Fallback final: primeiro textbox visível do frame.
  const anyTextbox = frame.locator('input[type="text"], input:not([type]), textarea').first();
  if (await anyTextbox.count().catch(() => 0)) return anyTextbox;

  throw new Error('Campo do numero do beneficiario nao encontrado no frame');
}

async function findNumeroBeneficiarioFieldAny(page: Page): Promise<Locator> {
  const frames = page.frames();
  for (const frame of frames) {
    const candidates: Locator[] = [
      frame.locator(`#${NUM_ASSOCIADO_ID}`),
      frame.locator('input[name*="num_associado" i], input[id*="num_associado" i]'),
      frame.locator('tr').filter({ hasText: /N[úu]mero\s+Benefici[aá]rio/i }).locator('input, textarea'),
    ];

    for (const c of candidates) {
      const first = c.first();
      const count = await first.count().catch(() => 0);
      if (!count) continue;
      const visible = await first.isVisible().catch(() => false);
      if (!visible) continue;
      log('FRAME', `usando frame url="${frame.url()}"`);
      return first;
    }
  }

  // Fallback final: pega qualquer textbox visível em qualquer frame.
  for (const frame of frames) {
    const anyTextbox = frame.locator('input[type="text"], input:not([type]), textarea').first();
    if (await anyTextbox.count().catch(() => 0)) {
      log('FRAME', `fallback textbox frame url="${frame.url()}"`);
      return anyTextbox;
    }
  }

  throw new Error('Campo do numero do beneficiario nao encontrado em nenhum frame');
}

async function findFirstTextInFrames(page: Page, pattern: RegExp): Promise<Locator | null> {
  for (const frame of page.frames()) {
    try {
      const hit = frame.getByText(pattern).first();
      if (await hit.count()) return hit;
    } catch {
      // ignore detached frames
    }
  }
  return null;
}

async function waitForAnyFrameText(page: Page, pattern: RegExp, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await findFirstTextInFrames(page, pattern)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timeout aguardando texto em algum frame: ${pattern}`);
}

async function login(page: Page): Promise<void> {
  // Passo 1 faz o goto; aqui mantemos apenas um fallback.
  if (!new RegExp('/TSNMVC/TSNMVC/Home/AreaLogada', 'i').test(page.url() || '')) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  }

  // Best-effort: se existir "Base/DB", escolhe antes de logar.
  const baseDb = page.getByRole('combobox').first();
  if (await baseDb.count()) {
    const pref = REQUEST.env.base_db_preferida;
    if (pref) {
      await baseDb.selectOption({ label: pref }).catch(() => {});
      log('SELECT', `Base DB: ${pref}`);
    }
  }

  const usuario = page.getByLabel(/Usu[aá]rio/i).or(page.locator('input[name*="usuario" i], input[id*="usuario" i], input[name*="login" i], input[id*="login" i]')).first();
  await usuario.waitFor({ state: 'visible', timeout: 15_000 });
  await clickCentered(usuario, 'CLICK: usuario');
  await usuario.fill(USUARIO, { timeout: 8000 });
  log('FILL', `usuario="${USUARIO}"`);

  const senha = page.getByLabel(/Senha/i).or(page.locator('input[type="password"]')).first();
  await senha.waitFor({ state: 'visible', timeout: 15_000 });
  await clickCentered(senha, 'CLICK: senha');
  await senha.fill(SENHA, { timeout: 8000 });
  log('FILL', 'senha="***"');

  const entrar = page.getByRole('button', { name: /Entrar|Acessar|Login/i }).or(page.locator('input[type="submit"], button[type="submit"]')).first();
  if (await entrar.count()) {
    await clickCentered(entrar, 'CLICK: entrar');
  } else {
    // fallback: press Enter no campo senha
    await senha.press('Enter').catch(() => {});
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
}

async function assertAreaLogada(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/TSNMVC\/TSNMVC\/Home\/AreaLogada/i, { timeout: 15_000 });
  await expect(page.locator('#btn-menu')).toHaveCount(1, { timeout: 15_000 });
}

async function clickContinuarInFrame(frame: Frame): Promise<void> {
  const byId = frame.locator(`#${BTN_CONTINUAR_ID}`).first();
  if (await byId.count().catch(() => 0)) {
    await clickCentered(byId, `CLICK: #${BTN_CONTINUAR_ID}`);
    return;
  }

  const continuar = frame
    .getByRole('img', { name: /Continuar/i })
    .or(frame.locator('img[alt*="continuar" i], img[title*="continuar" i], input[type="image" i][alt*="continuar" i]'))
    .or(frame.getByRole('button', { name: /Continuar/i }))
    .or(frame.locator('input[type="submit" i][value*="continuar" i], button:has-text("Continuar"), a:has-text("Continuar"), .barimg'))
    .first();

  if (await continuar.count().catch(() => 0)) {
    await clickCentered(continuar, 'CLICK: Continuar');
    return;
  }

  // Fallback (algumas telas podem renderizar o botÃ£o fora do frame esperado).
  const pageBtn = frame.page().locator(`#${BTN_CONTINUAR_ID}`).first();
  if (await pageBtn.count().catch(() => 0)) {
    await clickCentered(pageBtn, `CLICK: #${BTN_CONTINUAR_ID} (page)`);
    return;
  }

  throw new Error('Botao Continuar nao encontrado');
}

async function findContinuarAny(page: Page): Promise<Locator> {
  const contexts: Array<{ label: string; ctx: Page | Frame }> = [{ label: 'page', ctx: page }];
  for (const f of page.frames()) contexts.push({ label: `frame:${f.url()}`, ctx: f });

  for (const { label, ctx } of contexts) {
    const loc = ctx
      .getByRole('img', { name: /Continuar/i })
      .or(ctx.getByRole('button', { name: /Continuar/i }))
      .or(
        ctx.locator(
          [
            `#${BTN_CONTINUAR_ID}`,
            'img[alt*="continuar" i]',
            'img[title*="continuar" i]',
            'input[type="image" i][alt*="continuar" i]',
            'input[type="submit" i][value*="continuar" i]',
            'button:has-text("Continuar")',
            'a:has-text("Continuar")',
            '.barimg',
          ].join(', '),
        ),
      )
      .first();

    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    log('CONTINUAR', `encontrado em ${label}`);
    return loc;
  }

  throw new Error('Botao Continuar nao encontrado (page/frames)');
}

test.use({ video: 'on' });

test.describe('SAC_100003 - Consulta Beneficiario (Carteirinha Bloqueada: SIM)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(10 * 60 * 1000);

  test(`Associado ${ASSOCIADO}`, async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'associado', description: ASSOCIADO });
    testInfo.annotations.push({ type: 'objetivo', description: REQUEST.sac.nome });

    await installClickHighlighter(page);

    await step(page, `1: Abrir TopSaude (${BASE_URL})`, async () => {
      await gotoWithRetry(page, BASE_URL, 30_000);
    });

    await step(page, '2: Login (env)', async () => {
      await login(page);
      await assertAreaLogada(page);
    });

    await step(page, `3: Abrir menu Consulta Beneficiario (${MENU_CONSULTA})`, async () => {
      await ensureMenuVisible(page);

      const { pathText, text } = readMenuIdentificadores(MENU_CONSULTA);
      await showBanner(page, `MENU: ${pathText} -> ${text}`, 1600);

      // Fluxo requerido: clicar em Consulta Beneficiario (nivel 1) e depois (nivel 2).
      await openMenuConsultaBeneficiario(page, MENU_CONSULTA);
    }, 60_000);

    await step(page, `4: Informar numero do associado (${ASSOCIADO})`, async () => {
      // Garante que a tela alvo esta renderizada em algum frame.
      await waitForAnyFrameText(page, /Benefici[aá]rio/i, 30_000);

      // Preferir frame_hint, mas permitir varrer todos os frames (a tela pode variar).
      await waitForFrameByUrlPart(page, FRAME_HINT, 30_000).catch(() => {});

      const campo = await findNumeroBeneficiarioFieldAny(page);
      await campo.waitFor({ state: 'visible', timeout: 30_000 });
      await clickCentered(campo, `CLICK: campo_beneficiario`);
      await campo.fill(ASSOCIADO, { timeout: 8000 });
      log('FILL', `beneficiario="${ASSOCIADO}"`);
    });

    await step(page, '5: Clicar Continuar', async () => {
      const continuar = await findContinuarAny(page);
      await clickCentered(continuar, 'CLICK: Continuar');
    });

    await step(page, "6: Validar 'Carteirinha Bloqueada: SIM' e exibir objetivo", async () => {
      await waitForAnyFrameText(page, /Carteirinha\s*Bloqueada\s*:\s*SIM/i, 30_000);

      const hit = await findFirstTextInFrames(page, /Carteirinha\s*Bloqueada\s*:\s*SIM/i);
      if (hit) await showCentered(hit, 'SUCESSO: Carteirinha Bloqueada = SIM');

      // eslint-disable-next-line no-console
      console.log(`[OBJETIVO] ${REQUEST.sac.numero}: ${REQUEST.sac.nome}`);
    });
  });
});
