/**
 * Workflow Engine Types
 *
 * Declarative workflow definitions for multi-agent orchestration.
 */

// ============================================================================
// Workflow Definition Types
// ============================================================================

export interface WorkflowDefinition {
  name: string;
  version?: string;
  description?: string;
  triggers?: WorkflowTrigger[];
  agents?: Record<string, string>; // name -> path to agent markdown
  inputs?: Record<string, string>; // input variables with default expressions
  pipeline: WorkflowStep[];
  notifications?: WorkflowNotifications;
}

export type WorkflowTrigger =
  | { cron: string }
  | { command: string }
  | { webhook: string };

export interface WorkflowStep {
  id: string;
  
  // Execution mode (mutually exclusive)
  agent?: string;           // Run as subagent
  action?: string;          // Run as tool action (web_fetch, exec, etc.)
  
  // Task definition
  task?: string;            // Prompt for agent steps
  params?: Record<string, unknown>; // Parameters for action steps
  
  // Iteration
  foreach?: string;         // Expression that yields array
  parallel?: boolean;       // Run iterations in parallel
  
  // Flow control
  decisions?: WorkflowDecision[];
  condition?: string;       // Expression that must be truthy
  retry?: number;           // Max retry attempts
  timeout?: number;         // Timeout in seconds
  
  // Output
  output?: string;          // Variable name to store output
}

export interface WorkflowDecision {
  match: string;            // Pattern to match in agent output
  action: 'continue' | 'goto' | 'retry' | 'skip_item' | 'abort';
  target?: string;          // Target step for 'goto'
  max?: number;             // Max retries for 'retry'
  message?: string;         // Message for 'abort'
}

export interface WorkflowNotifications {
  on_complete?: WorkflowNotification;
  on_fail?: WorkflowNotification;
  on_step_complete?: WorkflowNotification;
}

export interface WorkflowNotification {
  announce?: string;        // Message template
  webhook?: string;         // Webhook URL
  channel?: string;         // Channel ID
}

// ============================================================================
// Workflow Runtime Types
// ============================================================================

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface WorkflowRun {
  workflowId: string;
  workflowName: string;
  runId: string;
  status: WorkflowRunStatus;
  triggeredBy: 'cron' | 'command' | 'webhook' | 'manual';
  triggeredAt: string;      // ISO timestamp
  startedAt?: string;
  completedAt?: string;
  currentStep?: string;
  inputs: Record<string, unknown>;
  steps: Record<string, StepRun>;
  error?: WorkflowError;
}

export interface StepRun {
  stepId: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  attempts: number;
  output?: unknown;
  decision?: string;        // Decision made by agent
  error?: string;
  
  // For foreach steps
  items?: StepItemRun[];
}

export interface StepItemRun {
  index: number;
  status: StepStatus;
  attempts: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowError {
  step: string;
  message: string;
  stack?: string;
}

// ============================================================================
// Execution Context Types
// ============================================================================

export interface WorkflowContext {
  workflow: WorkflowDefinition;
  run: WorkflowRun;
  inputs: Record<string, unknown>;
  steps: Record<string, unknown>;  // Step outputs
  env: Record<string, string>;
}

export interface StepExecutionResult {
  success: boolean;
  output?: unknown;
  decision?: string;
  error?: string;
}

// ============================================================================
// Parser Types
// ============================================================================

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  errors?: ParseError[];
}

export interface ParseError {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

// ============================================================================
// Scheduler Types
// ============================================================================

export interface ExecutionPlan {
  steps: PlannedStep[];
  parallelGroups: string[][]; // Groups of step IDs that can run in parallel
}

export interface PlannedStep {
  stepId: string;
  dependencies: string[];     // Step IDs this step depends on
  isParallel: boolean;
  foreachSource?: string;     // Expression for foreach expansion
}
