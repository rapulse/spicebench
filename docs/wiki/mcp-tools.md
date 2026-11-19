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
2. **Локальный HTTP (ADR-010):**
   - Запуск: `--transport http --port 3100`. Electron Main поднимает этот же сервер автоматически.
   - Слушает только loopback (`127.0.0.1`). Привязку к адресу не-loopback сервер отклоняет.
   - Эндпоинты:
     - `POST|GET|DELETE /mcp` — **Streamable HTTP**, единственный MCP-путь (сессии через `Mcp-Session-Id`).
       Устаревший HTTP+SSE (`/sse`) не поддерживается (ADR-010).
     - `GET /health` — статус и число активных сессий.
   - Каждый клиент получает свой экземпляр `McpServer` поверх **общего** `CircuitSession`:
     несколько агентов и GUI видят одну схему.
   - Безопасность: `Host` должен быть loopback (защита от DNS rebinding). Запрос с заголовком `Origin`
     принимается только с loopback-origin (например, MCP Inspector). CORS без `*`: отражается
     разрешённый origin. Чужая веб-страница получает 403.
   - Конфиги клиентов (меню MCP в приложении): Cursor `{"url": "http://127.0.0.1:3100/mcp"}`;
     Claude Desktop через мост `npx -y mcp-remote http://127.0.0.1:3100/mcp` (конфиг-файл Claude
     Desktop поддерживает только stdio); Claude Code
     `claude mcp add --transport http spicebench http://127.0.0.1:3100/mcp`.

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
Компилирует граф в SPICE-нетлист и считает на ngspice-45.2 (WASM, воркер, таймаут 5 с, ADR-007).
- **Вход:** `mode?`, `tran?`, `ac?`, `dc?`, `timeoutMs?` (как раньше).
- **Без `mode` = «Power On» (ADR-011):** выполняются все анализы, нужные приборам схемы: Боде → `.ac`,
  осциллограф, генераторы и AC-мультиметр → `.tran`, DC-мультиметр и омметр → `.op`. Окно `.tran`
  и диапазон `.ac`, если их не задали явно, выводятся из настроек приборов (10 делений × timebase,
  ≥ 50 точек на период генератора; fstart/fstop Боде, 50 точек на декаду).
- **Ответ `data`:** `mode`, `analyses[]`, `engine`, `warnings[]`, `pinVoltages`, `nodeVoltages`,
  `branchCurrents`, `timeRange`, `signalsSummary`, `samples` (≤ 40 точек), `acSummary` (пик только
  по напряжениям узлов), **`instruments`** (показания каждого прибора, см. instruments-spec §4).
  Внутренние векторы подсхем (`v(x_u1.int)`) исключены. `rawResult` агенту **не отправляется**.
- **Ошибка:** `{ ok: false, error: { code: "SPICE_ERROR" | "SIMULATION_TIMEOUT" | "ENGINE_ERROR" |
  "PARSE_ERROR" | "MCP_TOOL_ERROR", message, componentIds[], spiceElements[], nodes[] } }`.
  `componentIds` — ID компонентов схемы (например `D1`), сопоставленные с элементами SPICE (`d_d1`).

### 8. `read_instrument`
Возвращает те же числа, что показывает окно прибора: из последнего «Power On», а если схема изменилась, прогоняет его заново.
- **Вход:** `instrumentId` (`XMM1`, `XSC1`, `XBP1`, `XFG1`).
- **Ответ:** `{ instrumentId, type, status: "ok" | "not_connected" | "no_data" | "invalid", readings, formatted }`.
  При статусе, отличном от `ok`, значения равны `null`, а не 0.
  ```json
  { "instrumentId": "XMM1", "type": "MULTIMETER", "status": "ok",
    "readings": { "mode": "V", "coupling": "AC", "value": 0.4997, "unit": "V", "source": "tran" },
    "formatted": "499.690 mV AC" }
  ```

### Вспомогательные инструменты
- `export_spice({ mode? })` — экспорт сырого текста нетлиста `.cir`.
- `reset_circuit()` — очистка холста и сброс состояния.

## 4. MCP-ресурсы
- `circuit://current` — текущий JSON схемы в формате `application/json`.
- `spice://netlist` — сгенерированный SPICE-нетлист в формате `text/plain`.
