# Wiki: JSON-схема цепи (`packages/core`)

Каноническая модель схемы проекта (`.ewb.json`), валидируемая через Zod.

## 1. Геометрия и сетка
- Все координаты (`x`, `y`) — строго целочисленные (`z.number().int()`), в дискретных единицах логической сетки.
- Углы поворота (`rotation`) — строго `0 | 90 | 180 | 270` градусов (по часовой стрелке, ось Y направлена вниз).
- Пины компонентов задаются относительными смещениями `offset: { x, y }` при угле $0^\circ$.
- Абсолютная позиция пина вычисляется как `position + rotatePoint(pin.offset, rotation)`.

## 2. Инженерные единицы и SPICE
- Номиналы задаются строкой в инженерной нотации: `"10k"`, `"100uF"`, `"1Meg"`, `"10M"`, `"50Ω"`, `"12V"`.
- Функция `parseEngineeringValue(str)` парсит строку в точный `number` (в единицах СИ: $\Omega$, $\text{F}$, $\text{H}$, $\text{V}$, $\text{A}$, $\text{Hz}$) и SPICE-безопасную строку `spiceValue`.
- **Критическое правило SPICE:** в ngspice буква `m` или `M` всегда обозначает милли ($10^{-3}$). Для обозначения мега ($10^6$) парсер автоматически транслирует значение в суффикс `meg` (например, `"10M"` -> `"10meg"`).

## 3. Каталог типов компонентов (`ComponentType`)

| Тип | Категория | Префикс | Пины (при rotation = 0) | Параметры по умолчанию |
| :--- | :--- | :--- | :--- | :--- |
| `GROUND` | Sources | `GND` | `0` (0, 0) | `{}` |
| `DC_VOLTAGE_SOURCE` | Sources | `V` | `pos` (0, -2), `neg` (0, 2) | `{ voltage: "12V" }` |
| `AC_VOLTAGE_SOURCE` | Sources | `V` | `pos` (0, -2), `neg` (0, 2) | `{ voltage: "120V", frequency: "60Hz" }` |
| `DC_CURRENT_SOURCE` | Sources | `I` | `pos` (0, -2), `neg` (0, 2) | `{ current: "1A" }` |
| `PULSE_VOLTAGE_SOURCE`| Sources | `V` | `pos` (0, -2), `neg` (0, 2) | `{ v1: "0V", v2: "5V", width: "0.5ms", period: "1ms", ... }` |
| `RESISTOR` | Basic | `R` | `1` (-2, 0), `2` (2, 0) | `{ resistance: "1k" }` |
| `CAPACITOR` | Basic | `C` | `1` (-2, 0), `2` (2, 0) | `{ capacitance: "1uF" }` |
| `POLARIZED_CAPACITOR` | Basic | `C` | `pos` (-2, 0), `neg` (2, 0) | `{ capacitance: "10uF" }` |
| `INDUCTOR` | Basic | `L` | `1` (-2, 0), `2` (2, 0) | `{ inductance: "1mH" }` |
| `SWITCH_SPST` | Basic | `S` | `1` (-2, 0), `2` (2, 0) | `{ state: "open", key: "Space" }` |
| `POTENTIOMETER` | Basic | `R` | `1` (-2, 0), `wiper` (0, 2), `2` (2, 0) | `{ resistance: "10k", percent: "50", key: "R" }` |
| `DIODE` | Diodes | `D` | `anode` (-2, 0), `cathode` (2, 0) | `{ model: "1N4148" }` |
| `ZENER_DIODE` | Diodes | `D` | `anode` (-2, 0), `cathode` (2, 0) | `{ vz: "5.1V", model: "BZX55C5V1" }` |
| `LED` | Diodes | `LED` | `anode` (-2, 0), `cathode` (2, 0) | `{ color: "red", forwardVoltage: "2V" }` |
| `BJT_NPN` | Transistors | `Q` | `base` (-2, 0), `collector` (1, -2), `emitter` (1, 2) | `{ model: "2N3904" }` |
| `BJT_PNP` | Transistors | `Q` | `base` (-2, 0), `collector` (1, -2), `emitter` (1, 2) | `{ model: "2N3906" }` |
| `OPAMP` | Analog | `U` | `inv` (-3, -1), `non_inv` (-3, 1), `v_pos` (0, -2), `v_neg` (0, 2), `out` (3, 0) | `{ model: "LM741" }` |
| `MULTIMETER` | Instruments | `XMM` | `pos` (-2, 1), `neg` (2, 1) | `{ mode: "V", currentType: "DC" }` |
| `FUNCTION_GENERATOR` | Instruments | `XFG` | `pos` (-2, 1), `com` (0, 1), `neg` (2, 1) | `{ waveform: "sine", frequency: "1kHz", amplitude: "5V" }` |
| `OSCILLOSCOPE` | Instruments | `XSC` | `ch_a_pos` (-3, 1), `ch_a_neg` (-1, 1), `ch_b_pos` (1, 1), `ch_b_neg` (3, 1) | `{ timebase: "1ms/div", chA_scale: "5V/div", ... }` |
| `BODE_PLOTTER` | Instruments | `XBP` | `in_pos` (-3, 1), `in_neg` (-1, 1), `out_pos` (1, 1), `out_neg` (3, 1) | `{ fstart: "10Hz", fstop: "100kHz", mode: "magnitude" }` |

