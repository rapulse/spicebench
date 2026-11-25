# Стартовый промпт для новой сессии SpiceBench

> Скопируй всё ниже в новый чат с агентом (рабочая папка `/Users/master/Projects/spicebench`).

---

Ты продолжаешь разработку **SpiceBench**: кроссплатформенный десктопный симулятор электронных схем
с интерфейсом **Electronics Workbench 5.12** (Windows 95). Стек: Electron + React, расчётное ядро
`ngspice-45.2` WASM в `worker_threads`, встроенный MCP-сервер (Streamable HTTP `/mcp`).

Главная цель следующей сессии — **расширение библиотеки недостающих элементов и приборов EWB 5.12**
(полный приоритизированный список лежит в `docs/TODO.md`) и **финальная сборка macOS `.app` (Фаза 9.5)**.

## 0. Прочитать перед началом (обязательно)
1. `AGENTS.md` — регламент (строго: Zero Self-Install, Workspace Boundary, временные файлы в `.tmp/`).
2. `docs/HANDOFF.md` — оперативный статус и **контракт UI ↔ бэкенд**.
3. `docs/TODO.md` — **главный список пропущенных элементов, приборов и функций меню** по сверке с
   оригиналом EWB 5.12 (`electronics-workbench/Image-1*.jpeg`) и учебником (`electronics-workbench/ebm_uchebnik`).
4. `docs/ROADMAP.md` (Фаза 9) и `docs/DECISIONS.md` (ADR-001…012).
5. Профильные вики по мере надобности: `docs/wiki/instruments-spec.md`, `docs/wiki/ui-win95-spec.md`,
   `docs/wiki/spice-mapping.md`, `docs/wiki/mcp-tools.md`.

Кратко озвучь план (3–5 пунктов) и приступай.

## 1. Что уже сделано и нельзя ломать
- Расчёт: **ngspice-45.2 WASM** в `worker_threads` Electron Main, таймаут 5 с (ADR-007).
  **Никакой физики и выбора векторов в Renderer.**
- «Power On» = `window.spicebenchApi.runSimulation()` без аргументов; все показания приборов и
  индикаторов считаются в бэкенде (`SimulationSummary.instruments[id]`, ADR-011). При статусе не `ok`
  значение = `null` (рисовать `---`/`----`/`Err`, **никогда не 0**).
- Каталог: **43 типа компонентов** (42 не-ground + `GROUND`), все 42 покрыты smoke-тестом на `ngspice`.
  Включая индикаторы `VOLTMETER`/`AMMETER` прямо на схеме, `AC_CURRENT_SOURCE`, `VCC`/`VDD`, и
  управляемые источники `VCVS`/`VCCS`/`CCVS`/`CCCS`.
- UI главного окна и осциллографа приведены к эталонам `Image-1.jpeg` / `Image-1 3.jpeg`:
  - SVG-иконки верхнего тулбара в точном порядке EWB 5.12 (живые: `New/Open/Save`, `Cut/Copy/Paste`,
    `Rotate`, `Graphs`, `Validate`, `Zoom Out/In/%`, `Power O|I`).
  - Все 14 полок деталей со стрелочками `▼` и плавающими окнами (`PartsBin.tsx`).
  - Меню `File Edit Circuit Analysis Window Help` (`Activate Ctrl+G`, `Stop Ctrl+T`, `Component Properties`,
    `Show Grid / Show Node Voltages`, список приборов в `Window`).
  - Осциллограф с белым/чёрным экраном 10×6, курсорами 1/2, отсчётами `T1/T2/Δ`, спинами, `Reduce/Reverse/Save`.
- Проверки: `pnpm typecheck && pnpm lint && pnpm test` — **22 файла, 183 теста, все зелёные**.
- Визуальная проверка Electron: `.tmp/capture-ui.cjs` снимает скриншоты окна через `webContents.capturePage()`.

## 2. Приоритетные задачи (из `docs/TODO.md` и `docs/ROADMAP.md`)
1. **Недостающие базовые и цифровые элементы** (чтобы пользователю хватало деталей на реальные схемы):
   - Basic: `TRANSFORMER`, `RELAY`, `SWITCH_SPDT`, `FUSE`.
   - Diodes/Transistors: `BRIDGE_RECTIFIER`, `SCHOTTKY_DIODE`, `JFET_N`, `JFET_P`.
   - Полка `Digital` (сейчас пустая): триггеры (`D_FF`, `JK_FF`, `RS_FF`), сумматор, мультиплексор, счётчик.
   - Полка `Indicators`: `PROBE` (логический пробник), `DECODED_SEVEN_SEGMENT` (с BCD-дешифратором).
   - Каждый новый тип: схема в `core` + SPICE в `NetlistCompiler` + символ в `SchematicSymbol.tsx` +
     полка в `PartsBin.tsx` + аналитический тест и smoke-тест на `ngspice`.
2. **Оставшиеся приборы и окна (`docs/TODO.md` §1):**
   - Сверить с оригиналом окна `Multimeter`, `FunctionGenerator`, `BodePlotter` (запросить скриншоты у пользователя).
   - Цифровые приборы из учебника: `WORD_GENERATOR`, `LOGIC_ANALYZER`, `LOGIC_CONVERTER`.
   - Непрерывный прогон `.tran` + `Pause (F9)` (через ADR) и честный `AC` coupling каналов осциллографа в бэкенде.
3. **Редактор и анализы (`docs/TODO.md` §3):**
   - `Flip Horizontal / Vertical` (`flipX/flipY` в `core` + `geometry.ts` + `SchematicSymbol.tsx`).
   - Расширенные диалоги `Analysis` (`DC Sweep`, `Fourier`, `Analysis Options`) и `Create Subcircuit`.
   - Цветные провода (выбор цвета, красный к каналу A осциллографа как на `Image-1 2.jpeg`).
4. **Фаза 9.5 и хвосты (`docs/TODO.md` §4):**
   - Пробная сборка `pnpm --filter @spicebench/desktop pack` на macOS и проверка запуска `ngspice` внутри `.app`.
   - Починить запуск headless MCP CLI (`packages/mcp/dist/cli.js`) в чистом Node.
   - С согласия пользователя обновить `README.md` (убрать устаревшие `/sse` и XSPICE).

## 3. Правила работы
- Сначала сверка с эталоном (`electronics-workbench/`), потом код. Не уверен — спроси пользователя.
- Ни одного «нуля по умолчанию» на месте отсутствующего измерения.
- Вся физика и расчёты — строго в `packages/sim`, Renderer только рисует.
- Коммитить только по команде пользователя; `README.md` с правками пользователя не захватывать без согласия.
- В конце сессии: `pnpm typecheck && pnpm lint && pnpm test`, обновить `docs/ROADMAP.md`, `docs/TODO.md`,
  `docs/HANDOFF.md` (до 60 строк) и `next-chat.md`.
