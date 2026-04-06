# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Full build (type-check + vite build, parallel)
npm run build-only   # Vite build only, no type-check
npm run type-check   # vue-tsc --build
npm run lint         # oxlint --fix then eslint --fix (sequential via run-s lint:*)
npm run format       # oxfmt src/
npm run preview      # Preview production build
```

Docker: `docker compose up --build -d` → http://localhost:3000

## Tech Stack

- Vue 3 (Composition API + `<script setup>`) / TypeScript / Vite 7
- State: Pinia stores with localStorage auto-persistence
- Linting: oxlint + eslint (run in sequence); formatting: oxfmt (not prettier)
- PDF export: html2pdf.js; Markdown rendering: markdown-it
- Path alias: `@` → `src/`

## Architecture

Single-page app with two main modes toggled via `App.vue`:
1. **Resume Editor** — `EditorPanel` (left, form editors) + `PreviewPanel` (right, live template preview)
2. **AI Interview** — `AiInterviewerPanel` (full-width chat interface)

A collapsible `ModuleSidebar` controls navigation and module visibility/ordering.

### Data Flow

```
useResumeStore (Pinia)
  ├── EditorPanel → per-module editors (BasicInfoEditor, SkillsEditor, etc.)
  ├── PreviewPanel → dynamically renders selected template component
  └── auto-saves to localStorage on any change (500ms debounce)

useAiConfigStore (Pinia)
  └── stores API URL / Key / Model → used by aiService.ts & interviewService.ts
```

### Resume Modules

Seven modules managed by `useResumeStore.modules[]`: `basicInfo`, `education`, `skills`, `workExperience`, `projectExperience`, `awards`, `selfIntro`. Each has visibility toggle and reorderable position (basicInfo always first). Module order drives CSS `order` in templates via `moduleOrderStyle()`.

### Template System

Each template lives in `src/templates/resume/<key>/` with:
- `ResumeTemplate.vue` — the Vue component
- `template.ts` — exports a `ResumeTemplateDefinition` (key, name, previewImage, component)
- Preview SVG in `src/assets/templates/resume/<key>-preview.svg`

All templates are registered in `src/templates/resume/index.ts` via `buildTemplateRegistry()`. To add a new template:
1. Create `src/templates/resume/<key>/ResumeTemplate.vue` and `template.ts`
2. Create `src/assets/templates/resume/<key>-preview.svg`
3. Import and add to the array in `src/templates/resume/index.ts`

Template components use `useResumeTemplateData()` (from `src/templates/shared/`) which provides computed metadata (lineOneMeta, lineTwoMeta, lineThreeMeta, moduleOrderStyle) and the store reference. Rich text fields (`skills`, `selfIntro`, `workExperience.description`, `projectExperience.mainWork/introduction`, `awards.description`) must render with `v-html`.

### AI Services

- `aiService.ts` — module-level resume optimization via OpenAI-compatible streaming API. Each module has per-module prompt rules in `src/services/prompts/`.
- `interviewService.ts` — AI mock interview (two modes: user-as-interviewer, user-as-candidate).
- API URL auto-appends `/v1/chat/completions` if not present.
- AI responses for resume optimization are parsed into `suggestions` + `optimizedContent` sections.

## Key Conventions

- Templates must only use existing store fields — never add new data model fields for a template.
- Module order in templates must follow the store's `modules[]` array (use `moduleOrderStyle()`).
- All `.vue` files use `<script setup lang="ts">` with Composition API.
- No router — the app uses conditional rendering (`v-if`/`v-else`) in App.vue to switch views.
