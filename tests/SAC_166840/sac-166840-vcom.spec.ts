import { test, type Frame, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
  const repoRoot = path.resolve(__dirname, '..', '..');
  const sacNumero = 'SAC_166839';
  const candidates = [
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}.json`),
    path.resolve(repoRoot, 'requests_ia', sacNumero, `request_${sacNumero}`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}.json`),
    path.resolve(repoRoot, 'requests_ia', `request_${sacNumero}`),
  ];
  const requestPath = candidates.find((p) => fs.existsSync(p));
  if (!requestPath) {
    throw new Error(`Request nao encontrado. Tentativas:\n${candidates.map((c) => `- ${c}`).join('\n')}`);
  }
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

async function login(page: Page, req: SacRequest): Promise<void> {
  const usuario = process.env.TOPSAUDE_USUARIO ?? req.env.usuario ?? '';
  const senha = process.env.TOPSAUDE_SENHA ?? req.env.senha ?? '';

  if (!usuario || !senha) {
    throw new Error('Defina TOPSAUDE_USUARIO e TOPSAUDE_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
  }

  await page.goto(req.env.base_url, { waitUntil: 'domcontentloaded' });

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

  await clickFirst(
    [page.getByRole('button', { name: /Entrar|Acessar|Login/i }), page.locator('input[type="submit"], button[type="submit"]')],
    'Entrar',
  );

  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);

  if (req.env.base_db_preferida) {
    // Best-effort: se existir seletor de "Base" / "DB", seleciona.
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

async function clickMenuByDataModuloFuncao(page: Page, dataModuloFuncao: string): Promise<void> {
  const selector = `[data-modulo-funcao="${dataModuloFuncao}"]`;
  const candidates: Locator[] = [page.locator(selector)];
  for (const frame of allFrames(page)) candidates.push(frame.locator(selector));
  await clickFirst(candidates, `menu ${dataModuloFuncao}`);
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

async function closeKendoWindow(page: Page, selector: string): Promise<void> {
  const close = page.locator(`${selector}:visible`).last();
  if (await close.count()) await close.click({ timeout: 8000 }).catch(() => {});
}

async function readDigitsFromInput(frame: Frame, id: string): Promise<string> {
  const input = frame.locator(`#${id}`);
  const value = (await input.inputValue().catch(() => '')) ?? '';
  return value.replace(/\D+/g, '');
}

test.use({ video: 'on' });

test.describe('SAC_166839 (VCOM) - dirigido por requests_ia/request_SAC_166839', () => {
  const req = loadRequest();
  const perStepTimeout = req.execucao?.timeout_por_passo_ms ?? 30_000;
  const contractLoadWaitMs = (req.entrada?.aguardar_contrato_carregar_s ?? 10) * 1000;

  test.describe.configure({ mode: 'serial' });
  test.setTimeout(15 * 60 * 1000);

  for (const contrato of req.entrada.contratos) {
    test(`${req.sac.numero} - ${req.sac.nome} - contrato ${contrato}`, async ({ page }) => {
      await login(page, req);
      await delayIfConfigured(req);

      // Menu: Alteração
      await clickMenuByDataModuloFuncao(page, req.menu.alteracao.data_modulo_funcao);
      await delayIfConfigured(req);

      const frameAlteracao = await waitForFrameUrlHint(page, req.telas.alteracao.frame_url_hint, perStepTimeout);
      const campoContrato = frameAlteracao.locator(`#${req.telas.alteracao.campo_contrato_id}`).first();
      await campoContrato.waitFor({ state: 'visible', timeout: perStepTimeout });
      await campoContrato.fill(contrato, { timeout: perStepTimeout });
      await campoContrato.press('Tab').catch(() => {});
      await delayIfConfigured(req);

      // Aguarda carregar contrato
      const frameContrato = await waitForFrameUrlHint(page, req.telas.contrato.frame_url_hint, perStepTimeout);
      await frameContrato.waitForLoadState('domcontentloaded', { timeout: perStepTimeout }).catch(() => {});
      await page.waitForTimeout(contractLoadWaitMs);

      // Scroll fim, mostra campo (best-effort) e lê grupo (digits)
      await frameContrato.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      if (req.telas.contrato.somente_mostrar_campo_id) {
        await frameContrato.locator(`#${req.telas.contrato.somente_mostrar_campo_id}`).scrollIntoViewIfNeeded().catch(() => {});
      }
      const grupoDigits = await readDigitsFromInput(frameContrato, req.telas.contrato.campo_grupo_id);
      await delayIfConfigured(req);

      // Scroll início, limpar e fechar janela
      await frameContrato.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await clickFirst(
        [frameContrato.locator(`#${req.telas.contrato.botao_limpar_id}`), frameContrato.locator(`input#${req.telas.contrato.botao_limpar_id}`)],
        `Limpar (${req.telas.contrato.botao_limpar_id})`,
      );
      await delayIfConfigured(req);
      await closeKendoWindow(page, req.telas.contrato.fechar_janela_selector);
      await delayIfConfigured(req);

      const shouldSkip =
        (req.regras?.se_grupo_vazio_pular_registra_grupo_contrato ?? true) && (!grupoDigits || grupoDigits.trim() === '');
      if (shouldSkip) return;

      // Menu: Registra Grupo Contrato
      await clickMenuByDataModuloFuncao(page, req.menu.registra_grupo_contrato.data_modulo_funcao);
      await delayIfConfigured(req);

      const frameRegistra = await waitForFrameUrlHint(page, req.telas.registra_grupo_contrato.frame_url_hint, perStepTimeout);
      const campoGrupo = frameRegistra.locator(`#${req.telas.registra_grupo_contrato.campo_grupo_id}`).first();
      await campoGrupo.waitFor({ state: 'visible', timeout: perStepTimeout });

      if (req.regras?.nunca_informar_numero_do_contrato_no_campo_de_grupo && grupoDigits === contrato) {
        throw new Error(`Regra violada: grupoDigits (${grupoDigits}) igual ao contrato (${contrato})`);
      }

      await campoGrupo.fill(grupoDigits, { timeout: perStepTimeout });
      await delayIfConfigured(req);

      await clickFirst(
        [
          frameRegistra.getByRole('button', { name: new RegExp(req.telas.registra_grupo_contrato.acao_continuar, 'i') }),
          frameRegistra.locator(`input[type="button"][value="${req.telas.registra_grupo_contrato.acao_continuar}"]`),
          frameRegistra.locator(`input[type="submit"][value="${req.telas.registra_grupo_contrato.acao_continuar}"]`),
          frameRegistra.getByText(new RegExp(`^${req.telas.registra_grupo_contrato.acao_continuar}$`, 'i')),
        ],
        req.telas.registra_grupo_contrato.acao_continuar,
      );

      // Critério de sucesso (best-effort): aguarda a tela estabilizar e fecha.
      await page.waitForTimeout(1500);
      await closeKendoWindow(page, req.telas.contrato.fechar_janela_selector);
    });
  }
});
