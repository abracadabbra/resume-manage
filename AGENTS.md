# AGENTS.md

## Commands

```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Full build with type-check
npm run build-only   # Build only, no type-check
npm run type-check   # vue-tsc --build
npm run lint         # oxlint + eslint
npm run format       # oxfmt src/
```

## Project Structure

- `src/components/ai/` - AI interview components
- `src/components/resume/` - Resume editing/preview/template picker
- `src/components/common/` - Shared components (RichEditor, ModuleSidebar)
- `src/services/` - AI services (aiService, interviewService) + prompts
- `src/stores/` - Pinia stores (resume.ts, aiConfig.ts)
- `src/templates/resume/` - Resume template implementations

## Linting

Uses **oxlint + oxfmt** (not eslint/prettier). Run `npm run lint` before commits.

## Template Registration

Templates are in `src/templates/resume/<template-key>/` and registered in `src/templates/resume/index.ts`. To add a new template, create the component + template.ts + preview.svg, then add to index.ts.

## Codebase Skills

Three skills exist in `.codex/skills/`:
- `resume-template-from-image` - Create template from image
- `resume-backend-project-optimizer` - Optimize backend project descriptions
- `resume-interview-coach` - Prepare for technical interviews

## Docker

```bash
docker compose up --build -d  # http://localhost:3000
```

## Notes

- Pure frontend, data stored in localStorage
- Voice input requires browser support (Ctrl+I toggle)
- AI uses OpenAI-compatible API (auto-appends /v1/chat/completions)