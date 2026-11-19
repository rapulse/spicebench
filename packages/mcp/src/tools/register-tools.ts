import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CircuitSession } from "../session/circuit-session";
import {
  GetCircuitStateInputSchema,
  PlaceComponentInputSchema,
  UpdateComponentInputSchema,
  RemoveComponentInputSchema,
  ConnectPinsInputSchema,
  ValidateCircuitInputSchema,
  RunSimulationInputSchema,
  ReadInstrumentInputSchema,
  ExportSpiceInputSchema,
  ResetCircuitInputSchema,
} from "./schemas";

export function registerTools(server: McpServer, session: CircuitSession): void {
  // 1. get_circuit_state
  server.tool(
    "get_circuit_state",
    "Returns the current circuit JSON schematic, elements, connection wires, and simulation status.",
    GetCircuitStateInputSchema,
    async ({ includeNetlist }) => {
      try {
        const circuit = session.getCircuit();
        const stats = session.getStats();
        const lastResult = session.getLastResult();
        const netlist = includeNetlist ? session.exportSpice() : undefined;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    circuit,
                    stats,
                    lastResult: lastResult
                      ? {
                          mode: lastResult.mode,
                          success: lastResult.success,
                          durationMs: lastResult.durationMs,
                        }
                      : null,
                    netlist,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 2. place_component
  server.tool(
    "place_component",
    "Places an electronic component (Resistor, Capacitor, DC Source, Diode, BJT, Instrument, etc.) on the logical coordinate grid.",
    PlaceComponentInputSchema,
    async (args) => {
      try {
        const component = session.placeComponent({
          type: args.type,
          x: args.x,
          y: args.y,
          id: args.id,
          label: args.label,
          params: args.params,
          rotation: args.rotation,
        });

        session.logAgentAction(
          "place_component",
          `Placed ${component.type} '${component.id}' at (${component.position.x}, ${component.position.y})`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    component,
                    message: `Placed ${component.type} '${component.id}' at (${component.position.x}, ${component.position.y})`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 3. update_component
  server.tool(
    "update_component",
    "Updates parameters (nominal values), label, position, or rotation of an existing component in the circuit.",
    UpdateComponentInputSchema,
    async (args) => {
      try {
        const component = session.updateComponent({
          id: args.id,
          params: args.params,
          label: args.label,
          x: args.x,
          y: args.y,
          rotation: args.rotation,
        });

        session.logAgentAction("update_component", `Updated component '${component.id}'`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    component,
                    message: `Updated component '${component.id}'`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 4. remove_component
  server.tool(
    "remove_component",
    "Removes a component from the circuit and automatically cleans up connected wires and orphaned junctions.",
    RemoveComponentInputSchema,
    async ({ id }) => {
      try {
        const result = session.removeComponent(id);
        session.logAgentAction(
          "remove_component",
          `Removed component '${id}' and ${result.removedWireCount} wire(s)`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    removedComponentId: result.removedComponentId,
                    removedWireCount: result.removedWireCount,
                    message: `Removed component '${id}' and ${result.removedWireCount} connected wire(s)`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 5. connect_pins
  server.tool(
    "connect_pins",
    "Creates an orthogonal Manhattan wire connecting a pin of one component to a pin of another component.",
    ConnectPinsInputSchema,
    async (args) => {
      try {
        const wire = session.connectPins({
          from: { componentId: args.fromComponentId, pinId: args.fromPinId },
          to: { componentId: args.toComponentId, pinId: args.toPinId },
          id: args.id,
        });

        session.logAgentAction(
          "connect_pins",
          `Connected ${args.fromComponentId}:${args.fromPinId} -> ${args.toComponentId}:${args.toPinId}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    wire,
                    message: `Connected ${args.fromComponentId}:${args.fromPinId} -> ${args.toComponentId}:${args.toPinId}`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 6. validate_circuit
  server.tool(
    "validate_circuit",
    "Validates circuit electrical topology (checks for floating nodes, missing ground, voltage loops, DC paths) without running SPICE.",
    ValidateCircuitInputSchema,
    async () => {
      try {
        const report = session.validate();
        session.logAgentAction(
          "validate_circuit",
          `Topology validation: ${report.isValid ? "Valid (0 errors)" : `${report.errors.length} error(s)`}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: {
                    isValid: report.isValid,
                    errorCount: report.errors.length,
                    warningCount: report.warnings.length,
                    errors: report.errors,
                    warnings: report.warnings,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 7. run_simulation
  server.tool(
    "run_simulation",
    "Compiles the schematic into SPICE, executes the simulation (OP, TRAN, AC, or DC), and returns structured nodal voltages, currents, and compact waveform summaries.",
    RunSimulationInputSchema,
    async (args) => {
      try {
        const summary = await session.runSimulation({
          mode: args.mode,
          tran: args.tran,
          ac: args.ac,
          dc: args.dc,
          timeoutMs: args.timeoutMs,
        });

        session.logAgentAction(
          "run_simulation",
          `Simulation executed: ${summary.mode.toUpperCase()} (${summary.durationMs}ms)`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: summary,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 8. read_instrument
  server.tool(
    "read_instrument",
    "Reads measurements from a virtual instrument (Multimeter V/A, Oscilloscope Vpp/Vrms, Bode Plotter gain/phase, Function Generator).",
    ReadInstrumentInputSchema,
    async ({ instrumentId }) => {
      try {
        const reading = await session.readInstrument(instrumentId);
        session.logAgentAction(
          "read_instrument",
          `Read '${instrumentId}': ${reading.formatted}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: reading,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 9. export_spice (Bonus helper tool)
  server.tool(
    "export_spice",
    "Generates and exports the raw SPICE netlist text for the current schematic.",
    ExportSpiceInputSchema,
    async (args) => {
      try {
        const netlist = session.exportSpice({ mode: args.mode });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: { netlist },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );

  // 10. reset_circuit (Bonus helper tool)
  server.tool(
    "reset_circuit",
    "Clears the current circuit schematic and resets the workspace to an empty canvas.",
    ResetCircuitInputSchema,
    async () => {
      try {
        session.reset();
        session.logAgentAction("reset_circuit", "Workspace cleared to empty canvas");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  data: { message: "Circuit reset to empty canvas." },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return createErrorResponse(err);
      }
    },
  );
}

function createErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: false,
            error: {
              code: "MCP_TOOL_ERROR",
              message,
            },
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
