# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** завершена Фаза 0 (каркас монорепозитория и CI)
- **Текущая фаза:** Фаза 1 — Ядро схемы и графа (`packages/core`)
- **Последний коммит:** `c16f02e` (feat(repo): initialize monorepo scaffold (Phase 0))

## Что сделано
- Развернут `pnpm`-монорепозиторий (`packages/core`, `packages/sim`, `packages/mcp`, `apps/desktop`).
- Настроен строгий TypeScript (`tsconfig.base.json`), ESLint 9 (Flat Config), Prettier, Vitest.
- Добавлен GitHub Actions workflow (`.github/workflows/ci.yml`).
- Настроен `.gitignore` (исключены архивы, бинарники, системные файлы и кэши).
- Инициализирован git-репозиторий, зафиксирован базовый коммит.

## Состояние проверок
- `typecheck`: пройден (`tsc --noEmit` во всех пакетах)
- `lint`: пройден (`eslint .`)
- `test`: пройден (`vitest run` — 4/4 passing)

## Известные проблемы и нюансы
- В pnpm v11+ нативные сборки управляются через `allowBuilds` в `pnpm-workspace.yaml`. Зафиксирован `esbuild: true`.
- Прямой вызов `/usr/bin/git` на macOS блокируется песочницей из-за шима xcode-select; используется бинарник из `/Library/Developer/CommandLineTools/usr/bin/git`.

## Следующий шаг
Выполнить **Пункт 1.1** ([docs/ROADMAP.md](file:///Users/master/Projects/spicebench/docs/ROADMAP.md#L20-L21)):
1. Описать доменные схемы цепи на Zod в `packages/core/src/schema`:
   - типы элементов, пины, номиналы, провода, точки-узлы (junction dots), приборы.
2. Реализовать парсер номиналов со шкалами (инженерная нотация `10k`, `100u`, `1meg`).
3. Покрыть тестами и актуализировать `docs/wiki/circuit-schema.md`.
