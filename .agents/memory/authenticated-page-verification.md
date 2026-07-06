---
name: Verifying auth-protected pages headlessly
description: How to visually verify login-gated frontend pages (screenshots/print/PDF) in this environment
---

The screenshot tool has no cookies, so auth-guarded pages always render the login screen. Working recipe:

1. Create a throwaway tenant via the public `POST /api/farms/register`, then log in — the login response includes a bearer `token` (session-id bridge) usable as `Authorization: Bearer <token>` for seeding data via curl (curl cookie jars don't retain the session cookie).
2. `browser-use` CLI is NOT installed and Playwright's downloaded Chromium doesn't run on NixOS. Instead: `installSystemDependencies(["chromium"])` (nix build works) + `pnpm add -D -w puppeteer-core`, launch with `executablePath` = `which chromium` and `--no-sandbox`.
3. Run the script from inside the workspace (not /tmp) so node resolves workspace node_modules.
4. Avoid `waitUntil: "networkidle0"` against the Vite dev server — the HMR websocket keeps it from ever settling; use `domcontentloaded` + `waitForSelector`.
5. Print verification: `page.emulateMediaType("print")` for a screenshot, `page.pdf({ preferCSSPageSize: true })` to confirm `@page` size/orientation (792x612pt = Letter landscape).
6. Clean up after: remove puppeteer-core, uninstall the chromium system dep, `git checkout pnpm-lock.yaml` (add/remove cycles restructure it), and delete the throwaway tenant rows via SQL. An empty `replit.nix` may remain — it is platform-owned and cannot be deleted directly; leave it.

**Why:** repeated need to visually verify tenant-scoped, login-gated pages (reports, print layouts) with no test-login backdoor.
**How to apply:** any time a task needs a screenshot or print/PDF check of a page behind the AuthGuard.
