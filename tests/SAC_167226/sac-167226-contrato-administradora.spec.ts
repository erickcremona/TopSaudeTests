import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FuncoesAcessoMenu } from '../src/funcoes_acesso_menu';

type SacRequest = {
  sac: { numero: string; nome: string };
  env: { base_url?: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: { contratos: string[]; aguardar_contrato_carregar_s?: number };
  menu: {
    alteracao: { data_modulo_funcao: string; texto?: string };
  };
  telas: {
    alteracao: { frame_url_hint: string; campo_contrato_id: string; acao_continuar?: string };
    contrato: {
      frame_url_hint: string;
      campo_administradora_id: string;
      campo_guarda_chuva_id: string;
    };
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

type CheckboxState = {
  checked: boolean;
  disabled: boolean;
};

type AppConfig = {
  login?: {
    topSaude?: {
      url?: string;
      usuario_env?: string;
      senha_env?: string;
    };
  };
};

function loadRequest(): SacRequest {
  const requestPath = path.resolve(__dirname, '..', '..', 'requests_ia', 'SAC_167226', 'request_SAC_167226.json');
  const raw = fs.readFileSync(requestPath, { encoding: 'utf-8' });
  return JSON.parse(raw) as SacRequest;
}

function loadAppConfig(): AppConfig {
  const configPath = path.resolve(__dirname, '..', '..', 'config-app.json');
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, { encoding: 'utf-8' });
  return JSON.parse(raw) as AppConfig;
}

const REQUEST = loadRequest();
const APP_CONFIG = loadAppConfig();
const BASE_URL = REQUEST.env.base_url?.trim() || APP_CONFIG.login?.topSaude?.url?.trim() || '';
const STEP_DELAY_MS = REQUEST.execucao?.delay_entre_passos_ms ?? 2000;
const STEP_TIMEOUT_MS = REQUEST.execucao?.timeout_por_passo_ms ?? 30_000;
const CONTRACT_LOAD_WAIT_MS = (REQUEST.entrada.aguardar_contrato_carregar_s ?? 10) * 1000;
const USUARIO =
  process.env.TOPSAUDE_USUARIO ?? (APP_CONFIG.login?.topSaude?.usuario_env ? process.env[APP_CONFIG.login.topSaude.usuario_env] : '') ?? REQUEST.env.usuario ?? '';
const SENHA =
  process.env.TOPSAUDE_SENHA ?? (APP_CONFIG.login?.topSaude?.senha_env ? process.env[APP_CONFIG.login.topSaude.senha_env] : '') ?? REQUEST.env.senha ?? '';

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

function logAction(action: string, detail: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${currentStepName || 'step?'}] ${action}: ${detail}`);
}

async function describeElement(locator: Locator): Promise<string> {
  try {
    return await locator.evaluate((el) => {
      if (!(el instanceof HTMLElement)) return '<non-HTMLElement>';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const name = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '';
      const type = el.getAttribute('type') ? `[type="${el.getAttribute('type')}"]` : '';
      return `${tag}${id}${name}${type}`;
    });
  } catch {
    return '<unavailable>';
  }
}

async function flashElement(locator: Locator, label: string): Promise<void> {
  await locator
    .evaluate(
      (el, text) => {
        if (!(el instanceof HTMLElement)) return;
        const prevOutline = el.style.outline;
        const prevOffset = el.style.outlineOffset;
        el.style.outline = '3px solid #00d2ff';
        el.style.outlineOffset = '2px';

        const badge = document.createElement('div');
        badge.textContent = String(text);
        badge.style.position = 'fixed';
        badge.style.left = '12px';
        badge.style.top = '12px';
        badge.style.padding = '4px 8px';
        badge.style.background = 'rgba(0, 210, 255, 0.95)';
        badge.style.color = '#001018';
        badge.style.font = '12px/1.2 Arial, sans-serif';
        badge.style.borderRadius = '6px';
        badge.style.zIndex = '2147483647';
        document.documentElement.appendChild(badge);

        window.setTimeout(() => {
          el.style.outline = prevOutline;
          el.style.outlineOffset = prevOffset;
          badge.remove();
        }, 650);
      },
      label,
    )
    .catch(() => {});
  await locator.page().waitForTimeout(120);
}

async function clickCentered(locator: Locator, label = 'CLICK'): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator
    .evaluate((el) => {
      if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center', inline: 'center' });
    })
    .catch(() => {});
  logAction('CLICK', await describeElement(locator));
  await flashElement(locator, label);
  await locator.click({ timeout: STEP_TIMEOUT_MS });
  await locator.page().waitForTimeout(150);
}

async function fillFirst(locators: Locator[], value: string, field: string): Promise<void> {
  for (const locator of locators) {
    const el = locator.first();
    if (!(await el.count())) continue;
    try {
      await flashElement(el, `FILL: ${field}`);
      logAction(`FILL(${field})`, await describeElement(el));
      await el.fill(value, { timeout: 8000 });
      return;
    } catch {
      // try next locator
    }
  }
  throw new Error(`Nao foi possivel preencher: ${field}`);
}

async function clickFirst(locators: Locator[], what: string): Promise<void> {
  for (const locator of locators) {
    const el = locator.first();
    if (!(await el.count())) continue;
    try {
      await clickCentered(el, `CLICK: ${what}`);
      return;
    } catch {
      // try next locator
    }
  }
  throw new Error(`Nao foi possivel clicar em: ${what}`);
}

async function dismissPopupIfPresent(page: Page): Promise<void> {
  const modal = page
    .locator('[role="dialog"]:visible, .modal:visible, .k-window:visible, .ui-dialog:visible')
    .filter({ hasText: /Aten[cç][aã]o/i })
    .first();

  const modalCount = await modal.count().catch(() => 0);
  if (!modalCount) return;

  const closeCandidates = [
    modal.getByRole('button', { name: /OK|Fechar|Close/i }),
    modal.locator('button[aria-label="Close"], button[aria-label="Fechar"], .close, .k-window-action.k-link'),
  ];

  for (const candidate of closeCandidates) {
    if (!(await candidate.count().catch(() => 0))) continue;
    try {
      await candidate.first().click({ timeout: 2000 });
      await page.waitForTimeout(200);
      return;
    } catch {
      // try next candidate
    }
  }

  await page.keyboard.press('Escape').catch(() => {});
}

async function login(page: Page): Promise<void> {
  if (!BASE_URL) {
    throw new Error('Defina env.base_url no request ou configure config-app.json > login.topSaude.url.');
  }
  if (!USUARIO || !SENHA) {
    throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
  }

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await dismissPopupIfPresent(page);

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

  const baseDb = page.getByRole('combobox').first();
  if (REQUEST.env.base_db_preferida && (await baseDb.count().catch(() => 0))) {
    await baseDb.selectOption({ label: REQUEST.env.base_db_preferida }).catch(() => {});
  }
}

async function assertAreaLogada(page: Page): Promise<void> {
  await expect(page).toHaveURL(/AreaLogada/i, { timeout: 15_000 });
  await expect(page.locator('#btn-menu')).toHaveCount(1, { timeout: 15_000 });
}

async function waitForFrameByUrlPart(page: Page, urlPart: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = page.frames().find((frame) => (frame.url() ?? '').toLowerCase().includes(urlPart.toLowerCase()));
    if (found) return found;
    await page.waitForTimeout(250);
  }
  throw new Error(`Frame nao encontrado: url contem '${urlPart}'`);
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
  throw new Error(`Frame nao encontrado para seletor ${selector}`);
}

async function waitForAnyFrameText(page: Page, pattern: RegExp, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const hit = frame.getByText(pattern).first();
        if ((await hit.count().catch(() => 0)) && (await hit.isVisible().catch(() => false))) return;
      } catch {
        // ignore detached frames
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Texto nao encontrado em nenhum frame: ${String(pattern)}`);
}

