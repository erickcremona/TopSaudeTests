---
name: success-guided-spec
description: Escrever specs Playwright mais assertivas usando como referência specs que já passaram (registradas em tests/src/success_base/success_base.json).
---

# Success-Guided Spec Authoring

## Objetivo

Diminuir retrabalho reutilizando padrões já validados por execução real.

Este repo registra automaticamente o código de qualquer teste que **passa** em:

- `tests/src/success_base/success_base.json`

O registro acontece via reporter configurado no Playwright (`tests/src/success_base/reporter.ts`).

## Como usar

1) Descubra specs parecidas com o cenário atual:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File skills/success-guided-spec/scripts/suggest-success-spec.ps1 -Query "SAC_166839 api swagger token contrato"
```

2) Use 1–3 resultados como base para implementar a spec nova/ajustada.

3) Rode o teste. Quando passar, o success base é atualizado automaticamente (não precisa fazer nada manual).

4) Em specs UI/SAC, preserve ou adicione a copia do `video.webm` de sucesso para `tests/{SAC}/videos/{valor}.webm`.

## Dicas de query

- Para API: `swagger`, `endpoint`, `token`, `status 200`, paths `/api/...`
- Para UI: `data-modulo-funcao`, `frame_url_hint`, `kendo`, ids de campos/botões
- Para SAC: `SAC_166839`, nome do cenário, contratos, módulos
