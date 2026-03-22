/**
 * Workflow Engine
 *
 * Declarative multi-agent workflow orchestration for OpenClaw.
 *
 * @example
 * ```typescript
 * import { parseWorkflowYaml, buildExecutionPlan } from "./workflow";
 *
 * const yaml = fs.readFileSync("workflow.yaml", "utf-8");
 * const result = parseWorkflowYaml(yaml);
 *
 * if (result.ok) {
 *   const plan = buildExecutionPlan(result.value);
 *   // Execute steps according to plan...
 * }
 * ```
 */

// Types
export type {
  // Definition types
  WorkflowDefinition,
  WorkflowTrigger,
  WorkflowStep,
  WorkflowDecision,
  WorkflowNotifications,
  WorkflowNotification,
  // Runtime types
  WorkflowRun,
  WorkflowRunStatus,
  StepRun,
  StepStatus,
  StepItemRun,
  WorkflowError,
  // Context types
  WorkflowContext,
  StepExecutionResult,
  // Parser types
  ParseResult,
  ParseError,
  // Scheduler types
  ExecutionPlan,
  PlannedStep,
} from "./types";

// Parser
export { parseWorkflowYaml } from "./parser";

// Scheduler
export {
  buildExecutionPlan,
  getExecutionOrder,
  getNextSteps,
  isComplete,
} from "./scheduler";

// TODO: Export executor when implemented
// export { WorkflowExecutor } from "./executor";

// TODO: Export state store when implemented
// export { WorkflowStateStore } from "./state";
