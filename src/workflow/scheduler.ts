/**
 * Workflow Scheduler
 *
 * Analyzes workflow definitions to build execution plans with
 * dependency resolution and parallel group identification.
 */

import type {
  WorkflowDefinition,
  WorkflowStep,
  ExecutionPlan,
  PlannedStep,
} from "./types";

// ============================================================================
// Execution Plan Builder
// ============================================================================

export function buildExecutionPlan(workflow: WorkflowDefinition): ExecutionPlan {
  const steps: PlannedStep[] = [];
  const stepIndex = new Map<string, number>();

  // Build step index for dependency lookup
  workflow.pipeline.forEach((step, i) => {
    stepIndex.set(step.id, i);
  });

  // Analyze each step
  for (const step of workflow.pipeline) {
    const dependencies = findDependencies(step, stepIndex, workflow.pipeline);
    const foreachSource = step.foreach
      ? extractForeachSource(step.foreach)
      : undefined;

    steps.push({
      stepId: step.id,
      dependencies,
      isParallel: step.parallel ?? false,
      foreachSource,
    });
  }

  // Build parallel groups
  const parallelGroups = buildParallelGroups(steps);

  return { steps, parallelGroups };
}

// ============================================================================
// Dependency Analysis
// ============================================================================

/**
 * Find dependencies for a step by analyzing variable references.
 * 
 * Variables can reference:
 * - `${{ steps.fetch.output }}` - Output of a previous step
 * - `${{ inputs.date }}` - Input variable
 * - `{{ steps.write.articles }}` - Mustache-style reference
 */
function findDependencies(
  step: WorkflowStep,
  stepIndex: Map<string, number>,
  allSteps: WorkflowStep[]
): string[] {
  const dependencies = new Set<string>();
  const currentIndex = stepIndex.get(step.id) ?? 0;

  // Collect all string fields that might contain references
  const stringsToAnalyze: string[] = [];

  if (step.task) stringsToAnalyze.push(step.task);
  if (step.foreach) stringsToAnalyze.push(step.foreach);
  if (step.condition) stringsToAnalyze.push(step.condition);
  
  // Also check params for string values
  if (step.params) {
    collectStrings(step.params, stringsToAnalyze);
  }

  // Extract step references
  for (const str of stringsToAnalyze) {
    const refs = extractStepReferences(str);
    for (const ref of refs) {
      // Only add if the referenced step exists and comes before this step
      const refIndex = stepIndex.get(ref);
      if (refIndex !== undefined && refIndex < currentIndex) {
        dependencies.add(ref);
      }
    }
  }

  // If no explicit dependencies found, depend on previous step (linear flow)
  if (dependencies.size === 0 && currentIndex > 0) {
    const prevStep = allSteps[currentIndex - 1];
    dependencies.add(prevStep.id);
  }

  return Array.from(dependencies);
}

function collectStrings(obj: unknown, result: string[]): void {
  if (typeof obj === "string") {
    result.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      collectStrings(item, result);
    }
  } else if (obj && typeof obj === "object") {
    for (const value of Object.values(obj)) {
      collectStrings(value, result);
    }
  }
}

/**
 * Extract step IDs referenced in a string.
 * 
 * Patterns:
 * - `${{ steps.STEPID.xxx }}`
 * - `{{ steps.STEPID.xxx }}`
 * - `$steps.STEPID.xxx`
 */
function extractStepReferences(str: string): string[] {
  const refs = new Set<string>();

  // Match ${{ steps.ID.xxx }} or {{ steps.ID.xxx }}
  const templatePattern = /\{\{\s*steps\.(\w+)\./g;
  let match;
  while ((match = templatePattern.exec(str)) !== null) {
    refs.add(match[1]);
  }

  // Match $steps.ID.xxx (simpler syntax)
  const simplePattern = /\$steps\.(\w+)\./g;
  while ((match = simplePattern.exec(str)) !== null) {
    refs.add(match[1]);
  }

  return Array.from(refs);
}

function extractForeachSource(expr: string): string {
  // Extract the base reference for foreach expansion
  // e.g., "${{ steps.write.output.articles }}" -> "steps.write.output.articles"
  const match = expr.match(/\{\{\s*(.+?)\s*\}\}/) || expr.match(/\$(.+)/);
  return match ? match[1].trim() : expr;
}

// ============================================================================
// Parallel Group Builder
// ============================================================================

/**
 * Build groups of steps that can execute in parallel.
 * 
 * Steps can run in parallel if:
 * 1. They have no dependencies on each other
 * 2. Their dependencies have all completed
 */
function buildParallelGroups(steps: PlannedStep[]): string[][] {
  const groups: string[][] = [];
  const completed = new Set<string>();

  // Clone steps for processing
  const remaining = [...steps];

  while (remaining.length > 0) {
    const currentGroup: string[] = [];

    // Find all steps whose dependencies are satisfied
    const ready: PlannedStep[] = [];
    const notReady: PlannedStep[] = [];

    for (const step of remaining) {
      const depsComplete = step.dependencies.every((d) => completed.has(d));
      if (depsComplete) {
        ready.push(step);
      } else {
        notReady.push(step);
      }
    }

    if (ready.length === 0 && notReady.length > 0) {
      // Circular dependency or invalid reference - break to avoid infinite loop
      console.warn("Workflow scheduler: possible circular dependency detected");
      break;
    }

    // Add ready steps to current group
    for (const step of ready) {
      currentGroup.push(step.stepId);
      completed.add(step.stepId);
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    remaining.length = 0;
    remaining.push(...notReady);
  }

  return groups;
}

// ============================================================================
// Execution Order
// ============================================================================

/**
 * Get steps in topological order for serial execution.
 */
export function getExecutionOrder(plan: ExecutionPlan): string[] {
  return plan.parallelGroups.flat();
}

/**
 * Get the next steps that can be executed given current progress.
 */
export function getNextSteps(
  plan: ExecutionPlan,
  completedSteps: Set<string>
): string[] {
  for (const group of plan.parallelGroups) {
    const pending = group.filter((id) => !completedSteps.has(id));
    if (pending.length > 0) {
      return pending;
    }
  }
  return [];
}

/**
 * Check if all steps are complete.
 */
export function isComplete(
  plan: ExecutionPlan,
  completedSteps: Set<string>
): boolean {
  return plan.steps.every((s) => completedSteps.has(s.stepId));
}
