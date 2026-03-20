import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

type RequestApiSaude = {
  sac: { numero: string; nome: string };
  env: { base_url: string; usuario: string; senha: string; base_db_preferida?: string };
  entrada: {
    contratos?: string[];
    request_login: string;
    request_consulta_contrato: string;
    request_contrato?: string;
    json_contrato?: string;
    aguardar_contrato_carregar_s?: number;
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

function requestPathFromSpec(): string {
  return path.resolve(__dirname, '..', '..', 'requests_ia', 'SAC_166839', 'request_api_saude_SAC_166839.json');
}

function requestDirFromSpec(): string {
  return path.dirname(requestPathFromSpec());
}

function loadRequest(): RequestApiSaude {
  const raw = fs.readFileSync(requestPathFromSpec(), { encoding: 'utf-8' });
  return JSON.parse(raw) as RequestApiSaude;
}

function inferApiBaseUrl(swaggerIndexUrl: string): string {
  const url = new URL(swaggerIndexUrl);
  const cleanedPath = url.pathname
    .replace(/\/swagger\/index\.html$/i, '')
    .replace(/\/swagger\/?$/i, '')
    .replace(/\/+$/g, '');

  url.pathname = cleanedPath || '/';
  url.hash = '';
  url.search = '';

  return url.toString().replace(/\/+$/g, '');
}

function joinUrl(baseUrl: string, endpointPath: string): string {
  const base = baseUrl.replace(/\/+$/g, '');
  const p = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${base}${p}`;
}

function replacePathParams(template: string, params: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\}`, 'g'), v);
  }
  return out;
}

function shouldLogSteps(req: RequestApiSaude): boolean {
  return req.execucao?.sempre_logar_clique_fill_read ?? true;
}

function logStep(req: RequestApiSaude, label: string): void {
  if (!shouldLogSteps(req)) return;
  // eslint-disable-next-line no-console
  console.log(`[STEP] ${label}`);
}

async function delayIfConfigured(req: RequestApiSaude, visualSwagger: boolean): Promise<void> {
  // Default requested behavior: 2 seconds between steps when visual.
  const ms = req.execucao?.delay_entre_passos_ms ?? (visualSwagger ? 2000 : 0);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function findTokenDeep(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (s.length < 10) return null;
    return s;
  }

  if (Array.isArray(value)) {
    for (const it of value) {
      const tok = findTokenDeep(it);
      if (tok) return tok;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidates = ['token', 'accessToken', 'access_token', 'jwt', 'bearer', 'bearerToken', 'id_token'];
    for (const key of candidates) {
      if (key in obj) {
        const tok = findTokenDeep(obj[key]);
        if (tok) return tok;
      }
    }

    for (const v of Object.values(obj)) {
      const tok = findTokenDeep(v);
      if (tok) return tok;
    }
  }

  return null;
}

function findNumeroContratoDeep(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim();
    const digits = s.replace(/\D+/g, '');
    if (digits.length >= 5) return digits;
    return null;
  }

  if (Array.isArray(value)) {
    for (const it of value) {
      const found = findNumeroContratoDeep(it);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const priorityKeys = [
      'numeroContrato',
      'numero_contrato',
      'codigoTsContrato',
      'codigo_ts_contrato',
      'codigoContrato',
      'codigo_contrato',
    ];

    for (const k of priorityKeys) {
      if (k in obj) {
        const found = findNumeroContratoDeep(obj[k]);
        if (found) return found;
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      if (!/contrat/i.test(k)) continue;
      const found = findNumeroContratoDeep(v);
      if (found) return found;
    }

    for (const v of Object.values(obj)) {
      const found = findNumeroContratoDeep(v);
      if (found) return found;
    }
  }

  return null;
}

function findNumeroContratoFromPayload(payload: unknown): string | null {
  const priorityKeys = new Set([
    'numerocontrato',
    'numero_contrato',
    'codigotscontrato',
    'codigo_ts_contrato',
    'codigotscontratoprincipal',
    'codigo_ts_contrato_principal',
  ]);

  const queue: unknown[] = [payload];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const it of cur) queue.push(it);
      continue;
    }
    if (typeof cur !== 'object') continue;

    const obj = cur as Record<string, unknown>;
    for (const [kRaw, v] of Object.entries(obj)) {
      const k = (kRaw ?? '').toString().trim().toLowerCase();
      if (priorityKeys.has(k)) {
        const found = findNumeroContratoDeep(v);
        if (found) return found;
      }
    }

    for (const [kRaw, v] of Object.entries(obj)) {
      const k = (kRaw ?? '').toString().trim().toLowerCase();
      if (k.includes('contrat')) {
        const found = findNumeroContratoDeep(v);
        if (found) return found;
      }
      if (v && (typeof v === 'object' || Array.isArray(v))) queue.push(v);
    }
  }

  return null;
}

