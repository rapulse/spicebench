# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** 2026-11-19, Фаза 9 (возврат к ngspice), выполнены пункты 9.1–9.2
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

## Проверки
- `pnpm typecheck`: 0 ошибок (4 пакета). `pnpm lint`: чисто. `pnpm test`: 20 файлов, **125/125**.
- `pnpm --filter @spicebench/desktop build`: собирается. Собранный `ngspice-worker.js` считает под
  Node Electron 33 (20.18.3): диод `V(a) = 0.6929 V`. Утечек в stdout/stderr из воркера: 0 байт.
- Все `.model` и `.subckt` из `models.ts` принимаются ngspice без ошибок.

## Известные нюансы
- Макромодель 555 логически неверна: нет RS-триггера, `? 0.1 : 0.1`, астабильный режим не заработает.
- GUI вживую после смены движка **не запускался**: приборы не перепроверены.
- MCP по-прежнему на legacy SSE с `CORS *` без проверки Origin (9.4).
- Бинарь MCP `dist/cli.js` после `tsc` скорее всего не запустится в чистом Node: импорты без
  расширений. Это старая проблема, не проверял.
- `README.md` содержит незакоммиченные правки пользователя: раздел «Дополнительно», упоминания
  XSPICE и «Streamable HTTP». Агент его не трогал.
- Изменения **не закоммичены**.

## Следующий шаг
- 9.3: smoke-тест всех 34 типов компонентов через `NetlistCompiler` и ngspice, исправить 555, затем
  `pnpm --filter desktop dev` и ручная проверка 4 приборов на делителе, RC и RLC.
