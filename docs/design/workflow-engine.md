# RFC: Declarative Workflow Engine for Multi-Agent Orchestration

**Status**: Draft  
**Authors**: Elar Wei (@Elarwei001)  
**Created**: 2026-03-22  

## Summary

This RFC proposes a declarative workflow engine for OpenClaw that enables multi-agent orchestration without requiring the main agent to manually coordinate each step. Users define workflows in YAML, and the engine handles execution, branching, retries, and state persistence.

## Motivation

### Problem

Current multi-agent workflows in OpenClaw require the main agent to:
1. Manually spawn each subagent via `sessions_spawn`
2. Wait for completion via `sessions_yield`
3. Parse results and decide next steps
4. Handle retries and error recovery
5. Pass context between steps

This works for simple cases but becomes unwieldy for complex workflows like:
- **AI News Digest**: Fetch → Write → Review → Translate → QA → Publish
- **PR Review Pipeline**: Fetch PR → Analyze → Generate Comments → Post
- **Data Processing**: Extract → Transform → Validate → Load

### Use Case: AI News Digest

A real-world example that motivated this RFC:

```yaml
pipeline:
  - step: fetch
    tools: [web_fetch]
    sources: [anthropic.com/news, openai.com/news]
    
  - step: write
    agent: alex-chen  # Subagent with persona
    input: $fetch.output
    
  - step: review
    agent: bob-dillen  # Editorial director
    decisions:
      APPROVE: continue
      REVISE: goto write
      REJECT: abort
      
  - step: translate
    agent: alice-larry
    foreach: $write.articles
    parallel: true
    
  - step: qa
    agent: colly-markus
    foreach: $translate.output
    decisions:
      PASS: continue
      REVISE: goto translate.same_item
      FAIL: skip_item
    max_retries: 3
```

Currently, the main agent must orchestrate all 5 steps manually, handling every branch and retry.

### Goals

1. **Declarative Definition**: Define workflows in YAML, not imperative code
2. **Automatic Orchestration**: Engine handles spawning, waiting, branching
3. **State Persistence**: Resume workflows after interruptions
4. **Parallel Execution**: Run independent steps concurrently
5. **Decision Routing**: Branch based on agent outputs (PASS/REVISE/FAIL)
6. **Context Propagation**: Automatic variable passing between steps

### Non-Goals

1. Full workflow management UI (future work)
2. Distributed execution across nodes (future work)
3. Real-time collaborative editing of workflows

## Design

### Workflow Definition Schema

```yaml
# workflow.yaml
name: daily-news-digest
version: "1.0"

triggers:
  - cron: "0 8 * * *"           # Daily at 8 AM
  - command: "/news-digest"     # Manual trigger

agents:
  alex: ./subagents/alex-chen.md
  bob: ./subagents/bob-dillen.md
  alice: ./subagents/alice-larry.md
  colly: ./subagents/colly-markus.md

inputs:
  date: ${{ env.DATE || today() }}

pipeline:
  - id: fetch
    action: web_fetch
    params:
      urls:
        - https://anthropic.com/news
        - https://openai.com/research
    output: raw_news

  - id: write
    agent: alex
    task: |
      Write a news digest for {{ inputs.date }} based on:
      {{ steps.fetch.output }}
    output: draft
    retry: 2

  - id: review
    agent: bob
    task: |
      Review the following draft:
      {{ steps.write.output }}
    output: review_result
    decisions:
      - match: "APPROVE"
        action: continue
      - match: "REVISE"
        action: goto
        target: write
      - match: "REJECT"
        action: abort
        message: "Editorial rejection"

  - id: translate
    agent: alice
    foreach: ${{ steps.write.output.articles }}
    parallel: true
    task: |
      Translate the following article to Chinese:
      {{ item }}
    output: translations

  - id: qa
    agent: colly
    foreach: ${{ steps.translate.output }}
    task: |
      Review this translation:
      Original: {{ item.original }}
      Translation: {{ item.translation }}
    decisions:
      - match: "PASS"
        action: continue
      - match: "REVISE"
        action: retry
        max: 3
      - match: "FAIL"
        action: skip_item
    output: qa_results

  - id: publish
    action: exec
    params:
      command: |
        cd /tmp/tech-news
        git add . && git commit -m "Daily digest {{ inputs.date }}"
        git push
    condition: ${{ steps.qa.passed_count > 0 }}

notifications:
  on_complete:
    announce: "✅ News digest published: {{ steps.qa.passed_count }} articles"
  on_fail:
    announce: "❌ Workflow failed at step {{ failed_step }}: {{ error }}"
```

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Workflow Engine                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Parser    │───▶│  Scheduler  │───▶│  Executor   │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Schema    │    │    State    │    │   Agent     │ │
│  │  Validator  │    │    Store    │    │   Spawner   │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 1. Parser (`src/workflow/parser.ts`)
- Parse YAML workflow definitions
- Validate against JSON Schema
- Resolve agent references and variable templates