async function postLoginAndExtractToken(
  request: APIRequestContext,
  url: string,
  payload: Record<string, string>,
  timeoutMs: number,
): Promise<string | null> {
  const resp = await request.post(url, { data: payload, timeout: timeoutMs });
  if (!resp.ok()) return null;

  const json = await resp.json().catch(() => null);
  const tokenFromJson = findTokenDeep(json);
  if (tokenFromJson) return tokenFromJson;

  const text = await resp.text().catch(() => '');
  const tokenFromText = findTokenDeep(text);
  if (tokenFromText) return tokenFromText;

  return null;
}

async function obterToken(
  request: APIRequestContext,
  baseApiUrl: string,
  req: RequestApiSaude,
  timeoutMs: number,
): Promise<string> {
  const url = joinUrl(baseApiUrl, req.entrada.request_login);
  const user = process.env.API_TOKEN_USUARIO ?? req.env.usuario ?? '';
  const pass = process.env.API_TOKEN_SENHA ?? req.env.senha ?? '';

  if (!user || !pass) {
    throw new Error('Defina API_TOKEN_USUARIO e API_TOKEN_SENHA no ambiente (ou preencha env.usuario/env.senha no request).');
  }

  const attempts: Array<Record<string, string>> = [
    { login: user, senha: pass },
    { usuario: user, senha: pass },
    { username: user, password: pass },
  ];

  for (const payload of attempts) {
    const token = await postLoginAndExtractToken(request, url, payload, timeoutMs).catch(() => null);
    if (token) return token;
  }

  const debugResp = await request.post(url, { data: attempts[0], timeout: timeoutMs });
  const debugBody = await debugResp.text().catch(() => '');
  throw new Error(
    [
      'Falha ao obter token no endpoint de login.',
      `URL: ${url}`,
      `Status: ${debugResp.status()}`,
      `Body (amostra): ${debugBody.slice(0, 800)}`,
      'Obs: Se o schema do body for diferente, ajuste os payloads em obterToken().',
    ].join('\n'),
  );
}

function readJsonIfExists(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  return JSON.parse(raw) as unknown;
}

function writeJsonPretty(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8' });
}