async function waitForContratoCarregado(page: Page, campoAdministradora: string, timeoutMs: number): Promise<void> {
  const byUrl = waitForFrameByUrlPart(page, REQUEST.telas.contrato.frame_url_hint, timeoutMs).then(() => true).catch(() => false);
  const bySelector = waitForFrameWithSelector(page, campoAdministradora, timeoutMs).then(() => true).catch(() => false);
  const byTelaDetalhe = waitForAnyFrameText(page, /Dados B[aá]sicos|Empresa Contratante|Endere[cç]os Contratante|VCOM ADMINISTRADORA/i, timeoutMs)
    .then(() => true)
    .catch(() => false);

  const result = await Promise.race([byUrl, bySelector, byTelaDetalhe]);
  if (!result) {
    throw new Error('Tela de detalhes do contrato nao foi reconhecida apos clicar em Continuar.');
  }
}

async function findContratoField(page: Page): Promise<Locator> {
  const selectorById = `#${REQUEST.telas.alteracao.campo_contrato_id}`;
  for (const frame of page.frames()) {
    const byId = frame.locator(selectorById).first();
    if (await byId.count()) return byId;
  }

  for (const frame of page.frames()) {
    const byName = frame.locator('input[id*="contrato" i], input[name*="contrato" i]').first();
    if (await byName.count()) return byName;
  }

  throw new Error(`Campo do contrato nao encontrado: ${selectorById}`);
}

