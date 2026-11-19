import { Position, normalizeRotation } from "../schema/geometry";
import { Component, getAbsolutePinPosition, getComponentPin, getComponentPins } from "../schema/component";
import {
  Wire,
  WireEndpoint,
  Junction,
  isPinEndpoint,
  isJunctionEndpoint,
  PinEndpoint,
} from "../schema/wire";
import { InstrumentState } from "../schema/instrument";
import { CircuitMetadata, CircuitProject, CURRENT_SCHEMA_VERSION } from "../schema/circuit";
import {
  findSegmentOnWire,
  isPointsEqual,
  simplifyOrthogonalPoints,
  createSimpleOrthogonalRoute,
} from "./geometry-utils";

export class CircuitGraph {
  public schemaVersion: typeof CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  public meta: CircuitMetadata;

  private components = new Map<string, Component>();
  private wires = new Map<string, Wire>();
  private junctions = new Map<string, Junction>();
  private instruments = new Map<string, InstrumentState>();

  private nextWireIndex = 1;
  private nextJunctionIndex = 1;

  constructor(initialProject?: CircuitProject) {
    if (initialProject) {
      this.schemaVersion = initialProject.schemaVersion;
      this.meta = { ...initialProject.meta };
      for (const comp of initialProject.components) {
        this.components.set(comp.id, { ...comp });
      }
      for (const wire of initialProject.wires) {
        this.wires.set(wire.id, { ...wire, points: wire.points.map((p) => ({ ...p })) });
      }
      for (const junc of initialProject.junctions) {
        this.junctions.set(junc.id, { ...junc });
      }
      for (const inst of initialProject.instruments) {
        this.instruments.set(inst.instrumentId, { ...inst });
      }
      this.recalculateNextIndices();
    } else {
      const now = new Date().toISOString();
      this.meta = {
        name: "Untitled Circuit",
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  public static fromProject(project: CircuitProject): CircuitGraph {
    return new CircuitGraph(project);
  }

  public toProject(): CircuitProject {
    return {
      schemaVersion: this.schemaVersion,
      meta: {
        ...this.meta,
        updatedAt: new Date().toISOString(),
      },
      components: Array.from(this.components.values()).map((c) => ({ ...c })),
      wires: Array.from(this.wires.values()).map((w) => ({
        ...w,
        points: w.points.map((p) => ({ ...p })),
      })),
      junctions: Array.from(this.junctions.values()).map((j) => ({ ...j })),
      instruments: Array.from(this.instruments.values()).map((i) => ({ ...i })),
    };
  }

  public clone(): CircuitGraph {
    return new CircuitGraph(this.toProject());
  }

  // --- IDs and Indices ---
  private recalculateNextIndices(): void {
    for (const id of this.wires.keys()) {
      const match = id.match(/^[Ww](\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num >= this.nextWireIndex) this.nextWireIndex = num + 1;
      }
    }
    for (const id of this.junctions.keys()) {
      const match = id.match(/^[Jj](\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num >= this.nextJunctionIndex) this.nextJunctionIndex = num + 1;
      }
    }
  }

  public generateWireId(): string {
    let id = `W${this.nextWireIndex++}`;
    while (this.wires.has(id)) {
      id = `W${this.nextWireIndex++}`;
    }
    return id;
  }

  public generateJunctionId(): string {
    let id = `J${this.nextJunctionIndex++}`;
    while (this.junctions.has(id)) {
      id = `J${this.nextJunctionIndex++}`;
    }
    return id;
  }

  // --- Components ---
  public getComponent(id: string): Component | undefined {
    return this.components.get(id);
  }

  public getAllComponents(): Component[] {
    return Array.from(this.components.values());
  }

  public addComponent(component: Component): void {
    if (this.components.has(component.id)) {
      throw new Error(`Component with ID "${component.id}" already exists`);
    }
    this.components.set(component.id, { ...component });
  }

  public updateComponent(id: string, updates: Partial<Omit<Component, "id">>): Component {
    const existing = this.components.get(id);
    if (!existing) {
      throw new Error(`Component "${id}" not found`);
    }

    const updated: Component = {
      ...existing,
      ...updates,
      params: { ...existing.params, ...(updates.params ?? {}) },
    };

    if (updates.rotation !== undefined) {
      updated.rotation = normalizeRotation(updates.rotation);
    }

    this.components.set(id, updated);

    // If position or rotation changed, adjust connected wires' terminal points
    if (updates.position !== undefined || updates.rotation !== undefined) {
      this.updateConnectedWireTerminals(id);
    }

    return updated;
  }

  public moveComponent(id: string, newPosition: Position): Component {
    return this.updateComponent(id, { position: newPosition });
  }

  public rotateComponent(id: string, deltaAngle: 90 | 180 | 270 = 90): Component {
    const existing = this.components.get(id);
    if (!existing) {
      throw new Error(`Component "${id}" not found`);
    }
    const newRotation = normalizeRotation(existing.rotation + deltaAngle);
    return this.updateComponent(id, { rotation: newRotation });
  }

  public removeComponent(id: string): { removedComponent: Component; removedWires: Wire[] } {
    const comp = this.components.get(id);
    if (!comp) {
      throw new Error(`Component "${id}" not found`);
    }

    this.components.delete(id);

    // Remove all wires connected to this component
    const removedWires: Wire[] = [];
    for (const wire of Array.from(this.wires.values())) {
      const fromAttached = isPinEndpoint(wire.from) && wire.from.componentId === id;
      const toAttached = isPinEndpoint(wire.to) && wire.to.componentId === id;

      if (fromAttached || toAttached) {
        this.wires.delete(wire.id);
        removedWires.push(wire);
      }
    }

    // Clean up any junctions that became orphaned
    this.cleanupOrphanJunctions();

    return { removedComponent: comp, removedWires };
  }

  // --- Wires ---
  public getWire(id: string): Wire | undefined {
    return this.wires.get(id);
  }

  public getAllWires(): Wire[] {
    return Array.from(this.wires.values());
  }

  public addWire(wire: Wire): void {
    if (this.wires.has(wire.id)) {
      throw new Error(`Wire with ID "${wire.id}" already exists`);
    }
    this.validateEndpoint(wire.from);
    this.validateEndpoint(wire.to);
    this.wires.set(wire.id, {
      ...wire,
      points: wire.points.map((p) => ({ ...p })),
    });
  }

  public connectPins(
    from: PinEndpoint,
    to: PinEndpoint,
    customPoints?: Position[],
    color?: string,
  ): Wire {
    const fromPos = this.getEndpointPosition(from);
    const toPos = this.getEndpointPosition(to);

    const points = customPoints
      ? customPoints.map((p) => ({ ...p }))
      : createSimpleOrthogonalRoute(fromPos, toPos);

    const wire: Wire = {
      id: this.generateWireId(),
      from: { ...from },
      to: { ...to },
      points,
      color,
    };

    this.addWire(wire);
    return wire;
  }

  public connectEndpoints(
    from: WireEndpoint,
    to: WireEndpoint,
    customPoints?: Position[],
    color?: string,
  ): Wire {
    const fromPos = this.getEndpointPosition(from);
    const toPos = this.getEndpointPosition(to);

    const points = customPoints
      ? customPoints.map((p) => ({ ...p }))
      : createSimpleOrthogonalRoute(fromPos, toPos);

    const wire: Wire = {
      id: this.generateWireId(),
      from: { ...from },
      to: { ...to },
      points,
      color,
    };

    this.addWire(wire);
    return wire;
  }

  public removeWire(id: string): Wire {
    const wire = this.wires.get(id);
    if (!wire) {
      throw new Error(`Wire "${id}" not found`);
    }
    this.wires.delete(id);
    this.cleanupOrphanJunctions();
    return wire;
  }

  // --- Junctions & Wire Splitting ---
  public getJunction(id: string): Junction | undefined {
    return this.junctions.get(id);
  }

  public getAllJunctions(): Junction[] {
    return Array.from(this.junctions.values());
  }

  public addJunction(junction: Junction): void {
    if (this.junctions.has(junction.id)) {
      throw new Error(`Junction "${junction.id}" already exists`);
    }
    this.junctions.set(junction.id, { ...junction });
  }

  public removeJunction(id: string): Junction | undefined {
    const junction = this.junctions.get(id);
    if (junction) {
      this.junctions.delete(id);
    }
    return junction;
  }

  /**
   * Splits an existing wire at a specified point on its polyline,
   * inserting a Junction and creating two contiguous sub-wires.
   */
  public splitWireAt(
    wireId: string,
    splitPoint: Position,
  ): { junction: Junction; wire1: Wire; wire2: Wire } {
    const originalWire = this.wires.get(wireId);
    if (!originalWire) {
      throw new Error(`Wire "${wireId}" not found`);
    }

    const segInfo = findSegmentOnWire(originalWire, splitPoint);
    if (!segInfo) {
      throw new Error(
        `Split point (${splitPoint.x}, ${splitPoint.y}) does not lie on wire "${wireId}"`,
      );
    }

    const { segmentIndex, p1, p2 } = segInfo;

    // If splitPoint is exactly the start of the wire
    if (isPointsEqual(splitPoint, originalWire.points[0]!)) {
      if (isJunctionEndpoint(originalWire.from)) {
        const j = this.junctions.get(originalWire.from.junctionId);
        if (j) return { junction: j, wire1: originalWire, wire2: originalWire };
      }
    }

    // If splitPoint is exactly the end of the wire
    if (isPointsEqual(splitPoint, originalWire.points[originalWire.points.length - 1]!)) {
      if (isJunctionEndpoint(originalWire.to)) {
        const j = this.junctions.get(originalWire.to.junctionId);
        if (j) return { junction: j, wire1: originalWire, wire2: originalWire };
      }
    }

    // Create a new junction dot
    const junctionId = this.generateJunctionId();
    const junction: Junction = {
      id: junctionId,
      position: { ...splitPoint },
    };
    this.addJunction(junction);

    // Build points for wire1: from original start up to splitPoint
    const points1: Position[] = [];
    for (let i = 0; i <= segmentIndex; i++) {
      points1.push({ ...originalWire.points[i]! });
    }
    if (!isPointsEqual(p1, splitPoint)) {
      points1.push({ ...splitPoint });
    }

    // Build points for wire2: from splitPoint to original end
    const points2: Position[] = [];
    if (!isPointsEqual(splitPoint, p2)) {
      points2.push({ ...splitPoint });
    }
    for (let i = segmentIndex + 1; i < originalWire.points.length; i++) {
      points2.push({ ...originalWire.points[i]! });
    }

    const simplified1 = simplifyOrthogonalPoints(points1);
    const simplified2 = simplifyOrthogonalPoints(points2);

    const wire1: Wire = {
      id: originalWire.id, // preserve original ID for first part
      from: { ...originalWire.from },
      to: { junctionId },
      points: simplified1,
      color: originalWire.color,
    };

    const wire2: Wire = {
      id: this.generateWireId(),
      from: { junctionId },
      to: { ...originalWire.to },
      points: simplified2,
      color: originalWire.color,
    };

    // Replace original wire with wire1 and wire2
    this.wires.set(wire1.id, wire1);
    this.wires.set(wire2.id, wire2);

    return { junction, wire1, wire2 };
  }

  /**
   * Connects an endpoint (e.g. component pin) to a point on an existing wire.
   * Automatically splits the target wire with a Junction dot and connects the new wire.
   */
  public connectToWireAt(
    from: WireEndpoint,
    targetWireId: string,
    hitPoint: Position,
    color?: string,
  ): { junction: Junction; branchWire: Wire; wire1: Wire; wire2: Wire } {
    const { junction, wire1, wire2 } = this.splitWireAt(targetWireId, hitPoint);
    const fromPos = this.getEndpointPosition(from);
    const branchPoints = createSimpleOrthogonalRoute(fromPos, junction.position);

    const branchWire: Wire = {
      id: this.generateWireId(),
      from: { ...from },
      to: { junctionId: junction.id },
      points: branchPoints,
      color: color ?? wire1.color,
    };

    this.addWire(branchWire);

    return { junction, branchWire, wire1, wire2 };
  }

  // --- Endpoint Utilities ---
  public getEndpointPosition(endpoint: WireEndpoint): Position {
    if (isPinEndpoint(endpoint)) {
      const comp = this.components.get(endpoint.componentId);
      if (!comp) {
        throw new Error(`Component "${endpoint.componentId}" not found`);
      }
      return getAbsolutePinPosition(comp, endpoint.pinId);
    } else if (isJunctionEndpoint(endpoint)) {
      const junc = this.junctions.get(endpoint.junctionId);
      if (!junc) {
        throw new Error(`Junction "${endpoint.junctionId}" not found`);
      }
      return { ...junc.position };
    }
    throw new Error(`Unknown endpoint type`);
  }

  public validateEndpoint(endpoint: WireEndpoint): void {
    if (isPinEndpoint(endpoint)) {
      const comp = this.components.get(endpoint.componentId);
      if (!comp) {
        throw new Error(`Invalid wire endpoint: Component "${endpoint.componentId}" does not exist`);
      }
      const pin = getComponentPin(comp.type, endpoint.pinId);
      if (!pin) {
        throw new Error(
          `Invalid wire endpoint: Pin "${endpoint.pinId}" does not exist on component "${comp.id}"`,
        );
      }
    } else if (isJunctionEndpoint(endpoint)) {
      if (!this.junctions.has(endpoint.junctionId)) {
        throw new Error(`Invalid wire endpoint: Junction "${endpoint.junctionId}" does not exist`);
      }
    }
  }

  public getWiresConnectedToEndpoint(endpoint: WireEndpoint): Wire[] {
    const result: Wire[] = [];
    for (const wire of this.wires.values()) {
      if (this.isSameEndpoint(wire.from, endpoint) || this.isSameEndpoint(wire.to, endpoint)) {
        result.push(wire);
      }
    }
    return result;
  }

  public isSameEndpoint(a: WireEndpoint, b: WireEndpoint): boolean {
    if (isPinEndpoint(a) && isPinEndpoint(b)) {
      return a.componentId === b.componentId && a.pinId === b.pinId;
    }
    if (isJunctionEndpoint(a) && isJunctionEndpoint(b)) {
      return a.junctionId === b.junctionId;
    }
    return false;
  }

  private updateConnectedWireTerminals(componentId: string): void {
    const comp = this.components.get(componentId);
    if (!comp) return;

    for (const wire of this.wires.values()) {
      if (isPinEndpoint(wire.from) && wire.from.componentId === componentId) {
        const newPos = getAbsolutePinPosition(comp, wire.from.pinId);
        wire.points[0] = { ...newPos };
      }
      if (isPinEndpoint(wire.to) && wire.to.componentId === componentId) {
        const newPos = getAbsolutePinPosition(comp, wire.to.pinId);
        wire.points[wire.points.length - 1] = { ...newPos };
      }
    }
  }

  private cleanupOrphanJunctions(): void {
    const connectedCounts = new Map<string, number>();
    for (const junc of this.junctions.keys()) {
      connectedCounts.set(junc, 0);
    }

    for (const wire of this.wires.values()) {
      if (isJunctionEndpoint(wire.from)) {
        connectedCounts.set(
          wire.from.junctionId,
          (connectedCounts.get(wire.from.junctionId) ?? 0) + 1,
        );
      }
      if (isJunctionEndpoint(wire.to)) {
        connectedCounts.set(
          wire.to.junctionId,
          (connectedCounts.get(wire.to.junctionId) ?? 0) + 1,
        );
      }
    }

    for (const [juncId, count] of connectedCounts.entries()) {
      if (count < 2) {
        // Less than 2 wires attached means it's no longer a junction branching point
        this.junctions.delete(juncId);
      }
    }
  }

  // --- Hit Testing ---
  public findComponentAt(point: Position): Component | undefined {
    // A point hits a component if it's within its bounding box (e.g. +/- 2 units from center)
    for (const comp of this.components.values()) {
      if (Math.abs(comp.position.x - point.x) <= 2 && Math.abs(comp.position.y - point.y) <= 2) {
        return comp;
      }
    }
    return undefined;
  }

  public findPinAt(point: Position): { component: Component; pinId: string } | undefined {
    for (const comp of this.components.values()) {
      const pins = getComponentPins(comp.type);
      for (const p of pins) {
        const absPos = getAbsolutePinPosition(comp, p.id);
        if (isPointsEqual(absPos, point)) {
          return { component: comp, pinId: p.id };
        }
      }
    }
    return undefined;
  }

  public findJunctionAt(point: Position): Junction | undefined {
    for (const junc of this.junctions.values()) {
      if (isPointsEqual(junc.position, point)) {
        return junc;
      }
    }
    return undefined;
  }

  public findWireAt(
    point: Position,
  ): { wire: Wire; segmentIndex: number; p1: Position; p2: Position } | undefined {
    for (const wire of this.wires.values()) {
      const seg = findSegmentOnWire(wire, point);
      if (seg) {
        return { wire, ...seg };
      }
    }
    return undefined;
  }
}
