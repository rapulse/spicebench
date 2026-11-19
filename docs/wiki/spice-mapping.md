# Wiki: Трансляция схемы в SPICE (`packages/sim`)

Транслятор `NetlistCompiler` переводит JSON-граф схемы (`CircuitGraph` из `@spicebench/core`) в канонический SPICE 3 / ngspice нетлист (`.cir`).

---

## 1. Базовые правила формирования нетлиста

1. **Строка заголовка:**
   Первая строка любого SPICE-нетлиста всегда трактуется парсером симулятора как комментарий/название. Первая строка строго начинается с:
   `* SpiceBench Netlist: <Circuit Name>`
2. **Узлы (Nodes):**
   * Опорный узел земли (`GROUND`) всегда получает имя `0`.
   * Остальные эквипотенциальные электрические узлы нумеруются детерминированно: `N001`, `N002`, `N003`... на основе BFS-экстракции связей.
3. **Строгая нормализация единиц (Mega vs Milli):**
   В SPICE синтаксис регистронезависим, и буква `m` или `M` **всегда означает милли ($10^{-3}$)**.
   Номиналы в мегаомах/мегагерцах (`1M`, `10M`, `1Meg`) перед записью в нетлист **всегда компилируются с суффиксом `meg`** (`1meg`, `10meg`).

---

## 2. Соответствие компонентов SPICE-нотации

| Тип компонента | SPICE-синтаксис | Пример |
| :--- | :--- | :--- |
| `GROUND` | Узел `0` (компонент в нетлист отдельной строкой не пишется) | — |
| `RESISTOR` | `R_<id> <n1> <n2> <value>` | `R_R1 N001 N002 10k` |
| `CAPACITOR` | `C_<id> <n1> <n2> <value> [IC=<v>]` | `C_C1 N002 0 1u` |
| `POLARIZED_CAPACITOR` | `C_<id> <pos> <neg> <value>` | `C_C1 N001 0 10u` |
| `INDUCTOR` | `L_<id> <n1> <n2> <value> [IC=<i>]` | `L_L1 N001 N002 10m` |
| `DC_VOLTAGE_SOURCE` | `V_<id> <pos> <neg> DC <value>` | `V_V1 N001 0 DC 12` |
| `AC_VOLTAGE_SOURCE` | `V_<id> <pos> <neg> SIN(0 <ampl> <freq>) AC <ampl>` | `V_V1 N001 0 SIN(0 120 60) AC 120` |
| `DC_CURRENT_SOURCE` | `I_<id> <pos> <neg> DC <value>` | `I_I1 N001 0 DC 1` |
| `PULSE_VOLTAGE_SOURCE` | `V_<id> <pos> <neg> PULSE(v1 v2 delay tr tf width period)` | `V_V1 N001 0 PULSE(0 5 0 10n 10n 0.5m 1m)` |
| `DIODE` | `D_<id> <anode> <cathode> <model>` | `D_D1 N001 N002 1N4148` |
| `ZENER_DIODE` | `D_<id> <anode> <cathode> <model>` | `D_D1 N001 N002 BZX55C5V1` |
| `LED` | `D_<id> <anode> <cathode> LED` | `D_LED1 N001 N002 LED` |
| `BJT_NPN` | `Q_<id> <collector> <base> <emitter> <model>` | `Q_Q1 N001 N002 0 2N3904` |
| `BJT_PNP` | `Q_<id> <collector> <base> <emitter> <model>` | `Q_Q1 N001 N002 0 2N3906` |
| `SWITCH_SPST` | Резистор с малым/большим сопротивлением: `1m` (вкл) / `100meg` (выкл) | `R_S1 N001 N002 1m` |
| `POTENTIOMETER` | Два последовательных резистора: `R_<id>_A` и `R_<id>_B` | `R_R1_A N001 N_W 5k`<br>`R_R1_B N_W N002 5k` |
| `*_GATE` (AND/OR/NOT/NAND/NOR/XOR) | `X_<id> <in1> [<in2>] <out> GATE_<TYPE>`, макромодель на B-источнике (ADR-008) | `X_U1 N001 N002 N003 GATE_AND` |
| `OPAMP_IDEAL` / `OPAMP_741` | `X_<id> ... OPAMP_IDEAL` / `LM741` (E-источник; у 741 ограничение по питанию через B) | `X_U1 N001 N002 N003 OPAMP_IDEAL` |

**Синтаксис B-выражений ngspice:** логика `&&`, `||`, `!`, сравнения `> < >= <= == !=`, тернарный
`? :`. Одиночные `&`/`|` вешают разбор, `^` означает степень, а не XOR.

---

## 3. Виртуальные приборы

* **Функциональный генератор (`FUNCTION_GENERATOR`):**
  * Синус: `V_<id> <pos> <com> SIN(0 <ampl> <freq>) AC <ampl>`
  * Меандр / Треугольник: директива `PULSE(...)` с вычисленными фронтами и полупериодом.
* **Мультиметр (`MULTIMETER`):**
  * В режиме вольтметра (`mode: "V"`): параллельное измерительное сопротивление `R_<id>_sense <pos> <neg> 10meg`.
  * В режиме амперметра (`mode: "A"`): последовательный нулевой источник `V_<id>_sense <pos> <neg> 0V` (ток извлекается через `I(V_<id>_sense)`).
* **Осциллограф (`OSCILLOSCOPE`):**
  * Входные каналы A и B: нагрузочные резисторы `1meg` между выводами каждого канала.
* **Плоттер Боде (`BODE_PLOTTER`):**
  * Высокоомные входы `in` и `out`: резисторы `10meg`.

---

## 4. Директивы симуляции

1. **Режим по постоянному току (`.op`):**
   * `.op` — расчёт потенциалов всех узлов и токов ветвей.
2. **Переходный процесс во времени (`.tran`):**
   * `.tran <tstep> <tstop> [tstart] [uic]` (например, `.tran 10u 5m uic`).
3. **Частотный анализ (`.ac`):**
   * `.ac <dec|oct|lin> <pts> <fstart> <fstop>` (например, `.ac dec 50 10 100k`).
4. **Завершение нетлиста:**
   * Опции `.options noacct` и терминатор `.end`.

---

## 5. Движок и результаты (ADR-007)

* Движок: ngspice-45.2 (WASM, `eecircuit-engine@1.9.0`) в `worker_threads`, класс `WasmNgspiceEngine`.
  `SpiceRunner({ timeoutMs = 5000, engine = "wasm" | "native", workerPath? })` сериализует запуски.
* Имена векторов: `v(<node>)`, `i(<vsource>)`, всё в нижнем регистре. Узел земли `0` в результатах
  **не возвращается**.
* `.tran` без `uic` стартует из рабочей точки `.op`: заряженные конденсаторы не будут «заряжаться».
  Для переходного процесса от нуля нужен `uic` (и `IC=` у элементов).
* Ошибки бросаются как `SimulationError` с `details.code`: `SPICE_ERROR` (фатальные сообщения
  ngspice, в том числе пропущенные строки «... ignored!»), `SIMULATION_TIMEOUT`, `ENGINE_ERROR`,
  `PARSE_ERROR`. Нефатальные сообщения (`Note: ... DC 0 assumed`) попадают в `SimulationResult.warnings`.
* XSPICE code models недоступны (ADR-008).
* Если в схеме есть `TIMER_555`, `.tran` компилируется с `uic`, если `tran.uic` не задан явно (ADR-009).
