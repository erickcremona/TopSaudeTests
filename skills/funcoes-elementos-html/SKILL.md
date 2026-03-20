---
name: funcoes-elementos-html
description: Create or update the FuncoesElementosHtml class and its indexed HTML action mapping for Playwright tests in this repo. Use when users ask to add actions, register elements, or standardize HTML element interactions with action indexes or element indexes.
---

# Funcoes Elementos HTML

## Overview

Provide a single class for indexed HTML element actions and keep the action index mapping consistent.

## Workflow

1. Edit `tests/src/funcoes_elementos_html.ts` only.
2. Preserve the `AcaoHtmlIndex` enum and the `AcaoHtmlKey` union and keep them in sync.
3. Add new actions by:
   - Extending `AcaoHtmlKey`
   - Adding a new enum value in `AcaoHtmlIndex`
   - Handling the action in `executarAcao` and `acaoIndexToKey`
4. Keep the alias `PrencherObjetoHtml` to maintain compatibility.
5. Add a short, single-line comment in each function describing what it does.
6. Keep the action execution centralized in `executarAcao` and resolve locators through `resolveLocator`.
7. When integrating into tests, instantiate `FuncoesElementosHtml` near other helpers, and prefer `executarAcaoPorIndice` with a local `elementos` list. Keep a small fallback path (existing helpers) when an element is not found.

## Notes

- Prefer indexed access (`executarAcaoPorIndice`) when the caller has only numeric references.
- Resolve elements by selector when provided, otherwise by id/name/test ids across frames.
- Example integration already exists in `tests/SAC_166839/sac-166839-vcom.spec.ts` for `ind_administradora`, `nome_grupo_empresa`, and `idAcaoLimpar`.