async function fillContratoWithFallback(page: Page, contrato: string): Promise<void> {
  const field = await findContratoField(page);
  await clickCentered(field, 'FOCO: contrato');

  try {
    await field.fill(contrato, { timeout: 8000 });
  } catch {
    // ignore and fallback to sequential typing
  }

  const currentValue = await field.inputValue().catch(() => '');
  if (currentValue.replace(/\D+/g, '') !== contrato.replace(/\D+/g, '')) {
    await field.fill('').catch(() => {});
    await field.pressSequentially(contrato, { delay: 90 });
  }

  await field.press('Tab').catch(() => {});
}

async function removeFocusFromContrato(page: Page, contratoField: Locator): Promise<void> {
  await contratoField.press('Tab').catch(() => {});
  await contratoField.evaluate((el) => (el as HTMLElement).blur()).catch(() => {});
  await page.mouse.click(20, 20).catch(() => {});
  await page.waitForTimeout(500);
}

async function getCheckboxState(locator: Locator): Promise<CheckboxState> {
  return await locator.evaluate((el) => {
    const htmlEl = el as HTMLElement;
    const inputEl = el as HTMLInputElement;
    const ariaChecked = htmlEl.getAttribute('aria-checked');
    const ariaDisabled = htmlEl.getAttribute('aria-disabled');
    const className = typeof htmlEl.className === 'string' ? htmlEl.className : '';
    const checked =
      Boolean(inputEl.checked) ||
      ariaChecked === 'true' ||
      /\bchecked\b/i.test(className) ||
      /\bk-checked\b/i.test(className);
    const disabled =
      Boolean(inputEl.disabled) ||
      ariaDisabled === 'true' ||
      htmlEl.hasAttribute('disabled') ||
      /\bdisabled\b/i.test(className) ||
      /\bk-state-disabled\b/i.test(className);
    return { checked, disabled };
  });
}

async function ensureChecked(locator: Locator, fieldName: string): Promise<void> {
  const before = await getCheckboxState(locator);
  if (before.checked) {
    logAction('STATE', `${fieldName} ja estava checked`);
    return;
  }

  await clickCentered(locator, `CLICK: ${fieldName}`);
  await expect
    .poll(async () => (await getCheckboxState(locator)).checked, { timeout: 5_000, message: `${fieldName} deveria ficar checked` })
    .toBe(true);
}

async function ensureUnchecked(locator: Locator, fieldName: string): Promise<void> {
  const before = await getCheckboxState(locator);
  if (!before.checked) {
    logAction('STATE', `${fieldName} ja estava unchecked`);
    return;
  }

  await clickCentered(locator, `UNCLICK: ${fieldName}`);
  await expect
    .poll(async () => (await getCheckboxState(locator)).checked, { timeout: 5_000, message: `${fieldName} deveria ficar unchecked` })
    .toBe(false);
}

async function tryHandleModalOk(page: Page): Promise<boolean> {
  const dialog = page.locator('[role="dialog"]:visible, .modal:visible, .k-window:visible, .ui-dialog:visible').last();
  if (!(await dialog.count().catch(() => 0))) return false;

  const okButton = dialog.getByRole('button', { name: /^OK$/i }).first();
  if (await okButton.count().catch(() => 0)) {
    await clickCentered(okButton, 'CLICK: OK modal');
    return true;
  }

  const genericOk = dialog.locator('button, input[type="button"], input[type="submit"]').filter({ hasText: /OK/i }).first();
  if (await genericOk.count().catch(() => 0)) {
    await clickCentered(genericOk, 'CLICK: OK modal');
    return true;
  }

  return false;
}

async function attemptCheckAdministradora(page: Page, locator: Locator): Promise<{ alertHandled: boolean; alertMessage: string }> {
  const dialogPromise = page
    .waitForEvent('dialog', { timeout: 4_000 })
    .then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return { alertHandled: true, alertMessage: message };
    })
    .catch(() => ({ alertHandled: false, alertMessage: '' }));

  await clickCentered(locator, 'CLICK: ind_administradora');

  const dialogResult = await dialogPromise;
  if (dialogResult.alertHandled) return dialogResult;

  const modalHandled = await tryHandleModalOk(page);
  return { alertHandled: modalHandled, alertMessage: '' };
}

