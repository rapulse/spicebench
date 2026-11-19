# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** 2026-11-19. Фаза 9: готовы 9.1–9.4б, открыты 9.3б (GUI) и 9.5 (сборка).
- **Следующая сессия (другой агент):** стартовый промпт — `next-chat.md` в корне. UI под EWB 5.12
  плюс найденные по скриншотам пробелы бэкенда. **Логику расчёта в Renderer не переносить.**
- **Эталон (актуальные скриншоты EWB 5.12):** `electronics-workbench/Image-1.jpeg` (главное окно,
  полка Sources), `Image-1 2.jpeg` (схема с индикаторами V/A), `Image-1 3.jpeg` (окно осциллографа).
  Старые 25 скриншотов удалены как некорректные.

## Контракт для UI (что важно не сломать)
- Расчёт: ngspice-45.2 WASM в воркере Electron Main (ADR-007). Renderer ничего не считает.
- «Power On» = `window.spicebenchApi.runSimulation()` **без аргументов**: выполняет все анализы,
  нужные приборам, и возвращает `SimulationSummary` (ADR-011, `docs/wiki/instruments-spec.md` §4).
- Данные прибора: `simulation.instruments[component.id]`, тип `InstrumentData` из `@spicebench/sim`.
  Поле `status`: `ok | not_connected | no_data | invalid`. При статусе не `ok` значения равны
  `null`: показывать «нет измерения», **никогда не рисовать 0**.
  - Мультиметр: `value`, `unit` (V/A/Ohm/dB), `coupling`. Осциллограф: `time[]`, `chA[]|null`,
    `chB[]|null` (уже дифференциальные). Боде: `frequency[]`, `magnitudeDb[]`, `phaseDeg[]` (`Vout/Vin`).
- Панели уже читают `instruments[id]` (минимальная перепривязка данных, визуал не трогался):
  `MultimeterPanel` (`formatMultimeter`), `OscilloscopePanel` (адаптер `scope`), `BodePlotterPanel`
  (`bodeSeries`). `TODO(ui)` в коде: шкала фазы в градусах у Боде; EWB-вид состояний «нет
  измерения» и «Err» у мультиметра.
- Изменение настроек прибора при включённом питании: после `updateInstrument` UI должен снова
  вызвать `runSimulation()`, иначе показания устареют (бэкенд помечает схему как dirty, но сам
  расчёт не запускает).
- Настройки прибора: окно (`InstrumentState`) приоритетнее `params`, `CircuitSession` синхронизирует
  их в обе стороны. Не создавать состояние прибора в UI с жёсткими дефолтами: сессия создаёт его
  при `placeComponent` из params (фолбэк в `App.tsx handleComponentDoubleClick` можно убрать).
- MCP: единственный путь `McpServerStatus.mcpUrl` (`http://127.0.0.1:3100/mcp`). Legacy SSE удалён.

## Сверить с оригиналом EWB 5.12 (может поменять числа)
1. ~~AC-источник RMS или амплитуда~~ → **RMS**, подтверждено скриншотом (ADR-012).
2. Мультиметр dB: опорный уровень (сейчас 0 dB = 1 V, константа `DB_REFERENCE_V`).
3. Генератор: амплитуда пиковая относительно COM, «−» инверсный. Сверить с оригиналом.
4. Экран осциллографа: сейчас 10 делений (`SCOPE_DIVISIONS`) и однократный прогон. В EWB видна
   прокрутка и время 77 мс (непрерывный прогон), см. `next-chat.md`.

## Что сделано в этой сессии (коммиты `50a2262`, `f7a897b` + текущий)
- ADR-007/008/009: ngspice WASM, логика на B-источниках, 555 с защёлкой, авто-`uic`.
- ADR-012: `AC_VOLTAGE_SOURCE` в RMS (+ фаза), эталонный тест по схеме со скриншота.
- ADR-010: MCP `transports/http.ts` (только Streamable HTTP `/mcp`, McpServer на клиента,
  только loopback, проверка Origin/Host, без `CORS *`). `http-sse.ts` удалён. Ошибки содержат
  `componentIds`, `rawResult` агенту не отправляется, внутренние векторы подсхем отфильтрованы.
- ADR-011: `sim/compiler/instrument-settings.ts`, `sim/instruments/instrument-data.ts`,
  `mcp/session/simulation-summary.ts`. Омметр, AC/dB, offset/duty/«−» генератора, Боде `Vout/Vin`,
  висячие выводы приборов не попадают в нетлист, режим анализа выбирается детерминированно.

## Проверки
- `pnpm typecheck` 0 ошибок, `pnpm lint` чисто, `pnpm test`: **22 файла, 171 тест, все зелёные**.
- Живой Electron (собранный бандл) через `/mcp` (`.tmp/live-instruments-check.mjs`): RC + 4 прибора,
  Power On = `tran`+`ac`. AC-мультиметр 0.4997 V при ожидаемых 0.5000; осциллограф A Vpp 2.000 V;
  Боде −0.01 dB @ 10 Hz; параметры агента доходят до расчёта.

## Известные нюансы
- Токена авторизации у MCP нет (ADR-010). `NativeNgspiceEngine` не проверен (нет ngspice CLI).
- `packages/mcp` `dist/cli.js` после `tsc` скорее всего не запустится в чистом Node: импорты без
  расширений. Старая проблема, не проверял.
- Конфиги клиентов Claude Desktop (`mcp-remote`) и Antigravity (`serverUrl`) не проверены на
  реальных клиентах. Cursor и Claude Code по `url` — стандартный формат.
- `README.md` содержит незакоммиченные правки пользователя (там всё ещё упоминаются `/sse` и
  XSPICE). Агент его не трогал, обновление — с согласия пользователя (см. `next-chat.md`).

## Следующие шаги
- 9.3б: UI под EWB 5.12 (другая сессия), затем вручную пройти «Power On» на делителе, RC и RLC.
- 9.5: `pnpm --filter @spicebench/desktop pack` на macOS, проверить, что ngspice работает в .app.