## 4. Провода и точки соединений
- **Конечные точки провода (`WireEndpoint`):**
  - Подключение к выводу элемента: `{ componentId: string, pinId: string }`.
  - Подключение к точке-узлу: `{ junctionId: string }`.
- **Провод (`Wire`):**
  - Массив вершин `points: Position[]` (минимум 2 точки: начало и конец).
  - Все смежные сегменты `points[i]` -> `points[i+1]` строго ортогональны (либо $dx = 0$, либо $dy = 0$).
  - Опциональный цвет `color?: string` (для цветовой маркировки каналов осциллографа).
- **Точка-узел (`Junction`):**
  - `{ id: string, position: Position }` — явная отметка Т-образного или крестообразного электрического соединения.

## 5. Эталонный JSON-контракт проекта (`.ewb.json`)
```json
{
  "schemaVersion": 1,
  "meta": {
    "name": "Voltage Divider",
    "description": "Standard 10V to 5V divider",
    "createdAt": "2026-11-18T12:00:00.000Z",
    "updatedAt": "2026-11-18T12:00:00.000Z"
  },
  "components": [
    {
      "id": "V1",
      "type": "DC_VOLTAGE_SOURCE",
      "label": "V1",
      "params": { "voltage": "10V" },
      "position": { "x": 10, "y": 15 },
      "rotation": 0
    },
    {
      "id": "R1",
      "type": "RESISTOR",
      "label": "R1",
      "params": { "resistance": "10k" },
      "position": { "x": 20, "y": 10 },
      "rotation": 90
    },
    {
      "id": "R2",
      "type": "RESISTOR",
      "label": "R2",
      "params": { "resistance": "10k" },
      "position": { "x": 20, "y": 20 },
      "rotation": 90
    },
    {
      "id": "GND1",
      "type": "GROUND",
      "label": "GND",
      "params": {},
      "position": { "x": 10, "y": 25 },
      "rotation": 0
    }
  ],
  "wires": [
    {
      "id": "W1",
      "from": { "componentId": "V1", "pinId": "pos" },
      "to": { "componentId": "R1", "pinId": "1" },
      "points": [{ "x": 10, "y": 13 }, { "x": 10, "y": 8 }, { "x": 20, "y": 8 }]
    },
    {
      "id": "W2",
      "from": { "componentId": "R1", "pinId": "2" },
      "to": { "junctionId": "J1" },
      "points": [{ "x": 20, "y": 12 }, { "x": 20, "y": 15 }]
    },
    {
      "id": "W3",
      "from": { "junctionId": "J1" },
      "to": { "componentId": "R2", "pinId": "1" },
      "points": [{ "x": 20, "y": 15 }, { "x": 20, "y": 18 }]
    }
  ],
  "junctions": [
    { "id": "J1", "position": { "x": 20, "y": 15 } }
  ],
  "instruments": [
    {
      "instrumentId": "XMM1",
      "isOpen": true,
      "windowPosition": { "x": 250, "y": 120 },
      "mode": "V",
      "currentType": "DC"
    }
  ]
}
```
