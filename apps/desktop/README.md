# @spicebench/desktop

Десктопное приложение **SpiceBench**, воспроизводящее классический симулятор схем **Electronics Workbench 5.12** в стиле Windows 95 на стеке **Electron + React + Vite + 98.css**.

---

## Что реализовано

1. **Архитектура Electron Main / Preload / Renderer:**
   - [electron/main.ts](file:///Users/master/Projects/spicebench/apps/desktop/electron/main.ts): держит единственный экземпляр `CircuitSession` (`@spicebench/mcp`), управляющий схемой, топологией и расчётами `ngspice`.
   - [electron/preload.ts](file:///Users/master/Projects/spicebench/apps/desktop/electron/preload.ts) и [src/types/ipc.ts](file:///Users/master/Projects/spicebench/apps/desktop/src/types/ipc.ts): типизированный `contextBridge` (`window.spicebenchApi`).
   - Реактивная рассылка событий `spicebench:circuit-updated` и `spicebench:simulation-updated`.
2. **Компоненты интерфейса Win95 (`98.css`):**
   - [TitleBar.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/TitleBar.tsx) — аутентичный заголовок Win95 с иконкой и кнопками управления.
   - [MenuBar.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/MenuBar.tsx) — меню File, Edit, Circuit, Analysis, Help, горячие клавиши и загрузка примеров.
   - [ToolBar.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/ToolBar.tsx) — двухпозиционный тумблер питания 0/1 и красный LED-индикатор симуляции.
   - [PartsBin.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/PartsBin.tsx) — полки деталей по 5 вкладкам (Sources, Basic, Diodes, Transistors, Instruments).
   - [StatusBar.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/StatusBar.tsx) — координаты курсора по сетке, статус расчёта, число деталей/проводов, порт MCP.
3. **Векторный SVG-холст:**
   - [Canvas.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/Canvas.tsx) — дискретная точечная сетка 20px, панорамирование (Drag), зум (колесо мыши), ортогональные провода, соединительные точки (Junctions) и бейджи узловых напряжений.
   - [SchematicSymbol.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/SchematicSymbol.tsx) — векторные символы для всех 21 компонентов со схематическими обозначениями и вращением (0°, 90°, 180°, 270°).

---

## Команды разработки и сборки

Все команды запускаются через `pnpm` из корня проекта:

```bash
# Режим разработки (Vite Dev Server + запуск Electron)
pnpm --filter @spicebench/desktop dev

# Сборка пакета (компиляция Vite Renderer в dist/ и Electron Main в dist-electron/)
pnpm --filter @spicebench/desktop build

# Проверка типов TypeScript
pnpm --filter @spicebench/desktop typecheck

# Запуск юнит-тестов (SVG-рендер символов, контракт IPC)
pnpm --filter @spicebench/desktop test
```

### Команды монорепозитория
```bash
# Проверка типов во всех 4 пакетах
pnpm typecheck

# Полная проверка линтером
pnpm lint

# Запуск всех 18 тестовых файлов (94 теста)
pnpm test

# Полная сборка всех пакетов
pnpm build
```

---

## Важные нюансы сборки

1. **pnpm allowBuilds:** В pnpm v10+ для загрузки нативного бинарника Electron в [pnpm-workspace.yaml](file:///Users/master/Projects/spicebench/pnpm-workspace.yaml) прописано:
   ```yaml
   allowBuilds:
     electron: true
     esbuild: true
   ```
2. **Зависимость от @spicebench/mcp:** Пакет `@spicebench/mcp` должен быть собран (`pnpm --filter @spicebench/mcp build`) перед сборкой desktop, так как десктопный бэкенд использует его контроллер сессии.