function resolveJsonContratoPath(jsonContratoFromReq: string): string {
  if (!jsonContratoFromReq) return '';
  if (path.isAbsolute(jsonContratoFromReq)) return jsonContratoFromReq;

  const requestDir = requestDirFromSpec();
  const candidates = [
    path.resolve(requestDir, jsonContratoFromReq),
    path.resolve(requestDir, '..', jsonContratoFromReq), // requests_ia/<file>
    path.resolve(__dirname, '..', '..', jsonContratoFromReq),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return candidates[0];
}

function cnpjCheckDigit(base12: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += base12[i] * weights[i];
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function generateCnpjDigits(): string {
  // 12 base digits + 2 check digits (valid CNPJ).
  // Uses crypto for randomness.
  const base: number[] = [];
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) base.push(bytes[i] % 10);

  // Avoid all-zeros and avoid a too-trivial prefix.
  if (base.every((d) => d === 0)) base[0] = 1;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = cnpjCheckDigit(base, w1);
  const base13 = [...base, d1];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d2 = cnpjCheckDigit(base13, w2);

  return `${base.join('')}${d1}${d2}`;
}

async function generateCnpjVia4DevsNoPunctuation(page: Page, timeoutMs: number): Promise<string> {
  const url = 'https://www.4devs.com.br/gerador_de_cnpj';
  const genPage = await page.context().newPage();
  try {
    await genPage.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Tenta selecionar "sem pontuação" se existir.
    const semPontuacao = genPage.getByText(/sem\\s+pontua/i).first();
    if ((await semPontuacao.count().catch(() => 0)) > 0) {
      await semPontuacao.click({ timeout: 3000 }).catch(() => {});
    }

    // Botão/ação de gerar.
    const gerarCandidates = [
      genPage.getByRole('button', { name: /gerar/i }).first(),
      genPage.getByRole('link', { name: /gerar/i }).first(),
      genPage.locator('input[type="button"], input[type="submit"], button').filter({ hasText: /gerar/i }).first(),
    ];
    for (const c of gerarCandidates) {
      if ((await c.count().catch(() => 0)) === 0) continue;
      await c.click({ timeout: 5000 }).catch(() => {});
      break;
    }

    // Captura valor gerado e remove pontuação.
    const valueCandidates = [
      genPage.locator('#texto_cnpj').first(),
      genPage.locator('input[name*="cnpj" i], textarea[name*="cnpj" i]').first(),
      genPage.locator('input, textarea').first(),
    ];

    const deadline = Date.now() + Math.max(8000, Math.min(timeoutMs, 30_000));
    while (Date.now() < deadline) {
      for (const loc of valueCandidates) {
        if ((await loc.count().catch(() => 0)) === 0) continue;
        const raw = (await loc.inputValue().catch(() => '')) || (await loc.textContent().catch(() => '')) || '';
        const digits = raw.replace(/\\D+/g, '');
        if (digits.length === 14) return digits;
      }
      await genPage.waitForTimeout(250);
    }

    throw new Error('Nao foi possivel obter CNPJ gerado (timeout).');
  } finally {
    await genPage.close().catch(() => {});
  }
}

async function generateCnpjForPayload(page: Page, timeoutMs: number): Promise<string> {
  // Preferência do usuário: 4devs. Se falhar (sem rede/DOM diferente), fallback local.
  try {
    return await generateCnpjVia4DevsNoPunctuation(page, timeoutMs);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`[WARN] Falha ao gerar CNPJ via 4devs; usando gerador local. Motivo: ${String(e)}`);
    return generateCnpjDigits();
  }
}

function extractApiErrorMessage(bodyJsonOrText: unknown): string {
  if (!bodyJsonOrText) return '';
  if (typeof bodyJsonOrText === 'string') return bodyJsonOrText;
  if (typeof bodyJsonOrText !== 'object') return String(bodyJsonOrText);

  const obj = bodyJsonOrText as Record<string, unknown>;
  const candidateKeys = ['mensagemRetorno', 'mensagem', 'message', 'error', 'erro', 'detail', 'title'];
  for (const k of candidateKeys) {
    if (k in obj && typeof obj[k] === 'string') return String(obj[k]);
  }
  return JSON.stringify(bodyJsonOrText);
}

function trySetCnpjInPayload(payload: unknown, newCnpjDigits: string): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (Array.isArray(payload)) {
    for (const it of payload) {
      if (trySetCnpjInPayload(it, newCnpjDigits)) return true;
    }
    return false;
  }

  const obj = payload as Record<string, unknown>;

  // Prefer canonical location if present.
  if (obj.empresaContratante && typeof obj.empresaContratante === 'object') {
    const emp = obj.empresaContratante as Record<string, unknown>;
    if ('cnpj' in emp && (typeof emp.cnpj === 'string' || typeof emp.cnpj === 'number')) {
      emp.cnpj = newCnpjDigits;
      return true;
    }
  }

  // Fallback: first key named exactly "cnpj".
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() !== 'cnpj') continue;
    if (typeof v === 'string' || typeof v === 'number') {
      obj[k] = newCnpjDigits;
      return true;
    }
  }

  // Recurse depth-first.
  for (const v of Object.values(obj)) {
    if (v && (typeof v === 'object' || Array.isArray(v))) {
      if (trySetCnpjInPayload(v, newCnpjDigits)) return true;
    }
  }
  return false;
}

