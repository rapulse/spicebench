# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** полностью завершена Фаза 2 (SPICE-генератор, ngspice/MNA раннер, Worker таймаут, Golden Fixtures)
- **Текущая фаза:** Фаза 3 — Автономный MCP-сервер (`packages/mcp`)
- **Последний коммит:** `8d49eff` (документация 2.1)

## Что сделано в Фазе 2
- **Транслятор в SPICE-нетлист (`packages/sim/src/compiler`):**
  - Полная поддержка 21 компонента EWB, защита `meg` vs `m`, генерация директив `.op`, `.dc`, `.tran`, `.ac`.
  - Встроенные модели диодов и транзисторов (1N4148, 2N3904, 2N3906, BZX55C5V1, LED).
- **Движок симуляции и Worker-изоляция (`packages/sim/src/runner`):**
  - `SpiceRunner`: запуск в фоновом Node `Worker` с жёстким сторожевым таймаутом (5 с) и аварийным перезапуском.
  - Поддержка нативного `ngspice` (`NativeNgspiceEngine`) и чистого TypeScript MNA-движка (`BuiltinMnaEngine`) для мгновенных автономных тестов без хостовых зависимостей.
- **Парсер результатов (`packages/sim/src/parser`):**
  - `SpiceRawParser`: бинарный/текстовый парсер SPICE rawfile для режимов `.op`, `.dc`, `.tran`, `.ac` (dB, phase, комплексные значения).
  - `SpiceStdoutParser`: табличный парсер stdout и диагност ошибок с извлечением проблемных узлов и элементов.
- **Эталонные схемы (Golden Fixtures — `packages/sim/tests/golden-fixtures.test.ts`):**
  - Делитель напряжения (OP & Branch Current) — расхождение < 0.001%.
  - Переходный процесс в RC-цепи ($\tau = 1\text{ms}$) — соответствие аналитике $V(t) = V_s(1 - e^{-t/\tau})$ с погрешностью < 0.3%.
  - Резонанс в RLC-цепи ($f_0 = 1\text{kHz}, Q = 6.283$) — точное совпадение пика АЧХ и добротности.
  - Структурированная локализация ошибок SPICE.

## Состояние проверок
- `typecheck`: пройден (`pnpm typecheck` во всех 4 пакетах)
- `lint`: пройден (`pnpm lint` — 0 предупреждений)
- `test`: пройден (`pnpm test` — 17 тестовых файлов, **87/87 passing tests**)

## Известные проблемы и нюансы
- В macOS вызов `git` требует использовать `/Library/Developer/CommandLineTools/usr/bin/git`.
- В `BuiltinMnaEngine` директива `.options` отделена от префикса `.op` через строгие регулярные выражения.

## Следующий шаг
Перейти к **Фазе 3.1 & 3.2** ([docs/ROADMAP.md](file:///Users/master/Projects/spicebench/docs/ROADMAP.md#L44-L54)):
1. Подключить `@modelcontextprotocol/sdk` в `packages/mcp`.
2. Реализовать транспорты `stdio` и локальный Streamable HTTP.
3. Реализовать MCP-инструменты управления схемой и симуляцией (`get_circuit_state`, `place_component`, `connect_pins`, `validate_circuit`, `run_simulation`, `read_instrument`).
