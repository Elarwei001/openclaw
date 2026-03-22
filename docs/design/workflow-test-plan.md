# Workflow Engine - Test Plan & Acceptance Criteria

## Overview

This document defines the verification test cases for the workflow engine,
using the **AI News Digest** workflow as the primary test case.

## Test Workflow: AI News Digest

```
┌─────────────────────────────────────────────────────────┐
│                    AI News Digest                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [fetch] ──▶ [write] ──▶ [review] ──▶ [translate] ──▶  │
│                  ▲          │              │            │
│                  │ REVISE   │              ▼            │
│                  └──────────┘          [qa] ──▶ [publish]│
│                            │              │             │
│                       REJECT│         REVISE│           │
│                            ▼              │             │
│                         ABORT             └────────────▶│
│                                                         │
│  Agents: Alex (write), Bob (review),                    │
│          Alice (translate), Colly (qa)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

### ✅ Phase 1: Parser (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| P1 | Parse valid workflow YAML | Returns `ok: true` with complete definition | ⬜ |
| P2 | Parse all 6 pipeline steps | Step IDs: fetch, write, review, translate, qa, publish | ⬜ |
| P3 | Parse triggers (cron + command) | Both triggers extracted correctly | ⬜ |
| P4 | Parse agent references | All 4 agents: alex, bob, alice, colly | ⬜ |
| P5 | Parse decisions with actions | APPROVE/REVISE/REJECT with correct actions | ⬜ |
| P6 | Parse foreach with parallel | `parallel: true` on translate step | ⬜ |
| P7 | Parse retry configuration | `retry: 2` on write, `max: 3` on qa REVISE | ⬜ |
| P8 | Parse notifications | on_complete and on_fail messages | ⬜ |
| P9 | Reject invalid YAML | Returns parse error | ⬜ |
| P10 | Reject missing name | Returns validation error | ⬜ |
| P11 | Reject duplicate step IDs | Returns validation error | ⬜ |

### ✅ Phase 2: Scheduler (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| S1 | Build execution plan | 6 steps with correct dependencies | ⬜ |
| S2 | Detect step dependencies | write→fetch, review→write, etc. | ⬜ |
| S3 | Identify parallel groups | review + translate can run together | ⬜ |
| S4 | Mark foreach steps | translate has `foreachSource` | ⬜ |
| S5 | Get next executable steps | Correct steps based on completion | ⬜ |
| S6 | Detect workflow completion | True only when all steps done | ⬜ |

### ✅ Phase 3: Executor Core (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| E1 | Execute action step | web_fetch called with params | ⬜ |
| E2 | Execute agent step | sessions_spawn called with task | ⬜ |
| E3 | Pass context between steps | `{{ steps.fetch.output }}` resolved | ⬜ |
| E4 | Handle step success | Step marked completed, output saved | ⬜ |
| E5 | Handle step failure | Error recorded, retry if configured | ⬜ |
| E6 | Respect timeout | Step killed after timeout seconds | ⬜ |

### ✅ Phase 4: Decision Routing (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| D1 | Parse decision from output | Extract "APPROVE" from agent response | ⬜ |
| D2 | Continue on match | APPROVE → proceed to next step | ⬜ |
| D3 | Goto on match | REVISE → jump back to write step | ⬜ |
| D4 | Retry on match | REVISE in QA → re-run translate for item | ⬜ |
| D5 | Skip item on match | FAIL in QA → skip item, continue others | ⬜ |
| D6 | Abort on match | REJECT → stop workflow, send notification | ⬜ |
| D7 | Limit goto cycles | Max 3 REVISE loops before abort | ⬜ |

### ✅ Phase 5: Foreach Execution (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| F1 | Expand foreach array | 3 articles → 3 item executions | ⬜ |
| F2 | Parallel execution | Items run concurrently when `parallel: true` | ⬜ |
| F3 | Sequential execution | Items run one-by-one when `parallel: false` | ⬜ |
| F4 | Pass item to template | `{{ item }}` contains current article | ⬜ |
| F5 | Aggregate results | `translations` array with all outputs | ⬜ |
| F6 | Handle empty array | Skip step gracefully, no error | ⬜ |
| F7 | Track individual item status | Each item has its own status/attempts | ⬜ |

### ✅ Phase 6: State Persistence (MUST PASS)

| ID | Test | Expected | Status |
|----|------|----------|--------|
| ST1 | Save state after step | State file updated on disk | ⬜ |
| ST2 | Resume from state | Workflow continues from last step | ⬜ |
| ST3 | Resume foreach progress | Completed items not re-run | ⬜ |
| ST4 | Concurrent safety | No race conditions on state updates | ⬜ |

---

## Integration Test Scenarios

### Scenario 1: Happy Path ✅

```
Input: 3 new Anthropic articles
Expected Flow:
  fetch     → OK (3 articles)
  write     → OK (Alex writes digest)
  review    → APPROVE (Bob: score 87)
  translate → OK (Alice: 3 translations, parallel)
  qa        → PASS, PASS, PASS (Colly: 95, 91, 93)
  publish   → OK (git push)
  