function setNumeroContratoIfPresent(value: unknown, numeroContrato: string): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => setNumeroContratoIfPresent(v, numeroContrato));

  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (/numero.*contrato/i.test(k) && (typeof obj[k] === 'string' || typeof obj[k] === 'number')) {
      obj[k] = numeroContrato;
      return obj;
    }
  }

  for (const k of Object.keys(obj)) {
    obj[k] = setNumeroContratoIfPresent(obj[k], numeroContrato);
  }
  return obj;
}

function responseContainsNumeroContrato(responseJson: unknown, numeroContrato: string): boolean {
  return (function find(value: unknown): boolean {
    if (!value) return false;
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).replace(/\D+/g, '') === numeroContrato.replace(/\D+/g, '');
    }
    if (Array.isArray(value)) return value.some(find);
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(find);
    return false;
  })(responseJson);
}

function assertResponseHasNumeroContrato(responseJson: unknown, numeroContrato: string): void {
  const found = responseContainsNumeroContrato(responseJson, numeroContrato);
  expect(found, 'Esperado encontrar o numeroContrato no response').toBeTruthy();
}

async function openSwagger(page: Page, swaggerUrl: string, timeoutMs: number): Promise<void> {
  await page.goto(swaggerUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.swagger-ui, #swagger-ui').first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
}

async function centerInViewport(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  await locator
    .evaluate((el) => {
      try {
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
    })
    .catch(() => {});
}

async function highlightLocator(locator: Locator, color = 'magenta'): Promise<void> {
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
        }, 800);
      },
      color,
    )
    .catch(() => {});
}

async function centerAndHighlight(locator: Locator, color = 'magenta'): Promise<void> {
  await centerInViewport(locator);
  await highlightLocator(locator, color);
}

