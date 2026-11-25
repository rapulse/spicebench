# TODO — Пропущенный функционал и элементы EWB 5.12

Список составлен по сверке SpiceBench с оригинальной **Electronics Workbench 5.12**
(`electronics-workbench/Image-1*.jpeg`) и учебником (`electronics-workbench/ebm_uchebnik`).

## 1. Приборы и окна (приоритет высокий)
- [ ] **Сверить визуал 3 окон приборов с оригиналом EWB 5.12** (после получения скриншотов оригинала):
  - `MultimeterPanel` (кнопки настроек сопротивлений, опорный уровень `DB_REFERENCE_V = 1 V`).
  - `FunctionGeneratorPanel` (уточнить пиковую/RMS амплитуду, ручки, подписи).
  - `BodePlotterPanel` (редактируемые поля `I` / `F` для вертикальной и горизонтальной шкал, кнопки `Log`/`Lin`, `Save`).
- [ ] **Цифровые приборы из учебника (Часть 3):**
  - `WORD_GENERATOR` — генератор слова (16-бит паттерны, step/cycle/burst).
  - `LOGIC_ANALYZER` — 16-канальный логический анализатор с триггерным словом.
  - `LOGIC_CONVERTER` — логический преобразователь (таблица истинности ↔ булево выражение ↔ схема).
- [ ] **Непрерывный прогон `.tran` и кнопка `Pause (F9)`:**
  - Зафиксировать ADR: чанковый прогон ngspice с продолжением состояния или длинный буфер с подкачкой, чтобы экран осциллографа прокручивался в реальном времени (как на `Image-1 3.jpeg`: T1 = 77 ms при 0.10 ms/div).
- [ ] **AC-развязка каналов осциллографа (`AC` coupling):**
  - Сейчас бэкенд отдаёт `V(A+)-V(A-)`; для честного `AC`-режима вычитать DC-составляющую в `packages/sim/src/instruments/instrument-data.ts` (не в Renderer).

## 2. Недостающие элементы по полкам EWB 5.12 (приоритет высокий)
Сейчас в каталоге **43 типа компонентов** (42 + `GROUND`). Остаётся добавить:
- [ ] **Sources (нижний ряд полки `Image-1.jpeg`):**
  - `AM_SOURCE`, `FM_SOURCE` (модулированные источники).
  - `PWL_SOURCE` (кусочно-линейный источник, таблица `(t, v)`).
  - `FSK_SOURCE` (частотная манипуляция).
  - Полиномиальный / нелинейный зависимые источники (`B`-источник с формулой).
- [ ] **Basic:**
  - `TRANSFORMER` (идеальный и с сердечником, коэффициент трансформации).
  - `RELAY` (реле с катушкой и контактами).
  - `SWITCH_SPDT` (переключатель на два направления), `TIME_DELAY_SWITCH`, `VOLTAGE_CONTROLLED_SWITCH`.
  - `FUSE` (предохранитель).
- [ ] **Diodes / Transistors:**
  - `BRIDGE_RECTIFIER` (диодный мост), `SCHOTTKY_DIODE`, `VARACTOR`, `SCR`, `TRIAC`.
  - `JFET_N`, `JFET_P`, `IGBT`, 4-выводные `MOSFET` с подложкой.
- [ ] **Digital (полка пока пустая) — последовательностная логика:**
  - `RS_FF`, `JK_FF`, `D_FF`, `D_FF_ASYNC` (триггеры).
  - `HALF_ADDER`, `FULL_ADDER`, `MUX`, `DEMUX`, `DECODER`, `ENCODER`, `COUNTER`, `SHIFT_REGISTER`.
- [ ] **Digital ICs (полка пока пустая):**
  - Базовые серии `74xx` (TTL) и `40xx` (CMOS) на базе макромоделей.
- [ ] **Indicators:**
  - `PROBE` (логический пробник с подсветкой), `DECODED_SEVEN_SEGMENT` (7-сегментный с BCD-дешифратором), `BARGRAPH`, `BUZZER`.
- [ ] **Controls (полка пока пустая):**
  - `SUMMER`, `MULTIPLIER`, `DIVIDER`, `DIFFERENTIATOR`, `INTEGRATOR`, `TRANSFER_FUNCTION`, `LIMITER`.
- [ ] **Miscellaneous (полка пока пустая):**
  - `CRYSTAL` (кварцевый резонатор), `DC_MOTOR`, `OPTOCOUPLER`, `LOSSY_LINE`, `TEXT_BOX` (текстовая надпись на схеме).

## 3. Редактор, меню и анализы
- [ ] **`Flip Horizontal` / `Flip Vertical`:** добавить `flipX`/`flipY` в `ComponentSchema` (`core`), пересчёт пинов в `geometry.ts`, отражение в `SchematicSymbol.tsx`.
- [ ] **`Create Subcircuit`:** иерархические подсхемы (`SUBCKT`) и вложенные графы.
- [ ] **Расширенные диалоги меню `Analysis`:**
  - `Analysis Options...` (RELTOL, ABSTOL, ITL1, температура).
  - Отдельные диалоги запуска `.op`, `.tran`, `.ac`, `.dc` (DC Sweep), `Fourier`, `Noise`, `Parameter Sweep`, `Monte Carlo` и окно `Display Graphs`.
- [ ] **Печать и экспорт графики:** `File → Print...`, `Edit → Copy as Bitmap`, `Circuit → Restrictions...`.
- [ ] **Вид схемы под EWB 5.12 (`Image-1 2.jpeg`):**
  - Цветные провода к осциллографу (выбор цвета провода в свойствах сегмента).
  - Формат подписей номиналов синим в стиле EWB (`1.5 k Ohm`, `240 mH`, `10 V/1 kHz/0 Deg`).

## 4. Сборка и инфраструктура (ROADMAP 9.5 / хвосты)
- [x] **9.5:** `electron-builder --dir` на macOS + проверка работы `ngspice` WASM внутри `SpiceBench.app` (готово; при желании собрать `.dmg` командой `electron-builder --mac`).
- [ ] **Headless MCP CLI (`packages/mcp/dist/cli.js`):** проверить и починить запуск в чистом Node (расширения импортов `.js` в ESM).
- [ ] **README.md:** с согласия пользователя актуализировать незакоммиченный раздел «Дополнительно» (убрать `/sse` и XSPICE по ADR-008/010/012).
- [ ] **Реальные MCP-клиенты:** проверить конфиги Claude Desktop (`mcp-remote`), Antigravity (`serverUrl`) и `NativeNgspiceEngine` при наличии локального `ngspice` CLI.
