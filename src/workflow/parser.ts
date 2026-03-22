/**
 * Workflow Parser
 *
 * Parses YAML workflow definitions and validates against schema.
 */

import { parse as parseYaml } from "yaml";
import type {
  WorkflowDefinition,
  WorkflowStep,
  ParseResult,
  ParseError,
} from "./types";

// ============================================================================
// YAML Parser
// ============================================================================

export function parseWorkflowYaml(yaml: string): ParseResult<WorkflowDefinition> {
  const errors: ParseError[] = [];

  // Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (e) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          message: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ path: "", message: "Workflow must be an object" }],
    };
  }

  const doc = raw as Record<string, unknown>;

  // Validate required fields
  if (!doc.name || typeof doc.name !== "string") {
    errors.push({ path: "name", message: "name is required and must be a string" });
  }

  if (!doc.pipeline || !Array.isArray(doc.pipeline)) {
    errors.push({ path: "pipeline", message: "pipeline is required and must be an array" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Parse pipeline steps
  const pipeline: WorkflowStep[] = [];
  const stepIds = new Set<string>();

  for (let i = 0; i < (doc.pipeline as unknown[]).length; i++) {
    const stepRaw = (doc.pipeline as unknown[])[i];
    const stepResult = parseStep(stepRaw, i, stepIds);
    
    if (!stepResult.ok) {
      errors.push(...(stepResult.errors || []));
    } else if (stepResult.value) {
      pipeline.push(stepResult.value);
      stepIds.add(stepResult.value.id);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Build workflow definition
  const workflow: WorkflowDefinition = {
    name: doc.name as string,
    version: typeof doc.version === "string" ? doc.version : undefined,
    description: typeof doc.description === "string" ? doc.description : undefined,
    triggers: parseTriggers(doc.triggers),
    agents: parseAgents(doc.agents),
    inputs: parseInputs(doc.inputs),
    pipeline,
    notifications: parseNotifications(doc.notifications),
  };

  return { ok: true, value: workflow };
}

// ============================================================================
// Step Parser
// ============================================================================

function parseStep(
  raw: unknown,
  index: number,
  existingIds: Set<string>
): ParseResult<WorkflowStep> {
  const errors: ParseError[] = [];
  const path = `pipeline[${index}]`;

  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ path, message: "Step must be an object" }],
    };
  }

  const step = raw as Record<string, unknown>;

  // Validate id
  if (!step.id || typeof step.id !== "string") {
    errors.push({ path: `${path}.id`, message: "Step id is required" });
  } else if (existingIds.has(step.id)) {
    errors.push({ path: `${path}.id`, message: `Duplicate step id: ${step.id}` });
  }

  // Validate execution mode (agent or action required)
  const hasAgent = typeof step.agent === "string";
  const hasAction = typeof step.action === "string";

  if (!hasAgent && !hasAction) {
    errors.push({
      path,
      message: "Step must have either 'agent' or 'action'",
    });
  }

  if (hasAgent && hasAction) {
    errors.push({
      path,
      message: "Step cannot have both 'agent' and 'action'",
    });
  }

  // Validate decisions
  const decisions = parseDecisions(step.decisions, path);
  if (decisions.errors) {
    errors.push(...decisions.errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result: WorkflowStep = {
    id: step.id as string,
  };

  if (hasAgent) result.agent = step.agent as string;
  if (hasAction) result.action = step.action as string;
  if (typeof step.task === "string") result.task = step.task;
  if (step.params && typeof step.params === "object") {
    result.params = step.params as Record<string, unknown>;
  }
  if (typeof step.foreach === "string") result.foreach = step.foreach;
  if (typeof step.parallel === "boolean") result.parallel = step.parallel;
  if (decisions.value) result.decisions = decisions.value;
  if (typeof step.condition === "string") result.condition = step.condition;
  if (typeof step.retry === "number") result.retry = step.retry;
  if (typeof step.timeout === "number") result.timeout = step.timeout;
  if (typeof step.output === "string") result.output = step.output;

  return { ok: true, value: result };
}

// ============================================================================
// Helper Parsers
// ============================================================================

function parseTriggers(raw: unknown): WorkflowDefinition["triggers"] {
  if (!Array.isArray(raw)) return undefined;
  
  return raw
    .filter((t): t is Record<string, unknown> => t && typeof t === "object")
    .map((t) => {
      if (typeof t.cron === "string") return { cron: t.cron };
      if (typeof t.command === "string") return { command: t.command };
      if (typeof t.webhook === "string") return { webhook: t.webhook };
      return null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

function parseAgents(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  
  const agents: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      agents[key] = value;
    }
  }
  return Object.keys(agents).length > 0 ? agents : undefined;
}

function parseInputs(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      inputs[key] = value;
    }
  }
  return Object.keys(inputs).length > 0 ? inputs : undefined;
}

function parseDecisions(
  raw: unknown,
  parentPath: string
): ParseResult<WorkflowStep["decisions"]> {
  if (!raw) return { ok: true };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ path: `${parentPath}.decisions`, message: "decisions must be an array" }],
    };
  }

  const decisions: NonNullable<WorkflowStep["decisions"]> = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < raw.length; i++) {
    const d = raw[i];
    const path = `${parentPath}.decisions[${i}]`;

    if (!d || typeof d !== "object") {
      errors.push({ path, message: "Decision must be an object" });
      continue;
    }

    const decision = d as Record<string, unknown>;

    if (typeof decision.match !== "string") {
      errors.push({ path: `${path}.match`, message: "match is required" });
      continue;
    }

    const validActions = ["continue", "goto", "retry", "skip_item", "abort"];
    if (!validActions.includes(decision.action as string)) {
      errors.push({
        path: `${path}.action`,
        message: `action must be one of: ${validActions.join(", ")}`,
      });
      continue;
    }

    decisions.push({
      match: decision.match,
      action: decision.action as "continue" | "goto" | "retry" | "skip_item" | "abort",
      target: typeof decision.target === "string" ? decision.target : undefined,
      max: typeof decision.max === "number" ? decision.max : undefined,
      message: typeof decision.message === "string" ? decision.message : undefined,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: decisions.length > 0 ? decisions : undefined };
}

function parseNotifications(raw: unknown): WorkflowDefinition["notifications"] {
  if (!raw || typeof raw !== "object") return undefined;
  
  const n = raw as Record<string, unknown>;
  const result: NonNullable<WorkflowDefinition["notifications"]> = {};

  if (n.on_complete && typeof n.on_complete === "object") {
    result.on_complete = parseNotification(n.on_complete);
  }
  if (n.on_fail && typeof n.on_fail === "object") {
    result.on_fail = parseNotification(n.on_fail);
  }
  if (n.on_step_complete && typeof n.on_step_complete === "object") {
    result.on_step_complete = parseNotification(n.on_step_complete);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseNotification(raw: unknown): WorkflowDefinition["notifications"] extends { on_complete?: infer T } ? T : never {
  const n = raw as Record<string, unknown>;
  return {
    announce: typeof n.announce === "string" ? n.announce : undefined,
    webhook: typeof n.webhook === "string" ? n.webhook : undefined,
    channel: typeof n.channel === "string" ? n.channel : undefined,
  };
}
