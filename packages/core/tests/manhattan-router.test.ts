import { describe, it, expect } from "vitest";
import { ManhattanRouter } from "../src/router/manhattan-router";
import { CircuitGraph } from "../src/graph/circuit-graph";
import { createDefaultComponent } from "../src/schema/component";
import { isOrthogonalWire } from "../src/schema/wire";

describe("ManhattanRouter (A* Orthogonal Wire Pathfinder)", () => {
  it("routes straight line when points are aligned horizontally", () => {
    const start = { x: 5, y: 10 };
    const end = { x: 25, y: 10 };

    const route = ManhattanRouter.route(start, end);
    expect(route).toEqual([start, end]);
    expect(
      isOrthogonalWire({
        id: "W_test",
        from: { componentId: "A", pinId: "1" },
        to: { componentId: "B", pinId: "1" },
        points: route,
      }),
    ).toBe(true);
  });

  it("routes straight line when points are aligned vertically", () => {
    const start = { x: 10, y: 5 };
    const end = { x: 10, y: 35 };

    const route = ManhattanRouter.route(start, end);
    expect(route).toEqual([start, end]);
    expect(
      isOrthogonalWire({
        id: "W_test",
        from: { componentId: "A", pinId: "1" },
        to: { componentId: "B", pinId: "1" },
        points: route,
      }),
    ).toBe(true);
  });

  it("routes with minimum bends (L-route) in unobstructed space", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 10 };

    const route = ManhattanRouter.route(start, end);
    expect(route.length).toBe(3); // start -> corner -> end
    expect(route[0]).toEqual(start);
    expect(route[route.length - 1]).toEqual(end);
    expect(
      isOrthogonalWire({
        id: "W_test",
        from: { componentId: "A", pinId: "1" },
        to: { componentId: "B", pinId: "1" },
        points: route,
      }),
    ).toBe(true);
  });

  it("paths around an obstacle component placed directly on the straight path", () => {
    const graph = new CircuitGraph();
    // Place a resistor right in the middle at {10, 10}
    const obstacleRes = createDefaultComponent("RESISTOR", "R_OBS", { x: 10, y: 10 });
    graph.addComponent(obstacleRes);

    const start = { x: 0, y: 10 };
    const end = { x: 20, y: 10 };

    const route = ManhattanRouter.route(start, end, graph);

    // Route must not pass through {10, 10}
    const passesThroughObstacle = route.some((p) => p.x === 10 && p.y === 10);
    expect(passesThroughObstacle).toBe(false);

    // Route must start and end correctly
    expect(route[0]).toEqual(start);
    expect(route[route.length - 1]).toEqual(end);

    // All segments in route must be strictly orthogonal
    expect(
      isOrthogonalWire({
        id: "W_test",
        from: { componentId: "A", pinId: "1" },
        to: { componentId: "B", pinId: "1" },
        points: route,
      }),
    ).toBe(true);
  });
});