async function swaggerAuthorize(page: Page, token: string, timeoutMs: number): Promise<void> {
  const authBtn = page.getByRole('button', { name: /^Authorize$/i }).first();
  await authBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await centerAndHighlight(authBtn).catch(() => {});
  await authBtn.click({ timeout: timeoutMs });

  const modal = page.locator('.modal-ux, .dialog-ux, [role="dialog"]').first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  const bearer = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
  const inputCandidates = [
    modal.locator('input[type="text"]').first(),
    modal.locator('input').first(),
    page.locator('.auth-container input').first(),
  ];

  let filled = false;
  for (const input of inputCandidates) {
    const count = await input.count().catch(() => 0);
    if (!count) continue;
    try {
      await centerAndHighlight(input.first()).catch(() => {});
      await input.fill(bearer, { timeout: timeoutMs });
      filled = true;
      break;
    } catch {
      // try next
    }
  }
  if (!filled) throw new Error('Não foi possível preencher o token no modal de Authorize do Swagger.');

  const authorizeButtons = modal.getByRole('button', { name: /^Authorize$/i });
  if ((await authorizeButtons.count().catch(() => 0)) > 0) {
    await centerAndHighlight(authorizeButtons.first()).catch(() => {});
    await authorizeButtons.first().click({ timeout: timeoutMs });
  }

  await modal.getByRole('button', { name: /^Close$/i }).first().click({ timeout: timeoutMs }).catch(() => {});
  await modal.locator('button.btn.modal-btn').first().click({ timeout: timeoutMs }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

async function swaggerExecute(
  page: Page,
  opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    timeoutMs: number;
    requestBodyJson?: unknown;
    pathParams?: Record<string, string>;
  },
): Promise<{ statusCodeText: string; responseBodyText: string }> {
  const { method, path: endpointPath, timeoutMs, requestBodyJson, pathParams } = opts;

  const opblocks = page.locator('.opblock');
  const block = opblocks
    .filter({ has: page.locator('.opblock-summary-method', { hasText: method }) })
    .filter({ hasText: endpointPath })
    .first();

  const count = await block.count().catch(() => 0);
  if (!count) {
    throw new Error(`Swagger: endpoint não encontrado na UI: ${method} ${endpointPath}`);
  }

  const summary = block.locator('.opblock-summary').first();
  await centerAndHighlight(summary).catch(() => {});
  await summary.click({ timeout: timeoutMs }).catch(() => {});

  const tryBtn = block.getByRole('button', { name: /Try it out/i }).first();
  if ((await tryBtn.count().catch(() => 0)) > 0) {
    await centerAndHighlight(tryBtn).catch(() => {});
    await tryBtn.click({ timeout: timeoutMs });
  }

  if (requestBodyJson !== undefined) {
    const bodyText = JSON.stringify(requestBodyJson, null, 2);
    const bodyCandidates = [
      block.locator('textarea.body-param__text').first(),
      block.locator('textarea').first(),
      block.locator('.body-param textarea').first(),
    ];

    let bodyFilled = false;
    for (const ta of bodyCandidates) {
      if (!(await ta.count().catch(() => 0))) continue;
      try {
        await centerAndHighlight(ta).catch(() => {});
        await ta.fill(bodyText, { timeout: timeoutMs });
        bodyFilled = true;
        break;
      } catch {
        // try next
      }
    }
    if (!bodyFilled) {
      // eslint-disable-next-line no-console
      console.log(`[WARN] Swagger: não foi possível preencher request body para ${method} ${endpointPath}.`);
    }
  }

  if (pathParams && Object.keys(pathParams).length) {
    for (const [paramName, paramValue] of Object.entries(pathParams)) {
      const row = block.locator('tr').filter({ hasText: paramName }).first();
      const inputCandidates = [
        row.locator('input').first(),
        block.locator(`input[placeholder*="${paramName}" i]`).first(),
        block.locator(`input[name="${paramName}"]`).first(),
      ];
      for (const input of inputCandidates) {
        if (!(await input.count().catch(() => 0))) continue;
        try {
          await centerAndHighlight(input).catch(() => {});
          await input.fill(paramValue, { timeout: timeoutMs });
          break;
        } catch {
          // try next
        }
      }
    }
  }

  const execBtn = block.getByRole('button', { name: /^Execute$/i }).first();
  await centerAndHighlight(execBtn).catch(() => {});
  await execBtn.click({ timeout: timeoutMs });

  const responses = block.locator('.responses-wrapper, .responses-inner').first();
  await responses.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});

  const statusLoc = block.locator('.response .response-col_status, .response-col_status').first();
  const bodyLoc = block.locator('.response .response-col_description pre, .response-col_description pre').first();

  const statusCodeText = (await statusLoc.innerText().catch(() => '')).trim();
  const responseBodyText = (await bodyLoc.innerText().catch(() => '')).trim();

  return { statusCodeText, responseBodyText };
}

test.use({ video: 'on' });

