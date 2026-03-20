const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function transpileFile(inputPath, outPath) {
  const source = fs.readFileSync(inputPath, { encoding: 'utf-8' });
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      strict: false,
      skipLibCheck: true,
    },
    fileName: inputPath,
  });
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, result.outputText, { encoding: 'utf-8' });
}

function resolveDefaultOutput(parametrosPath, parametros) {
  const baseDir = path.dirname(parametrosPath);
  const sacNumero = parametros?.sac?.numero || 'SAC_XXXXXX';
  return path.resolve(baseDir, `request_${sacNumero}`);
}

function main() {
  const args = process.argv.slice(2);
  let parametrosPath = '';
  let outputPathArg = '';
  let manterParametros = false;

  for (const arg of args) {
    if (arg === '--manter-parametros' || arg === '--keep-parametros') {
      manterParametros = true;
      continue;
    }
    if (!parametrosPath) {
      parametrosPath = arg;
      continue;
    }
    if (!outputPathArg) {
      outputPathArg = arg;
    }
  }

  if (!parametrosPath) {
    // eslint-disable-next-line no-console
    console.error('Uso: node scripts/gerar_request_from_parametros.js <parametros.json> [saida] [--manter-parametros]');
    process.exit(1);
  }

  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.resolve(repoRoot, 'out', 'tools', 'tests', 'src');
  const funcoesSrc = path.resolve(repoRoot, 'tests', 'src', 'funcoes_elementos_html.ts');
  const builderSrc = path.resolve(repoRoot, 'tests', 'src', 'solicitacao_request_builder.ts');

  const funcoesOut = path.resolve(outDir, 'funcoes_elementos_html.js');
  const builderOut = path.resolve(outDir, 'solicitacao_request_builder.js');

  transpileFile(funcoesSrc, funcoesOut);
  transpileFile(builderSrc, builderOut);

  // eslint-disable-next-line global-require
  const { SolicitacaoRequestBuilder } = require(builderOut);

  const builder = new SolicitacaoRequestBuilder();
  const parametros = builder.CarregarParametrosDeArquivo(parametrosPath);
  const request = builder.ObterRequestSolicitacao(parametros);

  if (!manterParametros && request && typeof request === 'object') {
    delete request.parametros_entrada;
  }

  const outputPath = outputPathArg ? path.resolve(outputPathArg) : resolveDefaultOutput(parametrosPath, parametros);
  const json = JSON.stringify(request, null, 2);
  fs.writeFileSync(outputPath, json, { encoding: 'utf-8' });

  // eslint-disable-next-line no-console
  console.log(`Request gerado em: ${outputPath}`);
}

main();
