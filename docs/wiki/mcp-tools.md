# Wiki: Спецификация MCP-инструментов (`@spicebench/mcp`)

## 1. Общие принципы API для ИИ-агентов
- Все инструменты возвращают валидный JSON в текстовом блоке MCP-контента:
  `{ ok: boolean, data?: Record<string, unknown>, error?: { code: string, message: string } }`.
- Сервер работает полностью автономно (headless, без запущенного GUI), хранит сессию схемы в оперативной памяти (`CircuitSession`) и готов к подключению внешних клиентов (Cursor, Claude Desktop, MCP Inspector).
- Любая мутация схемы валидируется на уровне Zod-схем и логической сетки координат.
- Большие массивы точек (Transient, AC) автоматически прореживаются (до 30–40 контрольных точек) с расчётом точных интегральных метрик ($V_{min}, V_{max}, V_{rms}, V_{avg}, V_{last}, f_0, Q$), чтобы не переполнять контекст LLM-агента.

## 2. Поддерживаемые транспорты (Фаза 3.1)
1. **`stdio` (стандартный ввод/вывод):**
   - Используется по умолчанию (`spicebench-mcp --transport stdio`).
   - Идеален для интеграции с локальными Claude Desktop и Cursor (`command: "node", args: ["<path>/packages/mcp/dist/cli.js"]`).
   - Логирование строго перенаправляется в `stderr`, сохраняя `stdout` чистым для JSON-RPC сообщений.
2. **Локальный Streamable HTTP/SSE:**
   - Запуск через флаг `--transport http --port 3100`.
   - Эндпоинты:
     - `GET /health` — проверка статуса сервера и количества активных сессий.
     - `GET /sse` — установка SSE-потока событий.
     - `POST /messages?sessionId=...` — отправка JSON-RPC команд на сервер.

## 3. Реестр инструментов (Фаза 3.2)

### 1. `get_circuit_state`
Возвращает снимок схемы, статистику элементов и статус последнего расчёта.
- **Вход:**
  - `includeNetlist?: boolean` — включить сгенерированный SPICE-нетлист.
- **Пример ответа:**
  ```json
  {
    "ok": true,
    "data": {
      "circuit": { "schemaVersion": "1.0", "meta": { "name": "Untitled Circuit" }, "components": [...], "wires": [...] },
      "stats": { "componentCount": 4, "wireCount": 4, "junctionCount": 0, "instrumentCount": 0 },
      "lastResult": { "mode": "op", "success": true, "durationMs": 4 }
    }
  }
  ```

### 2. `place_component`
Размещает элемент из каталога EWB на логической сетке.
- **Вход:**
  - `type`: тип компонента (`RESISTOR`, `CAPACITOR`, `DC_VOLTAGE_SOURCE`, `GROUND`, `DIODE`, `BJT_NPN`, `MULTIMETER`, etc.)
  - `x`: целое число (координата X сетки)
  - `y`: целое число (координата Y сетки)
  - `id?: string` — идентификатор элемента (если не передан, генерируется автоматически: `R1`, `C1`, `V1`)
  - `label?: string` — видимая метка
  - `params?: Record<string, string>` — номиналы (`{ resistance: "10k" }`, `{ voltage: "12V" }`)
  - `rotation?: 0 | 90 | 180 | 270` — поворот по часовой стрелке

### 3. `update_component`
Изменяет параметры, номинал, метку, координаты или угол поворота существующего элемента.
- **Вход:**
  - `id`: string — ID элемента
  - `params?: Record<string, string>`
  - `label?: string`
  - `x?: number`
  - `y?: number`
  - `rotation?: 0 | 90 | 180 | 270`

### 4. `remove_component`
Удаляет компонент, а также все провода, подключённые к его выводам, и подчищает висячие узловые точки.
- **Вход:**
  - `id`: string — ID элемента

### 5. `connect_pins`
Прокладывает ортогональный провод (Manhattan routing) между выводами двух элементов.
- **Вход:**
  - `fromComponentId`: string — ID первого элемента (`V1`)
  - `fromPinId`: string — ID вывода (`pos`, `neg`, `1`, `2`, `collector`)
  - `toComponentId`: string — ID второго элемента (`R1`)
  - `toPinId`: string — ID вывода (`1`)
  - `id?: string` — опциональный ID провода

### 6. `validate_circuit`
Проверяет электрическую топологию без запуска расчёта SPICE.
- **Вход:** `{}`
- **Ответ:**
  ```json
  {
    "ok": true,
    "data": {
      "isValid": true,
      "errorCount": 0,
      "warningCount": 0,
      "errors": [],
      "warnings": []
    }
  }
  ```

### 7. `run_simulation`
Компилирует граф схемы в SPICE-нетлист, выполняет моделирование в изолированном Node Worker с таймаутом (5 с) и возвращает структурированные результаты.
- **Вход:**
  - `mode?: "op" | "tran" | "ac" | "dc"`
  - `tran?: { tstep?: string, tstop: string, tstart?: string, uic?: boolean }`
  - `ac?: { scale?: "dec" | "oct" | "lin", points?: number, fstart: string, fstop: string }`
  - `dc?: { source: string, vstart: number, vstop: number, vstep: number }`
  - `timeoutMs?: number`
- **Особенность:** возвращает поле `pinVoltages` (напряжения на конкретных ножках деталей, например `{"R1:2": 5.0, "V1:pos": 10.0}`), что избавляет ИИ-агента от необходимости сопоставлять внутренние технические номера SPICE-узлов (`N001`).

### 8. `read_instrument`
Считывает показания подключённых виртуальных приборов.
- **Вход:**
  - `instrumentId`: string (`XMM1`, `XSC1`, `XBP1`)
- **Ответ для мультиметра:**
  ```json
  {
    "ok": true,
    "data": {
      "instrumentId": "XMM1",
      "type": "MULTIMETER",
      "readings": { "mode": "V", "value": 4.9975, "unit": "V" },
      "formatted": "+4.9975 V"
    }
  }
  ```

### Вспомогательные инструменты
- `export_spice({ mode? })` — экспорт сырого текста нетлиста `.cir`.
- `reset_circuit()` — очистка холста и сброс состояния.

## 4. MCP-ресурсы
- `circuit://current` — текущий JSON схемы в формате `application/json`.
- `spice://netlist` — сгенерированный SPICE-нетлист в формате `text/plain`.
