# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** 2026-11-25. Фаза 9: готовы 9.1–9.4б, 9.3б (`[~]`) в основном закрыт
  (интерфейс EWB 5.12 + 9 новых элементов), открыта 9.5 (сборка `.app`). Полный бэклог пропущенного
  функционала и элементов — в `docs/TODO.md`, промпт следующей сессии — `next-chat.md`.
- **Эталоны EWB 5.12:** `electronics-workbench/Image-1.jpeg` (главное окно, тулбары, Sources),
  `Image-1 2.jpeg` (схема с индикаторами V/A), `Image-1 3.jpeg` (осциллограф), учебник
  `electronics-workbench/ebm_uchebnik` (меню, элементы, приборы).

## Контракт для UI (что важно не сломать)
- Расчёт: ngspice-45.2 WASM в воркере Electron Main (ADR-007). **Renderer ничего не считает.**
- «Power On» = `window.spicebenchApi.runSimulation()` **без аргументов**: выполняет все нужные
  анализы и возвращает `SimulationSummary.instruments[componentId]` (`InstrumentData` из `@spicebench/sim`).
  Поле `status`: `ok | not_connected | no_data | invalid`; при статусе не `ok` значения = `null`
  (рисовать `---`/`----`/`Err`, **никогда не 0**).
- `InstrumentData` включает `MULTIMETER`, `OSCILLOSCOPE`, `BODE_PLOTTER`, `FUNCTION_GENERATOR`, а также
  схемные индикаторы `VOLTMETER` и `AMMETER` (`MeterIndicatorData`).
- После `updateInstrument` при `powerOn` `App.tsx` автоматически перевызывает `runSimulation()`.
- Настройки прибора: `CircuitSession` создаёт `InstrumentState` при `placeComponent` и синхронизирует
  его с `params` (фолбэк создания состояния в `App.tsx` удалён).
- MCP: единственный путь `McpServerStatus.mcpUrl` (`http://127.0.0.1:3100/mcp`, ADR-010).

## Что сделано в этой сессии
- **Интерфейс под EWB 5.12 (`apps/desktop`):**
  - `OscilloscopePanel.tsx` переработан по `Image-1 3.jpeg` (белый/чёрный экран 10×6, курсоры 1/2,
    отсчёты `T1/T2/Δ`, скроллбар, Time base / Trigger / Ch A / Ch B со спинами, `Reduce/Reverse/Save`).
  - `InstrumentWindow.tsx`: `width: "fit-content"` (убрана обрезка шапки осциллографа).
  - Закрыты `TODO(ui)`: `MultimeterPanel` (`--- V` вместо `0.000 V`), `BodePlotterPanel` (шкала фазы `-180°..+180°`).
  - `EwbIcons.tsx`, `ToolBar.tsx`, `PartsBin.tsx`, `MenuBar.tsx`, `App.tsx`, `Canvas.tsx`: чёткие SVG-иконки
    в точном порядке EWB 5.12, 14 полок деталей с плавающими окнами, тумблер `O|I` + `Pause`, живые
    `Zoom Out/In/%`, `Cut/Copy/Paste`, `Activate (Ctrl+G) / Stop (Ctrl+T)`, `Component Properties`,
    `Show Grid / Show Node Voltages`, список приборов в меню `Window`.
- **9 новых элементов (`core` + `sim` + `mcp` + `desktop`):**
  - `VOLTMETER`, `AMMETER` (DC/AC RMS индикаторы прямо на холсте, как на `Image-1 2.jpeg`, доступны и через MCP `read_instrument`).
  - `AC_CURRENT_SOURCE` (RMS по ADR-012), `VCC`, `VDD`, `VCVS`, `VCCS`, `CCVS`, `CCCS`.
  - Каталог вырос с 34 до **43 типов** (42 не-ground + `GROUND`).
- Создан `docs/TODO.md` со структурированным списком пропущенных элементов, приборов и функций EWB 5.12.

## Проверки
- `pnpm typecheck` 0 ошибок, `pnpm lint` чисто, `pnpm test`: **22 файла, 183 теста, все зелёные**
  (43 smoke-теста всех типов на `ngspice` + аналитические тесты `VOLTMETER`/`AMMETER`/`VCC`/`VCVS`/`CCVS`).
- `pnpm --filter @spicebench/desktop build` — успешно.
- Визуальная проверка на живом Electron (`.tmp/capture-ui.cjs`): сняты и проверены глазами
  `.tmp/ui-scope-live.png`, `.tmp/ui-meters-live.png`, `.tmp/ui-main-sources.png`.

## Известные нюансы
- `README.md` содержит незакоммиченные правки пользователя (не трогались; не включать в чужие коммиты).
- `packages/mcp` `dist/cli.js`, `NativeNgspiceEngine`, конфиги Claude Desktop / Antigravity не проверялись.
- Пункты `Flip H/V`, `Subcircuit`, `Pause`/непрерывный `.tran`, `Word Generator / Logic Analyzer / Logic Converter`,
  пустые полки `Digital / Digital ICs / Controls / Misc` занесены в `docs/TODO.md`.

## Следующие шаги
1. Заполнить критичные пропуски каталога из `docs/TODO.md` §2 (`TRANSFORMER`, `RELAY`, `SWITCH_SPDT`, `FUSE`, `BRIDGE_RECTIFIER`, `JFET`, триггеры `D_FF/JK_FF/RS_FF`, `PROBE`).
2. Фаза 9.5: `pnpm --filter @spicebench/desktop pack` на macOS и проверка работы `ngspice` внутри `.app`.