Output: Digest + 3 translations published
Notification: "✅ News digest published"
```

### Scenario 2: Editorial Revision 🔄

```
Input: Draft needs improvement
Expected Flow:
  fetch     → OK
  write     → OK (attempt 1)
  review    → REVISE (Bob: "needs more analysis")
  write     → OK (attempt 2, revised)
  review    → APPROVE (Bob: score 88)
  ... rest proceeds normally
  
Verify: write step runs twice, review runs twice
```

### Scenario 3: Translation Retry 🔄

```
Input: One translation needs fixing
Expected Flow:
  ... write/review OK
  translate → OK (3 translations)
  qa        → PASS, REVISE, PASS (article 2 incomplete)
  translate[1] → OK (Alice re-translates article 2)
  qa[1]     → PASS (Colly: 92)
  publish   → OK (3/3 articles)
  
Verify: translate runs 4 times total (3 initial + 1 retry)
Verify: Only article 2 was re-translated
```

### Scenario 4: Partial Failure ⚠️

```
Input: One translation unfixable
Expected Flow:
  ... translate OK
  qa        → PASS, FAIL, PASS (article 2 fails after 3 retries)
  publish   → OK (2/3 articles)
  
Verify: Article 2 skipped after max retries
Verify: passed_count = 2
Notification: Mentions "2/3 articles"
```

### Scenario 5: Editorial Rejection ❌

```
Input: Fundamentally flawed draft
Expected Flow:
  fetch     → OK
  write     → OK
  review    → REJECT (Bob: "factual errors, off-topic")
  
Verify: Workflow aborts immediately
Verify: translate/qa/publish never run
Notification: "❌ Failed: Editorial rejection"
```

### Scenario 6: Empty Foreach 📭

```
Input: No articles worth translating today
Expected Flow:
  ... write produces digest with empty articles_to_translate
  translate → SKIP (empty array)
  qa        → SKIP (nothing to QA)
  publish   → OK (digest only)
  
Verify: No errors from empty foreach
Verify: Digest still published
```

### Scenario 7: Resume After Crash 🔌

```
State before crash:
  fetch     → COMPLETED
  write     → COMPLETED
  review    → COMPLETED (APPROVE)
  translate[0] → COMPLETED
  translate[1] → RUNNING (interrupted)
  translate[2] → PENDING
  
After resume:
  translate[1] → COMPLETED (restarts)
  translate[2] → COMPLETED
  qa        → runs for all 3
  publish   → OK
  
Verify: fetch/write/review/translate[0] NOT re-run
Verify: translate[1] restarts from beginning
```

---

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Parse time | < 50ms | For typical workflow YAML |
| Schedule time | < 10ms | Build execution plan |
| State save | < 100ms | After each step |
| Parallel efficiency | 80%+ | 4 items should be ~4x faster than sequential |

---

## Error Handling Requirements

| Error | Handling |
|-------|----------|
| Invalid YAML | Return parse errors, don't crash |
| Missing agent file | Clear error message with path |
| Agent timeout | Mark step failed, allow retry |
| Network error | Mark step failed, allow retry |
| Decision not matched | Use default (continue or fail) |
| Circular goto | Detect and abort after max cycles |
| State corruption | Log error, start fresh |

---

## Test Commands

```bash
# Run all workflow tests
npm test -- src/workflow/tests/

# Run only parser tests
npm test -- src/workflow/tests/ai-news-digest.test.ts -t "Parser"

# Run only scheduler tests
npm test -- src/workflow/tests/ai-news-digest.test.ts -t "Scheduler"

# Run integration tests
npm test -- src/workflow/tests/ai-news-digest.test.ts -t "Integration"

# Run with coverage
npm test -- --coverage src/workflow/
```

---

## Definition of Done

The workflow engine is considered complete when:

1. ✅ All 11 Parser tests pass
2. ✅ All 6 Scheduler tests pass
3. ✅ All 6 Executor Core tests pass
4. ✅ All 7 Decision Routing tests pass
5. ✅ All 7 Foreach Execution tests pass
6. ✅ All 4 State Persistence tests pass
7. ✅ All 7 Integration Scenarios pass
8. ✅ Performance targets met
9. ✅ Error handling verified
10. ✅ AI News Digest workflow runs end-to-end
