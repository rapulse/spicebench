# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** 2026-11-19, Фаза 9: выполнены 9.1, 9.2, 9.3а (коммиты `50a2262` + следующий)
- **Текущая фаза:** Фаза 9 `[~]`; пункты 6.x, 7.3 и 8.1 возвращены в работу (см. ревизии в ROADMAP)
- **Главный визуальный эталон:** `electronics-workbench/IMG_6708.jpg`

## Что было не так (найдено на ревью)
- Вместо ngspice по умолчанию работал самописный `BuiltinMnaEngine`: диоды и транзисторы как ключи,
  ОУ игнорировались в `.ac`, `.tran` обрезался на 2000 шагах, таймаут не работал (расчёт шёл
  inline в Electron Main), а тест таймаута проверял mock. Пример: «5 V → 1 kΩ → диод» давал `V(a) = 5 V`.

## Что сделано
- **ADR-007:** ngspice-45.2 в WASM (`eecircuit-engine@1.9.0`, MIT, точная версия) встроен в
  `packages/sim`. Пользователю ничего ставить не нужно.
  - `runner/ngspice-worker.ts` (самодостаточный, только `import type`), `ngspice-protocol.ts`,
    `wasm-ngspice-engine.ts`: воркер, таймаут через `terminate()` и пересоздание, перехват console.
  - `parser/ngspice-result.ts`: конвертация `ResultType` в `SimulationData` и классификация сообщений.
  - `SpiceRunner({ timeoutMs, engine: "wasm"|"native", workerPath, customEngine })` с очередью запусков.
    `SimulationResult` получил поля `warnings` и `engine`, ошибки бросаются как `SimulationError.details`.
  - `BuiltinMnaEngine` и старый `spice-worker.ts` удалены. `NativeNgspiceEngine` адаптирован
    (`SPICE_ASCIIRAWFILE=1`), но **не проверен**: ngspice CLI на машине нет.
  - `CircuitSession(project?, { runner })`, `warmUpSimulator()`, `dispose()`. `SimulationSummary`
    получил поля `engine` и `warnings`.
  - Electron: отдельный Vite entry `dist-electron/ngspice-worker.js` (+ чанк около 20 МБ),
    `workerPath` задаётся в `main.ts`, прогрев при старте, `dispose` в `before-quit`.
- **ADR-008:** XSPICE в WASM-сборке нет, логика сделана на B-источниках. Исправлены `&` (вешал
  ngspice) и `^` (это степень, не XOR) на `&&`, `||`, `!=`.
- **Тесты:** `golden-fixtures-nonlinear.test.ts` (Fixture 6–10: Шокли, BJT, ОУ `.ac`, `.tran` на 10k
  шагов, таблицы истинности). `spice-runner.test.ts`: настоящий таймаут и восстановление, очередь,
  `SPICE_ERROR` с элементом, warnings. Fixture 1: ngspice не отдаёт узел `0`, ток `v_v1` проверяется строго.
- **Инфраструктура:** `.tmp/` для проб (в `.gitignore`, исключён из vitest и eslint). Пробы запускаются так:
  `pnpm exec vitest run --root .tmp --config vitest.probe.config.ts`.

- **9.3а:** `component-smoke.test.ts`: все 33 типа (кроме GROUND) компилируются и решаются ngspice в
  `.op` и `.tran`. 555 переписан с RS-защёлкой, компилятор сам добавляет `uic` (ADR-009, Fixture 11:
  6799 Гц против 6870 Гц, скважность 0.518 против 0.524).

## Проверки
- `pnpm typecheck`: 0 ошибок (4 пакета). `pnpm lint`: чисто. `pnpm test`: 21 файл, **160/160**.
- Живой Electron (собранный бандл) проверен через его MCP (`.tmp/live-mcp-check.mjs`): диод `.op`
  = 0.653 V / 4.35 мА, 555 `.tran` генерирует, `engine: "ngspice-wasm"`. Приборы глазами не смотрел.
- `pnpm --filter @spicebench/desktop build`: собирается. Собранный `ngspice-worker.js` считает под
  Node Electron 33 (20.18.3): диод `V(a) = 0.6929 V`. Утечек в stdout/stderr из воркера: 0 байт.
- Все `.model` и `.subckt` из `models.ts` принимаются ngspice без ошибок.

## Известные нюансы
- `signalsSummary` в MCP включает внутренние векторы подсхем (`i(b.x_u1.b_latch)`), это шум для агента.
- GUI вживую после смены движка **не запускался**: приборы не перепроверены.
- MCP по-прежнему на legacy SSE с `CORS *` без проверки Origin (9.4).
- Бинарь MCP `dist/cli.js` после `tsc` скорее всего не запустится в чистом Node: импорты без
  расширений. Это старая проблема, не проверял.
- `README.md` содержит незакоммиченные правки пользователя: раздел «Дополнительно», упоминания
  XSPICE и «Streamable HTTP». Агент его не трогал.
- Изменения **не закоммичены**.

## Следующий шаг
- 9.3б: пользователь вручную проверяет 4 прибора в `pnpm --filter desktop dev` (делитель, RC, RLC).
- 9.4: MCP на Streamable HTTP + проверка Origin/Host, сессия на клиента; отфильтровать векторы `.x_`.
