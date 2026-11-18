# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** завершена Фаза 1 (ядро схемы, граф, Manhattan router, Undo/Redo, валидатор топологии в `packages/core`)
- **Текущая фаза:** Фаза 2 — Генератор SPICE и симулятор (`packages/sim`)
- **Последний коммит:** `62dd95b` (feat(core): implement topology validator and complete Phase 1)

## Что сделано
- **Фаза 1 полностью завершена:**
  - `packages/core/src/schema`: Zod-схема `.ewb.json`, каталог 21 компонента, парсер инженерных единиц (`10M` -> `10meg`).
  - `packages/core/src/graph`: `CircuitGraph` (CRUD, перемещение, поворот, каскадные удаления), Т-образное авторазбиение проводов (`splitWireAt`, `connectToWireAt`), `NetExtractor` (BFS-извлечение эквипотенциальных узлов SPICE).
  - `packages/core/src/router`: `ManhattanRouter` (алгоритм A* с минимизацией изгибов и огибанием габаритов компонентов).
  - `packages/core/src/commands`: стек Undo/Redo (`CommandManager`, `AddComponentCommand`, `RemoveComponentCommand`, `MoveComponentCommand`, `RotateComponentCommand`, `ConnectWireCommand`, `RemoveWireCommand`, `SplitWireCommand`, `BatchCommand`).
  - `packages/core/src/validator`: `TopologyValidator` (проверка `NO_GROUND`, `FLOATING_NODE`, `VOLTAGE_SOURCE_LOOP`, `NO_DC_PATH_TO_GROUND`, `EMPTY_CIRCUIT`).
- **Тестирование:** 13 тестовых файлов, **69/69 passing tests**.

## Состояние проверок
- `typecheck`: пройден (`tsc --noEmit` во всех 4 пакетах)
- `lint`: пройден (`eslint .`)
- `test`: пройден (`vitest run` — 69 тестов passing)

## Известные проблемы и нюансы
- `packages/core` на 100% автономен (0 зависимостей от DOM, React, Electron и FS).

## Следующий шаг
Выполнить **Пункт 2.1** ([docs/ROADMAP.md](file:///Users/master/Projects/spicebench/docs/ROADMAP.md#L34-L36)):
1. Реализовать транслятор JSON-графа цепи в SPICE-нетлист в `packages/sim/src/compiler`:
   - трансляция узлов в детерминированные метки SPICE (земля -> `0`, остальные `N001`...);
   - компиляция базовых элементов (R, C, L, диоды, источники DC/AC/Pulse, земля);
   - трансляция директив анализа (`.op`, `.dc`, `.tran`, `.ac`) по подключённым приборам.
2. Актуализировать `docs/wiki/spice-mapping.md` и покрыть тестами компилятор нетлистов в Vitest.
