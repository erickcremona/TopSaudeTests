import { test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FuncoesAcessoMenu } from '../src/funcoes_acesso_menu';

type SacRequest = {
  sac: { numero: string; nome: string };
  env: { base_url: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: { contratos: string[]; aguardar_contrato_carregar_s?: number };
  menu: {
    alteracao: { data_modulo_funcao: string; texto?: string };
    registra_grupo_contrato: { data_modulo_funcao: string; texto?: string };
  };
  telas: {
    alteracao: { frame_url_hint: string; campo_contrato_id: string };
    contrato: {
      frame_url_hint: string;
      somente_mostrar_campo_id?: string;
      campo_grupo_id: string;
      botao_limpar_id: string;
      fechar_janela_selector: string;
    };
    registra_grupo_contrato: { frame_url_hint: string; campo_grupo_id: string; acao_continuar: string };
  };
  regras?: {
    se_grupo_vazio_pular_registra_grupo_contrato?: boolean;
    na_tela_registra_grupo_contrato_preencher_apenas?: string;
    nunca_informar_numero_do_contrato_no_campo_de_grupo?: boolean;
  };
  execucao?: {
    delay_entre_passos_ms?: number;
    timeout_por_passo_ms?: number;
    modo_visual?: boolean;
    sempre_mostrar_cliques?: boolean;
    sempre_logar_clique_fill_read?: boolean;
  };
  sucesso_quando?: string;
};

function loadRequest(): SacRequest {
  const requestPath = path.resolve(__dirname, '..', '..', 'requests_ia', 'SAC_166839', 'request_SAC_166839.json');
  const raw = fs.readFileSync(requestPath, { encoding: 'utf-8' });
  return JSON.parse(raw) as SacRequest;
}

async function delayIfConfigured(req: SacRequest): Promise<void> {
  const ms = req.execucao?.delay_entre_passos_ms ?? 0;
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function fillFirst(locators: Locator[], value: string, field: string): Promise<void> {
  for (const locator of locators) {
    const el = locator.first();
    if (!(await el.count())) continue;
    try {
      await el.fill(value, { timeout: 8000 });
      return;
    } catch {
      // try next
    }
  }
  throw new Error(`Não foi possível preencher: ${field}`);
}

async function clickFirst(locators: Locator[], what: string): Promise<void> {
  for (const locator of locators) {
    const el = locator.first();
    if (!(await el.count())) continue;
    try {
      await el.click({ timeout: 8000 });
      return;
    } catch {
      // try next
    }
  }
  throw new Error(`Não foi possível clicar em: ${what}`);
}

async function dismissPopupIfPresent(page: Page): Promise<void> {
  const modal = page
    .locator('[role="dialog"]:visible, .modal:visible, .k-window:visible, .ui-dialog:visible')
    .filter({ hasText: /Aten[çc][aã]o/i })
    .first();

  const modalCount = await modal.count().catch(() => 0);
  if (!modalCount) return;

  const closeCandidates = [
    modal.locator('button[aria-label="Close"]'),
    modal.locator('button[aria-label="Fechar"]'),
    modal.locator('.close'),
    modal.locator('.k-window-action.k-link'),
    modal.getByRole('button', { name: /OK|Fechar|Close/i }),
  ];

  for (const c of closeCandidates) {
    if (!(await c.count().catch(() => 0))) continue;
    try {
      await c.first().click({ timeout: 2000 });
      await page.waitForTimeout(200);
      return;
    } catch {
      // try next
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

async function login(page: Page, req: SacRequest): Promise<void> {
  const usuario = process.env.TOPSAUDE_USUARIO ?? req.env.usuario ?? '';
  const senha = process.env.TOPSAUDE_SENHA ?? req.env.senha ?? '';

  if (!usuario || !senha) {
    throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
  }

  await page.goto(req.env.base_url, { waitUntil: 'domcontentloaded' });
  await dismissPopupIfPresent(page);

  await fillFirst(
    [
      page.getByLabel(/Usu[aá]rio/i),
      page.locator('input[name*="usuario" i], input[id*="usuario" i], input[name*="login" i], input[id*="login" i]'),
      page.locator('input[type="text"], input:not([type])').first(),
    ],
    usuario,
    'Usuário',
  );

  await fillFirst(
    [page.getByLabel(/Senha/i), page.locator('input[type="password"]'), page.locator('input[name*="senha" i], input[id*="senha" i]')],
    senha,
    'Senha',
  );

  await dismissPopupIfPresent(page);

  await clickFirst(
    [
      page.getByRole('button', { name: /Entrar|Acessar|Login/i }),
      page.locator('input[type="submit"], button[type="submit"]'),
      page.getByText(/Entrar|Acessar|Login/i),
    ],
    'Entrar',
  );

  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);

  const loginInvalido = page.getByText(/senha.*incorret|incorret.*senha/i).first();
  if ((await loginInvalido.count().catch(() => 0)) && (await loginInvalido.isVisible().catch(() => false))) {
    throw new Error(
      'Login falhou (usuário/senha incorretos). Verifique TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou env.usuario/env.senha no request).',
    );
  }

  if (req.env.base_db_preferida) {
    const select = page.locator('select').first();
    try {
      if (await select.count()) {
        await select.selectOption({ label: req.env.base_db_preferida }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }
}

function allFrames(page: Page): Frame[] {
  return page.frames();
}

async function waitForFrameUrlHint(page: Page, urlHint: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = allFrames(page).find((f) => (f.url() ?? '').toLowerCase().includes(urlHint.toLowerCase()));
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timeout aguardando frame com URL contendo "${urlHint}"`);
}

async function waitForVisibleInAnyFrame(page: Page, locatorFactory: (ctx: Page | Frame) => Locator, timeoutMs: number): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of allFrames(page)) {
      const loc = locatorFactory(frame).first();
      const count = await loc.count().catch(() => 0);
      if (!count) continue;
      const visible = await loc.isVisible().catch(() => false);
      if (visible) return loc;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Timeout aguardando locator ficar visível em algum frame.');
}

async function findCampoContrato(page: Page, req: SacRequest, timeoutMs: number): Promise<Locator> {
  const byId = `#${req.telas.alteracao.campo_contrato_id}`;

  try {
    return await waitForVisibleInAnyFrame(page, (ctx) => ctx.locator(byId), timeoutMs);
  } catch {
    // fallback: tenta achar input por label/atributos
  }

  const attrCandidates = [
    'input[id*="contrato" i]',
    'input[name*="contrato" i]',
    'input[id*="num" i][id*="contrato" i]',
    'input[name*="num" i][name*="contrato" i]',
  ];

  for (const css of attrCandidates) {
    try {
      return await waitForVisibleInAnyFrame(page, (ctx) => ctx.locator(css), 4000);
    } catch {
      // next
    }
  }

  try {
    return await waitForVisibleInAnyFrame(page, (ctx) => ctx.getByLabel(/Contrato/i), 4000);
  } catch {
    // ignore
  }

  throw new Error(
    `Campo de contrato não encontrado. Verifique "telas.alteracao.campo_contrato_id" (atual="${req.telas.alteracao.campo_contrato_id}").`,
  );
}

async function findCampoGrupo(page: Page, req: SacRequest, timeoutMs: number): Promise<Locator> {
  const byId = `#${req.telas.registra_grupo_contrato.campo_grupo_id}`;

  try {
    return await waitForVisibleInAnyFrame(page, (ctx) => ctx.locator(byId), timeoutMs);
  } catch {
    // fallback: tenta achar input por label/atributos
  }

  const attrCandidates = [
    'input[id*="grupo" i]',
    'input[name*="grupo" i]',
    'input[id*="empresa" i]',
    'input[name*="empresa" i]',
  ];

  for (const css of attrCandidates) {
    try {
      return await waitForVisibleInAnyFrame(page, (ctx) => ctx.locator(css), 4000);
    } catch {
      // next
    }
  }

  const labelCandidates = [/Grupo Contrato/i, /Grupo/i];
  for (const re of labelCandidates) {
    try {
      return await waitForVisibleInAnyFrame(page, (ctx) => ctx.getByLabel(re), 4000);
    } catch {
      // next
    }
  }

  throw new Error(
    `Campo de grupo não encontrado. Verifique "telas.registra_grupo_contrato.campo_grupo_id" (atual="${req.telas.registra_grupo_contrato.campo_grupo_id}").`,
  );
}

async function waitForAnyFrameText(page: Page, re: RegExp, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of allFrames(page)) {
      const loc = frame.getByText(re, { exact: false }).first();
      const count = await loc.count().catch(() => 0);
      if (!count) continue;
      const visible = await loc.isVisible().catch(() => false);
      if (visible) return;
    }
    await page.waitForTimeout(250);
  }
}

async function avancarRegistraGrupo(page: Page, campoGrupo: Locator, continuarLabel: string, timeoutMs: number): Promise<void> {
  // 1) tenta clicar em um botao/acao "Continuar" (se existir no layout)
  const frame = await campoGrupo.elementHandle().then((h) => h?.ownerFrame()).catch(() => null);
  const ctx: (Page | Frame)[] = [page, ...(frame ? [frame] : [])];

  const candidates: Locator[] = [];
  for (const c of ctx) {
    candidates.push(
      c.getByRole('button', { name: new RegExp(continuarLabel, 'i') }),
      c.locator(`input[type="button"][value="${continuarLabel}"]`),
      c.locator(`input[type="submit"][value="${continuarLabel}"]`),
      c.getByText(new RegExp(`^${continuarLabel}$`, 'i')),
    );
  }

  try {
    await clickFirst(candidates, continuarLabel);
    return;
  } catch {
    // segue para fallback
  }

  // 2) fallback: ENTER no campo
  await campoGrupo.press('Enter').catch(() => {});
  await page.waitForTimeout(300);

  // 3) fallback: clique no "lupa" ao lado do campo (se existir)
  const iconCandidates: Locator[] = [];
  if (frame) {
    iconCandidates.push(
      frame.locator('img[title*="Pesquisar" i], img[alt*="Pesquisar" i], img[title*="Consulta" i], img[alt*="Consulta" i]'),
      frame.locator('a:has(img), button:has(img)'),
      campoGrupo.locator('xpath=following::img[1]'),
    );
  }
  for (const ic of iconCandidates) {
    const el = ic.first();
    const count = await el.count().catch(() => 0);
    if (!count) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    await el.click({ timeout: 3000 }).catch(() => {});
    break;
  }

  // best-effort: aguarda algum indicio de avancar
  await waitForAnyFrameText(page, /Adicionar Contrato|Contratos do Grupo|Nome do Contratante|Contratos/i, timeoutMs).catch(() => {});
}

async function closeKendoWindow(page: Page, selector: string): Promise<void> {
  const close = page.locator(`${selector}:visible`).last();
  if (await close.count()) await close.click({ timeout: 8000 }).catch(() => {});
}

async function tryClickLimpar(page: Page, frameContrato: Frame, id: string, timeoutMs: number): Promise<boolean> {
  const selectors = [
    `#${id}`,
    `input#${id}`,
    `button#${id}`,
    'button:has-text("Limpar")',
    'input[value*="Limpar" i]',
    '[aria-label*="Limpar" i]',
    '[title*="Limpar" i]',
  ];

  for (const sel of selectors) {
    const candidates: Locator[] = [frameContrato.locator(sel), page.locator(sel)];
    for (const f of allFrames(page)) candidates.push(f.locator(sel));
    for (const c of candidates) {
      const el = c.first();
      const count = await el.count().catch(() => 0);
      if (!count) continue;
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      await el.click({ timeout: timeoutMs }).catch(() => {});
      return true;
    }
  }

  // fallback por role/texto
  const roleCandidates: Locator[] = [
    frameContrato.getByRole('button', { name: /Limpar/i }),
    page.getByRole('button', { name: /Limpar/i }),
  ];
  for (const c of roleCandidates) {
    const el = c.first();
    if (!(await el.count().catch(() => 0))) continue;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    await el.click({ timeout: timeoutMs }).catch(() => {});
    return true;
  }

  return false;
}

async function readDigitsFromInput(frame: Frame, id: string): Promise<string> {
  const input = frame.locator(`#${id}`);
  const value = (await input.inputValue().catch(() => '')) ?? '';
  return value.replace(/\D+/g, '');
}

test.use({ video: 'on' });

test.describe('SAC_166839 (VCOM) - dirigido por requests_ia/SAC_166839/request_SAC_166839.json', () => {
  const req = loadRequest();
  const perStepTimeout = req.execucao?.timeout_por_passo_ms ?? 30_000;
  const contractLoadWaitMs = (req.entrada?.aguardar_contrato_carregar_s ?? 10) * 1000;

  test.describe.configure({ mode: 'serial' });
  test.setTimeout(15 * 60 * 1000);

  for (const contrato of req.entrada.contratos) {
    test(`${req.sac.numero} - ${req.sac.nome} - contrato ${contrato}`, async ({ page }) => {
      await login(page, req);
      await delayIfConfigured(req);

      const menu = new FuncoesAcessoMenu(page, { log: (msg) => console.log(msg) });

      await menu.abrirMenu(req.menu.alteracao.data_modulo_funcao);
      await delayIfConfigured(req);

      await waitForFrameUrlHint(page, req.telas.alteracao.frame_url_hint, perStepTimeout);
      const campoContrato = await findCampoContrato(page, req, perStepTimeout);
      await campoContrato.fill(contrato, { timeout: perStepTimeout }).catch(async () => {
        await campoContrato.click({ timeout: perStepTimeout }).catch(() => {});
        await campoContrato.fill('', { timeout: perStepTimeout }).catch(() => {});
        await campoContrato.pressSequentially(contrato, { delay: 60 });
      });
      await campoContrato.press('Tab').catch(() => {});
      await delayIfConfigured(req);

      const frameContrato = await waitForFrameUrlHint(page, req.telas.contrato.frame_url_hint, perStepTimeout);
      await frameContrato.waitForLoadState('domcontentloaded', { timeout: perStepTimeout }).catch(() => {});
      await page.waitForTimeout(contractLoadWaitMs);

      await frameContrato.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      if (req.telas.contrato.somente_mostrar_campo_id) {
        await frameContrato.locator(`#${req.telas.contrato.somente_mostrar_campo_id}`).scrollIntoViewIfNeeded().catch(() => {});
      }
      const grupoDigits = await readDigitsFromInput(frameContrato, req.telas.contrato.campo_grupo_id);
      await delayIfConfigured(req);

      await frameContrato.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      const limpou = await tryClickLimpar(page, frameContrato, req.telas.contrato.botao_limpar_id, perStepTimeout);
      if (!limpou) {
        // best-effort: segue para fechar a janela mesmo sem limpar
        // eslint-disable-next-line no-console
        console.log(`[WARN] Botão Limpar não encontrado: ${req.telas.contrato.botao_limpar_id}`);
      }
      await delayIfConfigured(req);
      await closeKendoWindow(page, req.telas.contrato.fechar_janela_selector);
      await delayIfConfigured(req);

      const shouldSkip =
        (req.regras?.se_grupo_vazio_pular_registra_grupo_contrato ?? true) && (!grupoDigits || grupoDigits.trim() === '');
      if (shouldSkip) return;

      if (req.regras?.nunca_informar_numero_do_contrato_no_campo_de_grupo && grupoDigits === contrato) {
        throw new Error(`Regra violada: grupoDigits (${grupoDigits}) igual ao contrato (${contrato})`);
      }

      await menu.abrirMenu(req.menu.registra_grupo_contrato.data_modulo_funcao);
      await delayIfConfigured(req);

      const frameRegistra = await waitForFrameUrlHint(page, req.telas.registra_grupo_contrato.frame_url_hint, perStepTimeout);
      void frameRegistra; // mantem o hint para sincronizacao, mas localiza o campo em qualquer frame
      const campoGrupo = await findCampoGrupo(page, req, perStepTimeout);

      await campoGrupo.fill(grupoDigits, { timeout: perStepTimeout });
      await delayIfConfigured(req);

      await avancarRegistraGrupo(page, campoGrupo, req.telas.registra_grupo_contrato.acao_continuar, perStepTimeout);

      await page.waitForTimeout(1500);
      await closeKendoWindow(page, req.telas.contrato.fechar_janela_selector);
    });
  }
});