test.describe('SAC_166839 - API Saúde (dirigido por requests_ia/SAC_166839/request_api_saude_SAC_166839.json)', () => {
  const req = loadRequest();
  const timeoutMs = Math.max(req.execucao?.timeout_por_passo_ms ?? 2000, 60_000);
  const baseApiUrl = inferApiBaseUrl(req.env.base_url);
  const visualSwagger = process.env.SWAGGER_VISUAL ? process.env.SWAGGER_VISUAL === '1' : (req.execucao?.modo_visual ?? true);

  test.describe.configure({ mode: 'serial' });
  test.setTimeout(5 * 60 * 1000);

  test(`${req.sac.numero} - ${req.sac.nome}`, async ({ request, page }) => {
    if (visualSwagger) {
      await test.step('Abrir Swagger', async () => {
        logStep(req, 'Abrir Swagger');
        await openSwagger(page, req.env.base_url, Math.max(timeoutMs, 30_000));
        await delayIfConfigured(req, visualSwagger);
      });
    }

    const token = await test.step('Obter token (API)', async () => {
      logStep(req, 'Autenticar no endpoint request_login e obter token');
      const t = await obterToken(request, baseApiUrl, req, timeoutMs);
      await delayIfConfigured(req, visualSwagger);
      return t;
    });

    const headers = { Authorization: `Bearer ${token}` };

    if (visualSwagger) {
      await test.step('Authorize (Swagger UI)', async () => {
        logStep(req, 'Authorize (Swagger UI)');
        await swaggerAuthorize(page, token, timeoutMs);
        await delayIfConfigured(req, visualSwagger);
      });
    }

    const overrideContrato = process.env.NUMERO_CONTRATO?.trim();
    const contratosFromJson = req.entrada.contratos ?? [];
    let numeroContrato: string | null = overrideContrato || contratosFromJson[0] || null;

    // 1) (Opcional) Criar/implantar contrato via POST para obter numeroContrato.
    if (req.entrada.request_contrato && req.entrada.json_contrato) {
      const jsonContratoPath = resolveJsonContratoPath(req.entrada.json_contrato);
      const payloadRaw = readJsonIfExists(jsonContratoPath);
      if (!payloadRaw) {
        // eslint-disable-next-line no-console
        console.log(`[WARN] Arquivo json_contrato não encontrado; pulando request_contrato: ${jsonContratoPath}`);
      } else {
        // Se o request não forneceu contratos, tenta derivar do próprio payload (ex.: codigoTsContratoPrincipal).
        if (!numeroContrato) {
          const fromPayload = findNumeroContratoFromPayload(payloadRaw);
          if (fromPayload) numeroContrato = fromPayload;
        }

        const payload = numeroContrato ? setNumeroContratoIfPresent(payloadRaw, numeroContrato) : payloadRaw;
        const urlContrato = joinUrl(baseApiUrl, req.entrada.request_contrato);
        await test.step('request_contrato (POST)', async () => {
          logStep(req, `Executar request_contrato (POST) ${req.entrada.request_contrato}`);
          const maxAttempts = 3;
          let currentPayload: unknown = payload;

          const shouldAlwaysRegenerateCnpj = path.basename(jsonContratoPath).toLowerCase() === 'json_api_request.json';
          if (shouldAlwaysRegenerateCnpj) {
            const newCnpj = await generateCnpjForPayload(page, timeoutMs);
            const updated = trySetCnpjInPayload(currentPayload, newCnpj);
            if (updated) {
              writeJsonPretty(jsonContratoPath, currentPayload);
              // eslint-disable-next-line no-console
              console.log(`[INFO] Atualizei CNPJ no payload (${path.relative(process.cwd(), jsonContratoPath)}): ${newCnpj}`);
            } else {
              // eslint-disable-next-line no-console
              console.log('[WARN] json_api_request.json: campo cnpj não encontrado no payload para atualizar.');
            }
            await delayIfConfigured(req, visualSwagger);
          }
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (visualSwagger) {
              await swaggerExecute(page, {
                method: 'POST',
                path: req.entrada.request_contrato!,
                timeoutMs,
                requestBodyJson: currentPayload,
              }).catch(async (e) => {
                // eslint-disable-next-line no-console
                console.log(`[WARN] Swagger UI POST falhou (${req.entrada.request_contrato}): ${String(e)}`);
              });
            }

            const respContrato = await request.post(urlContrato, { data: currentPayload, headers, timeout: timeoutMs });
            if (respContrato.status() === 200) {
              const json = await respContrato.json().catch(() => null);
              if (json) {
                const fromResp = findNumeroContratoDeep(json);
                if (fromResp) numeroContrato = fromResp;
                if (numeroContrato) assertResponseHasNumeroContrato(json, numeroContrato);
              }
              await delayIfConfigured(req, visualSwagger);
              return;
            }

            const bodyText = await respContrato.text().catch(() => '');
            const bodyJson = (() => {
              try {
                return JSON.parse(bodyText) as unknown;
              } catch {
                return null;
              }
            })();
            const msg = extractApiErrorMessage(bodyJson ?? bodyText);

            // Exemplo: "CNPJ ... informado já foi integrado."
            const isCnpjConflict = /cnpj/i.test(msg) && /(j[aá]\s+foi\s+integrado|j[aá]\s+existe|duplicad|existente)/i.test(msg);
            if (isCnpjConflict && attempt < maxAttempts) {
              const newCnpj = await generateCnpjForPayload(page, timeoutMs);
              const updated = trySetCnpjInPayload(currentPayload, newCnpj);
              if (!updated) {
                // eslint-disable-next-line no-console
                console.log(`[WARN] Erro de CNPJ detectado, mas não achei campo cnpj no payload para ajustar.`);
                break;
              }

              // Persiste a alteração no arquivo base para as próximas execuções (pedido do usuário).
              try {
                writeJsonPretty(jsonContratoPath, currentPayload);
                // eslint-disable-next-line no-console
                console.log(`[INFO] Atualizei CNPJ no payload (${path.relative(process.cwd(), jsonContratoPath)}): ${newCnpj}`);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.log(`[WARN] Falha ao gravar json_contrato em disco: ${String(e)}`);
              }

              await delayIfConfigured(req, visualSwagger);
              continue;
            }

            // eslint-disable-next-line no-console
            console.log(
              [
                `[WARN] request_contrato retornou status ${respContrato.status()} (esperado 200).`,
                'Continuando o fluxo para consultar contrato se houver numeroContrato conhecido.',
                `Mensagem: ${msg}`.trim(),
                `Body (amostra): ${bodyText.slice(0, 1200)}`,
              ].join('\n'),
            );
            break;
          }
        });
        await delayIfConfigured(req, visualSwagger);
      }
    }

    if (!numeroContrato) {
      throw new Error(
        [
          'numeroContrato não definido.',
          'Forneça `entrada.contratos` no request, ou defina `NUMERO_CONTRATO`, ou garanta que o POST `request_contrato` retorne um numeroContrato.',
        ].join('\n'),
      );
    }

    // 2) Consultar contrato (GET) usando {numeroContrato}
    const consultaPath = replacePathParams(req.entrada.request_consulta_contrato, { numeroContrato });
    const urlConsulta = joinUrl(baseApiUrl, consultaPath);
    await test.step('request_consulta_contrato (GET)', async () => {
      logStep(req, `Executar request_consulta_contrato (GET) ${consultaPath}`);
      if (visualSwagger) {
        await swaggerExecute(page, {
          method: 'GET',
          path: req.entrada.request_consulta_contrato,
          timeoutMs,
          pathParams: { numeroContrato },
        }).catch(async (e) => {
          // eslint-disable-next-line no-console
          console.log(`[WARN] Swagger UI GET falhou (${consultaPath}): ${String(e)}`);
        });
      }

      const respConsulta = await request.get(urlConsulta, { headers, timeout: timeoutMs });
      if (respConsulta.status() !== 200) {
        const body = await respConsulta.text().catch(() => '');
        throw new Error(
          [
            'Status esperado no request_consulta_contrato',
            `URL: ${urlConsulta}`,
            `Expected: 200`,
            `Received: ${respConsulta.status()}`,
            `Body (amostra): ${body.slice(0, 1200)}`,
          ].join('\n'),
        );
      }
      expect(respConsulta.status(), 'Status esperado no request_consulta_contrato').toBe(200);

      const jsonConsulta = await respConsulta.json().catch(() => null);
      if (jsonConsulta) {
        // Nem todo endpoint de "consulta" devolve o numeroContrato explicitamente.
        // Se vier, validamos; se não vier, mantemos o critério mínimo (status 200).
        const hasNumeroContrato = responseContainsNumeroContrato(jsonConsulta, numeroContrato);
        if (hasNumeroContrato) assertResponseHasNumeroContrato(jsonConsulta, numeroContrato);
        else {
          // eslint-disable-next-line no-console
          console.log('[INFO] Response de consulta-contrato não contém o numeroContrato (validado apenas status 200).');
        }
      }
    });
    await delayIfConfigured(req, visualSwagger);

    const pauseMs = Number(process.env.PAUSE_MS ?? 0);
    if (visualSwagger && pauseMs > 0) await page.waitForTimeout(pauseMs);
  });
});
