# DesignApp.Web

React 19 + Vite frontend of DesignApp (AI room styler). The API is the sibling repo `../DesignApp.Api`,
whose AppHost also starts this app; its CLAUDE.md holds the shared rules (commits, Word files, testing,
secrets, paid AI). They apply here too.

## Commands

```bash
npx tsc -b          # type check
npx oxlint          # lint; the two react(only-export-components) warnings in components/ui are known
npx vite build      # production build
npm run e2e         # the eleven Firefox passes against the running app (Visual Studio F5), with a summary
```

`npm run e2e` takes an optional URL (`npm run e2e -- http://localhost:5173`); `DESIGNAPP_ROOMS` points
at the five sample photos (default `C:\Users\yutar\Desktop\DesignApp\rooms`). Screenshots go to `e2e/shots/`. A
single pass runs with `node e2e/<pass>.mjs`; `--show` opens a visible browser.

## Code conventions

- **Constants:** API paths, routes, query and storage keys, limits, timings, swatches, messages and the
  API's enums (`ROOM_STATUS`, `AI_MODE`... with derived types) live in `src/lib/constants.ts`. Compare
  against them (`ROOM_STATUS.Ready`), never string literals. Static labels, headings, page copy and
  Tailwind classes stay in the components.
- A callback that spans several lines (a mutation function, an `onConfirm` handler, an effect's frame callback)
  uses a block body, `() => { ... }`, not a multi-line expression. One-line callbacks (`.map((x) => x.id)`) stay.
- **Declarations first:** a block's variables (helper arrows included) are declared at its top, after any guard
  clauses, then the logic. A value that needs an earlier step (an `await`, a call that changes something) is declared
  right after that step. In a component: hooks first, in their order (it is behaviour), then derived values and
  handlers. The e2e passes are step by step: each result is declared right after its step.
- **Empty lines:** one empty line after every group of declarations; one before every `return`, unless it is the
  first statement of its block; and one before and after each `if`, `for`, `while`, `do`, `switch` and `try`, unless
  it is the first or last statement of its block.
- **Braces on every body:** `if`, `else`, `for` and `while` always take braces, even for one statement:
  `if (!plan) {` / `return` / `}`, never `if (!plan) return`. An `else` joins the closing brace: `} else {`.
- Feature folders under `src/features/`; server state in TanStack Query, editor state in the Zustand store.
- Every export gets a JSDoc comment: the Class Reference document is generated from them.
- Scripted edits on Windows: keep each file's line endings as they were.
