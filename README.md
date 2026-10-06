# Tanloom Engine

> 🌐 **English** · [简体中文](README.zh-Hans.md)

**Draw it, or write it.** Blocks and code are not two implementations of the same idea — they are two
projections of one project file. An Electron desktop app for 2D games.

```
    Block editor            Code editor             Scene editor
  (scratch-blocks)      (highlighted TS)      (viewport + hierarchy)
        \                      |                       /
         \                     |                      /
          ──────────  one IR, the single source of truth  ──────────
                              |
                       project file (.tle)
```

Everything you change anywhere goes into the IR first; every view re-projects from it. Edit blocks and the
TypeScript is rewritten; edit the TypeScript, press <kbd>Ctrl</kbd>+<kbd>S</kbd>, and the blocks are rebuilt.
Anything the parser does not recognize is kept verbatim as a "code block", so nothing is ever lost.

**Interface languages:** English · 简体中文 · 繁體中文 (see [Language](#language)).

---

## Quick start

```bash
git clone git@github.com:SilvusEvans/tanloom-engine.git
cd tanloom-engine
npm install          # scratch-blocks + electron
npm start            # launch the editor
```

| Command | What it does |
|---|---|
| `npm start` / `npm run dev` | Launch the editor (dev adds DevTools) |
| `npm test` | Core self-test + i18n check (pure Node, seconds) |
| `npm run i18n` | i18n only: missing translations, placeholder parity, dropdown coverage |
| `npm run audit` | Per-block round trip: IR → code → IR for every block × every option value |
| `npm run smoke` | 53 assertions in a real Electron window, zero console errors, saves screenshots |
| `npm run ui` | 11 UI flow tests (click real buttons, fill real forms, real right-click) |
| `npm run bubble` | 21 value-bubble checks (official look, positioning, click-to-evaluate) |
| `npm run player` | 18 checks on the separate player window (cross-process, end to end) |
| `npm run theme` | 38 appearance checks (theme / accent / fonts / sizes / share code) |
| `npm run gallery` | Render every block once into a single overview PNG |

Requirements: Node 22+, a desktop environment. The editor loads its own resources over a custom
`tanloom://` protocol handled by the main process — no local HTTP server, so no ports, no proxies, no timeouts.

---

## Core mechanisms

### 1. One IR, the single source of truth

The IR is plain JSON: entities, scripts (hat + body), variables, lists, channels, macros, scenes.
Blocks are an editing surface, the `.ts` files are a projection, and the runtime executes the IR directly
(no compiling to JS in the middle). Because exactly one place holds the truth, "the code and the blocks
disagree" is not a state the app can be in.

### 2. A per-frame broadcast bus (borrowed from Godot)

Each frame broadcasts, in order:

```
frame_start → input → physics_update → update → late_update → render → frame_end
```

Scripts subscribe with hat blocks. Keys, collisions, clicks and custom events all travel the same bus —
one dispatch path, not five. `physics_update` may run several times per frame (fixed timestep), the others once.

### 3. Blocks are Scratch's own renderer

The block view uses the official `scratch-blocks` (2.1.27), so block shapes, colours, drag snapping and
insertion markers behave exactly as they do in Scratch. Native Scratch blocks are used wherever one exists
(motion, looks, control, operators, variables, lists, sensing, sound); only engine-specific concepts
(frame phases, entity coordinates, physics, broadcasts with arguments, game helpers) register custom blocks.

### 4. A block language that can grow

Right-click a stack → **compose new block**: pick parameters, write the TypeScript body, and it becomes a real
block. Composite blocks can be used inside further composites, and filed into built-in categories or brand-new
ones. The palette is generated from the definition table — nothing is hand-maintained.

### 5. Blocks and code stay in sync — verified, not hoped

`npm run audit` walks **every block × every dropdown value** (96 blocks, 162 variants today) through a real
round trip: minimal IR → generated `.ts` → parsed back → compared **node for node**, not just by type.
It catches the subtle ones: "set vx to" coming back as "set x to", a whole dropdown family collapsing into
one block, `++` in a generated `for` loop losing the loop.

### 6. Click a block to run it

Clicking a statement block runs its whole stack (starting the project first if it is not running); clicking a
round or hexagonal block evaluates it and pops a value bubble. Label text such as "say" or "seconds" does not
swallow the click — only genuinely editable fields do.

### 7. Keyboard, fullscreen, player window

Real keys are wired to the runtime (<kbd>F5</kbd> run/stop, <kbd>F6</kbd> run in a separate window,
<kbd>F11</kbd> fullscreen, <kbd>Esc</kbd> leave). In fullscreen the keyboard belongs to the game: arrow keys
do not scroll and space does not press buttons. The player window runs a second runtime in its own process and
hot-reloads when you edit blocks in the editor.

### 8. Appearance

6 themes (plus follow-system), an accent colour (8 presets or any colour from the picker, with the label colour
chosen automatically by brightness), and separate fonts and sizes for the interface and for code — compiled
into one `:root` variable block with a live preview. Appearance is stored per machine and **never written into
the project file**: the same game can be skinned differently on every machine. A share code passes a whole look
on to someone else.

---

## Language

Three interface languages — **English (default and fallback)** · 简体中文 · 繁體中文 — under
**◐ Appearance → Interface language**. Everything is covered: panels, dialogs, help, the text on custom blocks,
and the text of the native Scratch blocks (scratch-blocks ships 79 locales; we point
`Blockly.ScratchMsgs.setLocale` at the matching one).

Three decisions worth knowing:

| Decision | Why |
|---|---|
| **English is the default and the fallback** | A missing translation falls back to English, not to Chinese — an open-source project's default reader is an English reader |
| **Dictionary keys are the Simplified Chinese source text** | No invented key names to drift out of sync with the string in the UI; a missing translation is caught by `npm run i18n` |
| **Switching language reloads the window** | Same as Scratch. Block text comes from three places (the custom block table, the built-in block locale, every panel's DOM); rebuilding once cannot miss one |

Values do **not** change with the language: dropdown values (`space`, `x`, `frame_start`), variable names,
broadcast names and the sample project's entity and variable names all stay as they are, so the same `.tle`
generates identical code in every language. Only display names move.

`npm run i18n` guards the whole thing (pure Node, seconds):

- **nothing untranslated** — every Chinese string in an interface source file is either wrapped in `t()` and
  present in the dictionary, or on the "this is data" allow-list. The nastiest bug class is *present in the
  dictionary but never wrapped* — it shows Chinese in the English UI, and this assertion exists to catch it;
- **dictionaries complete** — 439 keys × 2 languages (Simplified Chinese *is* the key); one missing and it fails;
- **placeholders match** — the number of `{x}` / `%1` markers in a key and in each translation must agree;
- **dropdowns covered** — every value of every dropdown list resolves in `i18n-options.js`;
- **help dialog present in all three languages**.

Files: `core/i18n.js` (the engine: detection, `t()`, `opt()`, `setLang()`), `i18n-ui.js`, `i18n-shell.js`,
`i18n-blocks.js`, `i18n-msg.js`, `i18n-tpl.js` (messages with slots), `i18n-options.js` (dropdown labels keyed
by value id), `i18n-help.js` (the help text, per language).

---

## Layout

```
tanloom-engine/
├── main.cjs                  Electron main process (windows + menu)
├── ipc.cjs                   IPC: player window / fullscreen / open / save / export
├── app-protocol.cjs          the tanloom:// custom protocol
├── preload.cjs               contextBridge
├── src/
│   ├── core/                 IR, block definitions, code generation, parsing, store, i18n
│   ├── blocks/scratch/       block ↔ XML ↔ IR mapping, renderer theme, palette, workspace
│   ├── runtime/              the VM: frame loop, broadcast bus, physics, clones, assets
│   ├── scene/                viewport (stage, gizmos, picking)
│   ├── code/                 code editor with highlighting
│   ├── ui/                   panels, dialogs
│   └── styles/               design tokens and layout
└── tools/                    launcher, self-tests, smoke test, block gallery, probes
```

---

## Testing

Seven suites, each with a different job — and each one exists because something got past the others.

| Suite | Items | Why it is separate |
|---|---|---|
| `npm test` | 92 + 5 | Pure Node, seconds. Definition-table self-checks, every block round trip, i18n |
| `npm run audit` | 162 | Every block × every dropdown value, node for node — the thorough version of the same idea |
| `npm run smoke` | 53 | Real Electron, zero console errors, screenshots. Catches "works in Node, breaks in the renderer" |
| `npm run ui` | 11 | Real clicks, real forms, real right-click — the flows a user actually performs |
| `npm run bubble` | 21 | The value bubble: official colours, arrow, positioning, and that clicking label text still evaluates |
| `npm run player` | 18 | Cross-process: opens the player window and reads its internal state from the test |
| `npm run theme` | 38 | Asserts **computed styles**, not "we called the setter" |

Two habits that came out of real bugs:

- **Assert on the computed value, not on the call.** Theme changes, font sizes and dropdown labels are checked
  with `getComputedStyle`, because "the variable was written" and "the variable won" are different facts.
- **Screenshots lie about timing.** `capturePage()` often returns the previous frame; the probes take three and
  keep the last. One misleading screenshot nearly "proved" a theme had not applied, when the pixel samples said
  otherwise.

---

## Current scope and known gaps

Solid: single-IR editing, the frame/broadcast runtime, physics and collisions, clones, the block and code views,
composite blocks and categories, appearance, three interface languages, project save/open and code export.

Known gaps, stated plainly:

- the runtime API reference comment written into exported `.ts` files (`_runtime.ts`) is still Chinese;
- the sample project's entity, variable and broadcast names stay Chinese by design — they are identifiers;
- the block view's selection glow is not drawn: `theme.js` never sets the glow component styles, so
  `.blocklyPathSelected { filter: var(--blocklySelectedGlowFilter) }` resolves to an empty string;
- 3D viewport, an asset import pipeline, a plugin system, multiplayer and a block marketplace are not started.

The architecture direction for unifying dispatch is written up in
[`docs/design-unify-bus-and-clones.md`](docs/design-unify-bus-and-clones.md) (design only, not implemented).

---

## Notes for offline / restricted machines

This was built on a machine that cannot reach the npm registry or `api.github.com` (SSH to
`ssh.github.com:443` is the only way in). Two consequences are visible in the repo: the `tanloom://` protocol
exists so resources load without a local HTTP server — the HTTP-server approach had already been broken by
proxy settings and firewalls — and the probes pin Electron's `userData` to a temporary directory so a stale
cache cannot influence a run.

---

## License

MIT (see `package.json`). Issues and pull requests are welcome.
