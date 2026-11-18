# HANDOFF — Оперативный статус проекта

- **Последнее обновление:** завершён пункт 1.3 (ортогональный Manhattan-маршрутизатор проводов A*, система Undo/Redo на паттерне Command)
- **Текущая фаза:** Фаза 1 — Ядро схемы и графа (`packages/core`)
- **Последний коммит:** `42e05aa` (feat(core): implement orthogonal Manhattan router and Undo/Redo command stack (Phase 1.3))

## Что сделано
- **Manhattan Router (`packages/core/src/router`):**
  - Алгоритм A* поиска ортогональных путей на дискретной сетке с бинарной кучей `MinHeap`.
  - Штрафы за изгибы (минимизация числа поворотов L/Z-трасс).
  - Огибание габаритов компонентов как физических препятствий на монтажном поле.
- **Undo/Redo & Command Pattern (`packages/core/src/commands`):**
  - Интерфейс `Command` и стек `CommandManager` с поддержкой лимита истории, `canUndo`/`canRedo`.
  - Реализованы команды: `AddComponentCommand`, `RemoveComponentCommand` (с каскадным восстановлением связей), `MoveComponentCommand`, `RotateComponentCommand`, `UpdateComponentParamsCommand`, `ConnectWireCommand`, `RemoveWireCommand`, `SplitWireCommand`, `BatchCommand`.
- **Тестирование:**
  - Добавлены тесты `manhattan-router.test.ts` и `command-manager.test.ts` (14 новых тестов).

## Состояние проверок
- `typecheck`: пройден (`tsc --noEmit` во всех 4 пакетах)
- `lint`: пройден (`eslint .`)
- `test`: пройден (`vitest run` — 12 тестовых файлов, **62/62 tests passing**)

## Известные проблемы и нюансы
- Маршрутизатор по умолчанию резервирует габариты $\pm 1$ вокруг центра деталей; при плотной компоновке можно передавать `ignoredComponentIds`.

## Следующий шаг
Выполнить **Пункт 1.4** ([docs/ROADMAP.md](file:///Users/master/Projects/spicebench/docs/ROADMAP.md#L27-L29)):
1. Реализовать валидатор топологии `TopologyValidator` в `packages/core/src/validator`:
   - `FLOATING_NODE` (висячие узлы и неподключённые пины)
   - `NO_GROUND` (отсутствие обязательного опорного узла земли)
   - `VOLTAGE_SOURCE_LOOP` (параллельное короткое замыкание источников напряжения)
   - `NO_DC_PATH_TO_GROUND` (узлы, изолированные по постоянному току)
2. Покрыть эталонными негативными и позитивными тестами Vitest. Завершить Фазу 1.
