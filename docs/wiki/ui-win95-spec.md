# Wiki: Спецификация интерфейса Win95 / EWB 5.12 (`apps/desktop`)

Документ описывает визуальный стиль, архитектурные слои, компоненты и протоколы десктопного приложения **SpiceBench** (`apps/desktop`), воссоздающего рабочее окружение **Electronics Workbench 5.12** на стеке Electron, React, Vite и `98.css`.

---

## 1. Архитектура десктопного приложения

Приложение построено с разделением на три изолированных контекста:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ apps/desktop/src (Renderer: React 18 + 98.css + SVG Canvas)            │
│  - TitleBar, MenuBar, ToolBar, PartsBin, Canvas, StatusBar             │
│  - Двусторонняя реактивность через window.spicebenchApi                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.spicebenchApi (contextBridge)
┌───────────────────────────────────▼────────────────────────────────────┐
│ apps/desktop/electron/preload.ts (Preload Bridge)                      │
│  - Строго типизированные вызовы ipcRenderer.invoke                     │
│  - Подписка на IPC-события: circuit-updated, simulation-updated        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Channels (spicebench:*)
┌───────────────────────────────────▼────────────────────────────────────┐
│ apps/desktop/electron/main.ts (Electron Main Process)                  │
│  - Единственный инстанс CircuitSession (@spicebench/mcp)               │
│  - Доменная логика (@spicebench/core) и симулятор ngspice (@spicebench/sim)│
│  - Управление окном BrowserWindow, предзагрузка эталонных схем         │
└────────────────────────────────────────────────────────────────────────┘
```

### Принципы изоляции:
1. **Renderer без прямого доступа к Node.js:** флаги `nodeIntegration: false`, `contextIsolation: true`. Все операции со схемой и симуляцией делегируются в Main через IPC.
2. **Единый источник правды (Single Source of Truth):** схема и результаты симуляции хранятся в Electron Main в экземпляре `CircuitSession`. При изменении схемы (пользователем через UI или ИИ-агентом через MCP) Main рассылает широковещательное событие `spicebench:circuit-updated`.
3. **Целочисленная сетка:** все геометрические координаты компонентов, проводов и узлов в памяти и файле хранятся в целых числах. Масштабирование, панорамирование и перевод в пиксели происходят исключительно в React-компоненте `Canvas`.

---

## 2. Что реализовано в `apps/desktop`

### 2.1. Инфраструктура и мост (Main & Preload)
- **`electron/main.ts`:**
  - Создание главного окна `BrowserWindow` (1024x720, минимальный размер 800x600, иконка, системное обрамление).
  - Интеграция с `CircuitSession` (`@spicebench/mcp`), хранящим граф схемы, валидатор топологии, трассировщик проводов и запуск симуляции.
  - Обработчики IPC (`ipcMain.handle`):
    - `spicebench:get-circuit` — получение текущей схемы.
    - `spicebench:get-stats` — статистика схемы (число деталей, проводов, узлов).
    - `spicebench:place-component` — размещение компонента.
    - `spicebench:update-component` — обновление параметров, поворота или положения.
    - `spicebench:remove-component` — удаление элемента с очисткой привязанных проводов.
    - `spicebench:connect-pins` — ортогональное соединение выводов.
    - `spicebench:validate-circuit` — проверка топологии схемы (земля, висячие выводы, замыкания).
    - `spicebench:run-simulation` — запуск расчёта в изолированном воркере с таймаутом.
    - `spicebench:set-power` — переключение тумблера питания (запуск / сброс расчёта).
    - `spicebench:reset-circuit` — сброс схемы.
    - `spicebench:load-sample` — мгновенная загрузка встроенных эталонных схем (*voltage-divider*, *rc-step*, *rlc-filter*).
  - Рассылка событий в Renderer:
    - `spicebench:circuit-updated` — схема изменилась (отправляется полный снапшот `CircuitProject`).
    - `spicebench:simulation-updated` — готов новый расчёт или питание выключено (`SimulationSummary | null`).
- **`electron/preload.ts` & `src/types/ipc.ts`:**
  - Экспорт безопасного интерфейса `window.spicebenchApi` (`SpicebenchApi`).
  - Типизированные функции обратного вызова с автоматической отпиской (`onCircuitUpdated`, `onSimulationUpdated`).

---

### 2.2. Компоненты ретро-интерфейса Win95 (`98.css`)

1. **`TitleBar.tsx` (Заголовок окна):**
   - Ретро-градиентная плашка заголовка Windows 95 (`.title-bar`).
   - Иконка схемы EWB и название активного файла схемы (`SpiceBench - [Untitled.ewb.json]`).
   - Кнопки управления окном (Minimize, Maximize, Close).

2. **`MenuBar.tsx` (Главное меню):**
   - Классическая компоновка меню: **File**, **Edit**, **Circuit**, **Analysis**, **Help**.
   - Поддержка горячих клавиш (Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+R, Delete, F5).
   - Выпадающие списки в стиле Windows 95 с разделителями и быстрой загрузкой эталонных схем (Sample Circuits).

3. **`ToolBar.tsx` (Панель инструментов и тумблер питания):**
   - Кнопки быстрых действий: New, Open, Save, Cut, Copy, Paste, Rotate, Delete, Zoom In, Zoom Out, Zoom 100%.
   - **Двухпозиционный тумблер питания EWB (0 / 1):** аутентичный горизонтальный переключатель-рокер.
   - **Красный светодиодный индикатор (LED):**
     - Погасший тёмно-красный (`#400000`) при выключенном питании (`0`).
     - Ярко-красный горящий (`#ff0000`) с эффектом свечения при активной симуляции (`1`).
   - Бейдж статуса симуляции (`SIM ACTIVE` / `STANDBY`).

