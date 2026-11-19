# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** завершена Фаза 6 (Виртуальные приборы EWB, шаги 6.1–6.4)
- **Текущая фаза:** Фаза 6 завершена [x] -> переход к Фазе 7 (Живая синхронизация MCP и релизная сборка)
- **Главный визуальный эталон:** [IMG_6708.jpg](file:///Users/master/Projects/spicebench/electronics-workbench/IMG_6708.jpg)

## Что сделано в Фазе 6
- **Плавающие окна приборов (6.1):**
  - Создан компонент [InstrumentWindow.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/InstrumentWindow.tsx) в стиле Win95 с перетаскиванием за заголовок, кнопками закрытия/сворачивания и сохранением координат `windowPosition` в модели схемы.
  - Двойной клик на приборе на холсте разворачивает соответствующее окно.
- **Мультиметр и Функциональный генератор (6.2):**
  - [MultimeterPanel.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/instruments/MultimeterPanel.tsx): 7-сегментный цифровой LCD-экран, переключение режимов `V` / `A` / `Ω` / `dB` и тока `DC` / `AC`, чтение реальных напряжений и токов из расчётов `ngspice`.
  - [FunctionGeneratorPanel.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/instruments/FunctionGeneratorPanel.tsx): выбор формы сигнала (синус, треугольник, меандр), частоты, скважности, амплитуды и постоянного смещения.
- **Двухканальный осциллограф на HTML5 Canvas (6.3):**
  - [OscilloscopePanel.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/instruments/OscilloscopePanel.tsx): электронно-лучевая трубка (10x8 сетка делений), развёртка времени (s, ms, µs, ns / div), масштабы каналов A и B (V, mV / div), Y-позиция, переключение связи `DC` / `0` / `AC`, режим синхронизации/триггера (`Auto`, `Normal`, фронт `+`/`-`).
- **Плоттер Боде на HTML5 Canvas (6.4):**
  - [BodePlotterPanel.tsx](file:///Users/master/Projects/spicebench/apps/desktop/src/components/instruments/BodePlotterPanel.tsx): построение амплитудно-частотной (дБ) и фазо-частотной (градусы) характеристик с логарифмической шкалой частот, интерактивным курсором и расчётом среза.
- **Исправление бандлинга Electron Preload:**
  - Настроен вывод CJS (`preload.cjs`) в [vite.config.ts](file:///Users/master/Projects/spicebench/apps/desktop/vite.config.ts), что полностью устранило ошибку `SyntaxError: Cannot use import statement outside a module`.

## Проверка и снимки экрана
- `pnpm typecheck`: 0 ошибок во всех 4 пакетах.
- `pnpm lint`: 0 предупреждений и ошибок (ESLint).
- `pnpm test`: 18 тестовых файлов, **105 из 105 тестов пройдены**.
- Сгенерированы реальные Retina-скриншоты запущенного Electron-приложения:
  - [spicebench_live_preview.png](file:///Users/master/Projects/spicebench/electronics-workbench/spicebench_live_preview.png): схема делителя напряжения с открытым Мультиметром.
  - [spicebench_live_simulation.png](file:///Users/master/Projects/spicebench/electronics-workbench/spicebench_live_simulation.png): результат активного моделирования (+3.0000 V на мультиметре).
  - [spicebench_live_oscilloscope.png](file:///Users/master/Projects/spicebench/electronics-workbench/spicebench_live_oscilloscope.png): схема RC-цепи с открытым CRT-осциллографом.

## Следующий шаг
Перейти к **Фазе 7. Живая синхронизация MCP и кроссплатформенная сборка** ([docs/ROADMAP.md](file:///Users/master/Projects/spicebench/docs/ROADMAP.md#L92-L101)):
1. **7.1.** Связать MCP-сервер с Electron Main по HTTP/stdio и транслировать изменения агента в Renderer через IPC.
2. **7.2.** Добавить статус MCP-сервера в статус-бар и диалог параметров подключения.
3. **7.3.** Настроить сборку `electron-builder` для macOS и Windows.
