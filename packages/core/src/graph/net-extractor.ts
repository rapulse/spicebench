import { CircuitGraph } from "./circuit-graph";
import { PinEndpoint } from "../schema/wire";
import { getComponentPins } from "../schema/component";

export interface ElectricalNet {
  id: string; // "0" for ground net, or "N1", "N2", etc.
  spiceNodeName: string; // "0" for ground, "N001", "N002", etc.
  isGround: boolean;
  pins: PinEndpoint[];
  junctions: string[];
  wires: string[];
}

export class NetExtractor {
  /**
   * Extracts all connected electrical nets from the circuit graph.
   * Deterministically assigns "0" to the net containing Ground,
   * and "N001", "N002", ... to other nets.
   */
  public static extractNets(graph: CircuitGraph): ElectricalNet[] {
    // String identifier for an endpoint: "pin:R1:1" or "junc:J1"
    const endpointKey = (ep: { componentId: string; pinId: string } | { junctionId: string }): string => {
      if ("componentId" in ep) return `pin:${ep.componentId}:${ep.pinId}`;
      return `junc:${ep.junctionId}`;
    };

    // Adjacency list: nodeKey -> set of { neighborKey, wireId }
    const adj = new Map<string, Array<{ neighbor: string; wireId: string }>>();

    const addEdge = (u: string, v: string, wireId: string) => {
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u)!.push({ neighbor: v, wireId });
      adj.get(v)!.push({ neighbor: u, wireId });
    };

    // Connect endpoints according to wires
    for (const wire of graph.getAllWires()) {
      const u = endpointKey(wire.from);
      const v = endpointKey(wire.to);
      addEdge(u, v, wire.id);
    }

    // Register all pins of all components in the graph
    for (const comp of graph.getAllComponents()) {
      const pins = getComponentPins(comp.type);
      for (const p of pins) {
        const key = endpointKey({ componentId: comp.id, pinId: p.id });
        if (!adj.has(key)) {
          adj.set(key, []);
        }
      }
    }

    for (const junc of graph.getAllJunctions()) {
      const key = endpointKey({ junctionId: junc.id });
      if (!adj.has(key)) {
        adj.set(key, []);
      }
    }

    const visited = new Set<string>();
    const rawNets: Array<{
      pins: PinEndpoint[];
      junctions: string[];
      wires: Set<string>;
      isGround: boolean;
    }> = [];

    for (const node of adj.keys()) {
      if (visited.has(node)) continue;

      // Start BFS from this node
      const queue: string[] = [node];
      visited.add(node);

      const netPins: PinEndpoint[] = [];
      const netJunctions: string[] = [];
      const netWires = new Set<string>();
      let hasGround = false;

      while (queue.length > 0) {
        const curr = queue.shift()!;

        if (curr.startsWith("pin:")) {
          const parts = curr.split(":");
          const componentId = parts[1]!;
          const pinId = parts[2]!;
          netPins.push({ componentId, pinId });

          const comp = graph.getComponent(componentId);
          if (comp && comp.type === "GROUND") {
            hasGround = true;
          }
        } else if (curr.startsWith("junc:")) {
          const junctionId = curr.split(":")[1]!;
          netJunctions.push(junctionId);
        }

        const neighbors = adj.get(curr) || [];
        for (const { neighbor, wireId } of neighbors) {
          netWires.add(wireId);
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      rawNets.push({
        pins: netPins,
        junctions: netJunctions,
        wires: netWires,
        isGround: hasGround,
      });
    }

    // Sort nets: Ground net comes first, then sort by first component ID deterministically
    rawNets.sort((a, b) => {
      if (a.isGround && !b.isGround) return -1;
      if (!a.isGround && b.isGround) return 1;
      const aFirst = a.pins[0]?.componentId ?? "";
      const bFirst = b.pins[0]?.componentId ?? "";
      return aFirst.localeCompare(bFirst);
    });

    let nodeCounter = 1;
    const result: ElectricalNet[] = [];

    for (const raw of rawNets) {
      const isGround = raw.isGround;
      const id = isGround ? "0" : `N${nodeCounter}`;
      const spiceNodeName = isGround
        ? "0"
        : `N${String(nodeCounter).padStart(3, "0")}`;

      if (!isGround) {
        nodeCounter++;
      }

      result.push({
        id,
        spiceNodeName,
        isGround,
        pins: raw.pins,
        junctions: raw.junctions,
        wires: Array.from(raw.wires),
      });
    }

    return result;
  }
}