4. **`PartsBin.tsx` (Полка компонентов EWB 5.12):**
   - Вкладки категорий Windows 95:
     - **Sources:** Ground (⏚), DC Voltage Source (🔋), AC Voltage Source (⚡), DC Current Source (➔).
     - **Basic:** Resistor (∿), Capacitor (⫠), Polarized Capacitor (⫡), Inductor (∱), Switch SPST (⌿), Potentiometer (⌥).
     - **Diodes:** Diode (▷|), Zener Diode (▷⫾), LED (▷|⇗).
     - **Transistors:** BJT NPN (◓), BJT PNP (◑).
     - **Instruments:** Multimeter (📟), Function Generator (📈), Oscilloscope (📺), Bode Plotter (📉).
   - Кнопки деталей с пиктограммами и подписями.

5. **`StatusBar.tsx` (Строка состояния):**
   - Секции с утопленными рамками Win95 (`status-bar-field`).
   - Текущие координаты курсора на координатной сетке: `Grid: X, Y`.
   - Статус симулятора: `Ready`, `Simulating...`, `Error: ...`.
   - Счётчик элементов: `Parts: N | Wires: M`.
   - Состояние тумблера: `Power: OFF / ON`.
   - Адрес встроенного MCP-сервера: `MCP: localhost:7420`.

---

### 2.3. Векторный холст схемы (Canvas & Schematic Symbols)

