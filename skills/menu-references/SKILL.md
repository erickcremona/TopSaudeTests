---
name: menu-references
description: Extract and generate menu references/locators from `menu-identificadores/menu-identificadores.json` (fields like `locatorSuggested`, `attrs.id`, `attrs.data-modulo-funcao`, `attrs.data-href`). Use when you need to list, dedupe, export, or regenerate menu selectors for Playwright tests or for documentation/mapping of the application's menu.
---

# Menu References (menu-identificadores.json)

Use the bundled script to extract menu references into a machine-friendly format (JSON/CSV) or generate a TypeScript mapping for Playwright tests.

## Generate `menu-identificadores.json` (Playwright)

If `menu-identificadores/menu-identificadores.json` is missing or stale, regenerate it by running:

```powershell
npx playwright test "menu-identificadores/menu-identificadores.spec.ts" --reporter=line --output "menu-identificadores/pw-results-menu"
```

Outputs (written by the spec):

- `menu-identificadores/menu-identificadores.json`
- `menu-identificadores/MENU_IDENTIFICADORES.md`

Config lives in `menu-identificadores/menu-identificadores.spec.ts` (e.g. `BASE_URL`, credentials, and `TIMEOUT_MS`).

## Generate References

Run from the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File skills/menu-references/scripts/extract-menu-references.ps1
```

Common variants:

```powershell
# Only anchors that look like menu items (data-tipo-link=link|menu or class contains item-menu)
powershell -NoProfile -ExecutionPolicy Bypass -File skills/menu-references/scripts/extract-menu-references.ps1 -OnlyMenu

# Export to JSON
powershell -NoProfile -ExecutionPolicy Bypass -File skills/menu-references/scripts/extract-menu-references.ps1 -OnlyMenu -Format json -OutputPath out/menu-references.json

# Export to CSV (good for Excel)
powershell -NoProfile -ExecutionPolicy Bypass -File skills/menu-references/scripts/extract-menu-references.ps1 -OnlyMenu -Format csv -OutputPath out/menu-references.csv

# Generate a TS mapping (key -> locatorSuggested)
powershell -NoProfile -ExecutionPolicy Bypass -File skills/menu-references/scripts/extract-menu-references.ps1 -OnlyMenu -Format ts -OutputPath menu-identificadores/menuReferences.generated.ts
```

## How To Use In Tests

If you generated `menu-identificadores/menuReferences.generated.ts`, import it from Playwright tests and use the `locatorSuggested` string as the canonical selector (or use the `data-modulo-funcao` attribute directly if your codebase prefers data-attributes).
If you prefer menu navigation by `path/pathText` (expand ancestors then click leaf), use the reusable helper class in `tests/src/funcoes_acesso_menu.ts`.

## Notes

- Prefer `attrs.data-modulo-funcao` as the stable identifier (when present).
- Even when you only have `data-modulo-funcao`, prefer expanding ancestors using the full `path/pathText` from `menu-identificadores.json` and log the breadcrumb (show each menu level) before opening the leaf.
- Use `attrs.id` for buttons/toolbar items when `data-modulo-funcao` is absent.
- Keep raw extraction output (JSON/CSV) when you need auditing; use TS output when you need fast authoring in tests.

## Agent

If you are writing SAC scenario specs (TopSaude) from `requests_ia/request_top_saude`, use the agent definition in `skills/menu-references/agents/top-saude-sac-tests.yaml` as the authoring guide (menu-driven navigation, frame-safe actions, and visual click logging).
