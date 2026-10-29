# CLAUDE.md

FreeLLMAPI: OpenAI-compatible gateway that routes requests across free LLM
providers with fallback chains. Server in `server/`, dashboard in `client/`,
desktop app in `desktop/`.

- The user writes in Turkish; reply in Turkish.
- Start with `docs/freellmapi.md` (Turkish quick-start: install, dashboard
  setup, API calls, agent setup, FAQ) when helping the user run or use the
  gateway.
- `docs/en/` is the authoritative documentation; `docs/en/README.md` is the
  index. When it and `docs/freellmapi.md` disagree, follow `docs/en/` and
  update `docs/freellmapi.md` to match.
- The user is not technical: explain in plain Turkish, avoid jargon, and give
  click-by-click steps for anything they must do themselves.

## Design and tooling

Skills vendored under `.claude/skills/` (each folder keeps its upstream
license; update by re-copying from upstream, there is no installer):

- `frontend-design` (Anthropic): visual direction for new or reshaped UI.
- `impeccable`: audit, critique and polish of existing UI. Its
  `scripts/impeccable` launcher downloads a checksum-pinned engine binary on
  first use; its design-detector hooks are deliberately not registered.
- `design-taste-frontend` (taste-skill): websites and landing pages. Working
  files go to `.taste-skill/` (gitignored); needs Chrome (`CHROME_PATH`).
- Emil Kowalski's skills (`emil-design-eng`, `animate`, `review-animations`,
  …): motion and interface detail.
- `logo-design`: logos and brand marks. `assets/library/svg/` holds real
  brands' logos as reference only; see its `TRADEMARKS.md`.

The dashboard (`client/`) is an Operate surface: Geist, `rounded-3xl` cards,
`PageHeader`, the shared `ui/` components and its own tokens. Refine within
that system rather than restyling it, and keep every string in the i18n
catalogs (`client/src/i18n/locales/`, 60 locales, checked by
`npm run check:i18n`).

MCP servers in `.mcp.json`:

- `figma` and `prompts.chat` (Awesome ChatGPT Prompts): remote; cloud
  sessions need `mcp.figma.com` and `prompts.chat` in the environment's
  allowed domains. Figma asks for an OAuth sign-in on first use.
- `headroom`: needs the `headroom` CLI (`pip install "headroom-ai[all]"`);
  telemetry is turned off.
- `omniroute`: OmniRoute's MCP tools; needs OmniRoute running locally on
  port 20128 (`npm install -g omniroute && omniroute`).

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.copilot/skills/gstack" "$HOME/.gemini/antigravity-cli/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback).
Use the resolved install path above for gstack file paths
(default: ~/.claude/skills/gstack).

The Skill gate in .claude/settings.json runs .claude/hooks/check-gstack.cjs with
Node.js and blocks when it cannot run. If a skill is blocked with "node: not
found", tell the user to install Node.js (https://nodejs.org); if it is blocked
with "Cannot find module ... check-gstack.cjs", the hook file is missing from
this checkout. Do not work around either block.