#### 2. Scheduler (`src/workflow/scheduler.ts`)
- Build execution DAG from pipeline definition
- Determine step dependencies and parallel groups
- Handle `foreach` expansion

#### 3. Executor (`src/workflow/executor.ts`)
- Execute steps in dependency order
- Spawn subagents via existing `sessions_spawn`
- Handle decisions and branching
- Manage retries

#### 4. State Store (`src/workflow/state.ts`)
- Persist workflow state to filesystem
- Enable resume after interruption
- Track step outputs for variable resolution

### Integration Points

1. **Cron Integration**: Register workflows with existing cron system
2. **Sessions Integration**: Use `sessions_spawn` for agent steps
3. **Tools Integration**: Use existing tool infrastructure for action steps
4. **Config Integration**: Store workflow definitions in skills or workspace

### Example State File

```json
{
  "workflowId": "daily-news-digest",
  "runId": "run-2026-03-22-080000",
  "status": "running",
  "currentStep": "translate",
  "startedAt": "2026-03-22T08:00:00Z",
  "steps": {
    "fetch": {
      "status": "completed",
      "output": { "articles": [...] },
      "completedAt": "2026-03-22T08:00:45Z"
    },
    "write": {
      "status": "completed",
      "output": { "draft": "..." },
      "attempts": 1,
      "completedAt": "2026-03-22T08:04:05Z"
    },
    "review": {
      "status": "completed",
      "decision": "APPROVE",
      "completedAt": "2026-03-22T08:05:20Z"
    },
    "translate": {
      "status": "running",
      "items": [
        { "index": 0, "status": "completed", "output": "..." },
        { "index": 1, "status": "completed", "output": "..." },
        { "index": 2, "status": "running", "attempt": 2 }
      ]
    }
  }
}
```

## Implementation Plan

### Phase 1: Core Engine (MVP)
- [ ] Workflow YAML parser with schema validation
- [ ] Linear pipeline execution (no branching)
- [ ] Agent step execution via `sessions_spawn`
- [ ] Basic state persistence

### Phase 2: Branching & Decisions
- [ ] Decision parsing from agent output
- [ ] `goto` and `retry` actions
- [ ] `skip_item` for foreach loops
- [ ] `condition` evaluation

### Phase 3: Parallel Execution
- [ ] `parallel: true` for foreach steps
- [ ] Dependency-based parallelization
- [ ] Concurrent step limit configuration

### Phase 4: Triggers & Integration
- [ ] Cron trigger registration
- [ ] Command trigger (`/workflow run <name>`)
- [ ] Webhook trigger (future)

### Phase 5: Observability
- [ ] Workflow status command
- [ ] Run history and logs
- [ ] Dashboard integration (future)

## Alternatives Considered

### 1. Use HEARTBEAT.md as State Machine
**Pros**: Works with existing features  
**Cons**: Manual state management, not elegant, requires agent to parse markdown

### 2. External Workflow Tools (Temporal, Airflow)
**Pros**: Mature, feature-rich  
**Cons**: Heavy dependency, not integrated with OpenClaw agent model

### 3. Pure Agent Orchestration
**Pros**: No new code needed  
**Cons**: Complex, error-prone, no state persistence

## Open Questions

1. Should workflows be defined in skills, workspace, or config?
2. How to handle long-running workflows (hours/days)?
3. Should we support workflow composition (calling other workflows)?
4. How to version workflows and handle upgrades mid-run?

## References

- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Temporal Workflows](https://docs.temporal.io/concepts/what-is-a-workflow)
- [Airflow DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html)