1. **`Canvas.tsx` (Монтажное поле):**
   - Белый фон с точечной координатной сеткой шагом **20px** (`<pattern id="grid-dots">`).
   - **Панорамирование (Pan):** зажатие левой кнопки мыши на свободном поле холста и перетаскивание.
   - **Масштабирование (Zoom):** вращение колеса мыши с центрированием относительно положения курсора (диапазон от 25% до 400%).
   - Отрисовка ортогональных проводов с закруглёнными изгибами и акцентным цветом (#000000).
   - Отрисовка точек соединений (**Junction Dots**) диаметром 4px в местах электрических разветвлений.
   - Отображение активных напряжений (**Pin Voltage Badges**) прямо на схеме при включении питания (зелёные бейджи с форматом `0.000 V`).
   - Выделение активного компонента синей рамкой при клике.

2. **`SchematicSymbol.tsx` (Векторные символы компонентов):**
   - Полная реализация точных SVG-символов для всех **21 типа компонентов**:
     - *Пассивные элементы:* Резистор (зигзаг), Конденсатор, Конденсатор электролитический (+), Индуктивность (дуги), Ключ SPST, Потенциометр.
     - *Источники:* Земля (Ground), Источник постоянного напряжения (DC), Источник переменного напряжения (AC), Источник тока.
     - *Полупроводники:* Диод, Стабилитрон (Zener), Светодиод (LED со стрелками излучения), Транзисторы BJT NPN и BJT PNP со стрелками эмиттера.
     - *Аналоговые микросхемы:* Идеальный ОУ (треугольник с входами `+` и `-`), ОУ 741.
     - *Виртуальные приборы:* Мультиметр, Функциональный генератор, Двухканальный осциллограф, Плоттер Боде.
   - Поддержка поворота символов на 0°, 90°, 180°, 270° с сохранением горизонтальной ориентации текстовых меток.
   - Отображение позиционного обозначения (Reference Designator, например `R1`, `C1`) синим цветом и номинала/параметра (`10k`, `1uF`) серым цветом.

---

## 3. Команды разработки, тестирования и сборки

Все команды выполняются из корня репозитория или директории `apps/desktop`.

### 3.1. Запуск десктопного приложения в режиме разработки
```bash
# Запуск Vite Dev Server + Electron Main Process с горячей перезагрузкой
pnpm --filter @spicebench/desktop dev

# Или короткий синтаксис фильтра:
pnpm --filter desktop dev
```

### 3.2. Проверка типов и линтинг
```bash
# Проверка типов TypeScript во всех пакетах монорепозитория
pnpm typecheck

# Проверка типов только в desktop:
pnpm --filter @spicebench/desktop typecheck

# Полная проверка проекта через ESLint (должно быть 0 ошибок)
pnpm lint
```

### 3.3. Запуск автоматических тестов
```bash
# Запуск всех 18 тестовых файлов монорепозитория (core, sim, mcp, desktop)
pnpm test

# Запуск тестов только пакета desktop:
pnpm --filter @spicebench/desktop test
```

### 3.4. Сборка пакета и бинарников
```bash
# Сборка пакета desktop (Vite компилирует Renderer в dist/, Electron в dist-electron/)
pnpm --filter @spicebench/desktop build

# Полная сборка всех пакетов монорепозитория
pnpm build
```

---

## 4. Особенности конфигурации и решение проблем (Troubleshooting)

### 4.1. Разрешение скриптов сборки в pnpm 10/11+ (`allowBuilds`)
Начиная с версий `pnpm` 10+, нативные скрипты установки пакетов (`postinstall`) по умолчанию блокируются из соображений безопасности. Для работы `electron` (скачивание платформенного бинарника) и `esbuild` в корневом [pnpm-workspace.yaml](file:///Users/master/Projects/spicebench/pnpm-workspace.yaml) задана конфигурация:
```yaml
allowBuilds:
  electron: true
  esbuild: true
```
Если при чистой установке `pnpm install` возникает `[ERR_PNPM_IGNORED_BUILDS]`, это означает, что пакет не внесен в `allowBuilds`.

### 4.2. Предупреждение `Failed to create bin at ... packages/mcp/dist/cli.js`
Возникает, если `pnpm install` пытается создать символические ссылки на CLI-утилиту пакета `@spicebench/mcp` до его сборки. 
**Решение:** выполнить сборку пакета перед созданием ссылок:
```bash
pnpm --filter @spicebench/mcp build
```

### 4.3. Игнорирование сгенерированных файлов Electron в ESLint и Git
Директория `apps/desktop/dist-electron/` содержит скомпилированный бандл главного процесса и `preload`.
- В [.gitignore](file:///Users/master/Projects/spicebench/.gitignore) добавлено: `dist-electron/`.
- В [eslint.config.mjs](file:///Users/master/Projects/spicebench/eslint.config.mjs) в массив `ignores` добавлено: `"**/dist-electron/**"`.