function assertMutualExclusion(adminState: CheckboxState, guardaState: CheckboxState): void {
  expect(
    adminState.checked && guardaState.checked,
    `ind_administradora=${JSON.stringify(adminState)} ind_guarda_chuva=${JSON.stringify(guardaState)}`,
  ).toBe(false);

  if (guardaState.checked) {
    expect(
      adminState.disabled || !adminState.checked,
      `Com ind_guarda_chuva checked, ind_administradora deveria estar disabled ou unchecked. Estados: admin=${JSON.stringify(adminState)} guarda=${JSON.stringify(guardaState)}`,
    ).toBe(true);
  }

  if (adminState.checked) {
    expect(
      guardaState.disabled || !guardaState.checked,
      `Com ind_administradora checked, ind_guarda_chuva deveria estar disabled ou unchecked. Estados: admin=${JSON.stringify(adminState)} guarda=${JSON.stringify(guardaState)}`,
    ).toBe(true);
  }
}

test.setTimeout(15 * 60 * 1000);
test.use({ video: 'on' });

test.describe.serial(`${REQUEST.sac.numero} - ${REQUEST.sac.nome}`, () => {
  for (const contrato of REQUEST.entrada.contratos) {
    test(`Contrato ${contrato}`, async ({ page }) => {
      const menu = new FuncoesAcessoMenu(page, { log: (msg) => logAction('MENU', msg) });
      const campoAdministradora = `#${REQUEST.telas.contrato.campo_administradora_id}`;
      const campoGuardaChuva = `#${REQUEST.telas.contrato.campo_guarda_chuva_id}`;

      await step(page, '1: Logar no TopSaude', async () => {
        await login(page);
        await assertAreaLogada(page);
      });

      await step(page, '2: Acessar Contratos e Beneficiarios > Contratos Pessoa Juridica > Alteracao', async () => {
        await menu.abrirMenu(REQUEST.menu.alteracao.data_modulo_funcao);
        await waitForFrameByUrlPart(page, REQUEST.telas.alteracao.frame_url_hint, 30_000);
      });

      await step(page, `3: Informar o contrato ${contrato}`, async () => {
        await fillContratoWithFallback(page, contrato);
      });

      await step(page, '4: Remover o foco do campo contrato', async () => {
        const contratoField = await findContratoField(page);
        await removeFocusFromContrato(page, contratoField);
        await waitForContratoCarregado(page, campoAdministradora, CONTRACT_LOAD_WAIT_MS);
      }, CONTRACT_LOAD_WAIT_MS + 2_000);

      const frameContrato = await waitForFrameWithSelector(page, campoAdministradora, 15_000);
      const administradora = frameContrato.locator(campoAdministradora).first();
      const guardaChuva = frameContrato.locator(campoGuardaChuva).first();

      await step(page, '5: Clicar no checked ind_guarda_chuva para deixar marcado e depois desmarcar o checked', async () => {
        await expect(guardaChuva).toHaveCount(1);
        await expect(administradora).toHaveCount(1);
        await ensureChecked(guardaChuva, 'ind_guarda_chuva');
        await ensureUnchecked(guardaChuva, 'ind_guarda_chuva');

        const adminAfterUncheck = await getCheckboxState(administradora);
        const guardaAfterUncheck = await getCheckboxState(guardaChuva);
        logAction('STATE', `apos desmarcar ind_guarda_chuva -> ind_administradora=${JSON.stringify(adminAfterUncheck)}`);
        logAction('STATE', `apos desmarcar ind_guarda_chuva -> ind_guarda_chuva=${JSON.stringify(guardaAfterUncheck)}`);
      });

      let alertHandled = false;
      let alertMessage = '';

      await step(page, '6: Clicar no checked ind_administradora e clicar em OK no alert', async () => {
        const adminBefore = await getCheckboxState(administradora);
        if (adminBefore.disabled) {
          logAction('STATE', 'ind_administradora permaneceu disabled antes da tentativa de clique');
          return;
        }

        const result = await attemptCheckAdministradora(page, administradora);
        alertHandled = result.alertHandled;
        alertMessage = result.alertMessage;
        if (alertHandled) {
          logAction('ALERT', alertMessage || 'modal OK tratado');
        }
      });

      await step(page, '7: Verificar se nao e possivel deixar os dois campos checked', async () => {
        const adminState = await getCheckboxState(administradora);
        const guardaState = await getCheckboxState(guardaChuva);

        logAction('STATE', `ind_administradora=${JSON.stringify(adminState)}`);
        logAction('STATE', `ind_guarda_chuva=${JSON.stringify(guardaState)}`);

        assertMutualExclusion(adminState, guardaState);
        expect(
          adminState.checked || guardaState.checked,
          'Apos a tentativa de alteracao, pelo menos um dos campos deveria manter um estado definido de selecao.',
        ).toBe(true);
      });
    });
  }
});
