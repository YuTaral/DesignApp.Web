# DesignApp.Web

Frontend for **DesignApp**, an AI room styler: upload a room photo, AI detects and outlines every object, then tap any object to recolor it and save the design.

The backend (ASP.NET Core 10, Claude vision + SAM 3 segmentation) lives in the separate `DesignApp.Api` repository.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 with shadcn/ui (Radix) components
- TanStack Router and TanStack Query, Zustand for editor state
- Light, dark and system themes from one set of design tokens (`src/index.css`)

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:5173 |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint with oxlint |
| `npm run preview` | Serve the production build locally |

## Project layout

```
src/
  components/      App shell, theme provider and toggle, logo
  components/ui/   shadcn/ui primitives (generated, styled by the design tokens)
  features/        Feature modules: upload, rooms, editor, account, designs
  pages/           Route screens: home/upload (?design= adds the photo to that design), editor
                   (/rooms/$roomId, ?design= when the room is in a design), my designs (/designs),
                   one design (/designs/$designId), sign in and sign up
  lib/api.ts       API base URL, fetch helper and readable error messages
  lib/constants.ts API paths, routes, cache and storage keys, limits, timings and messages
  stores/          Zustand stores
  router.tsx       Route tree
  index.css        Design tokens for light and dark themes
```

Fixed values go in `src/lib/constants.ts` (`API`, `ROUTES`, `QUERY_KEYS`, `LIMITS`, `MESSAGES`...),
never inline. Limits that mirror the API name the API constant they follow. Static button labels,
headings, page copy and Tailwind classes stay in the components.
