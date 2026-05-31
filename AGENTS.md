# AGENTS.md — working agreement for ex3cuusion

Read this before changing anything. It exists because earlier AI work on this
repo optimized for green checkmarks instead of a system that actually works.
These rules close that loophole. They override convenience.

## What this product is

An execution engine that answers one question: **"given my routines, deadlines,
projects, neglected areas, and capacity, what should I do today?"** It is not a
todo app, second brain, journal, or coach. When in doubt, cut scope toward that
one question.

---

## The cardinal rule: do not teach to the test

The single biggest failure in this codebase has been **overfitting the AI to a
fixed set of demo phrases.** The same handful of inputs ("clean the house",
"message Will every Friday", "ideas for things to do with Emma", etc.) were
hardcoded in three places at once — the eval scenarios, the fixture interpreter,
and the production post-processor — so the suite passed while the live product
generalized to nothing.

Hard rules that prevent this:

1. **Production code must never branch on a specific user phrase.** No regex like
   `/clean (the )?house/`, `/emma/`, `/message will/`, `/diet app/`, hardcoded
   name lists (`/will|emma|sam|leo/`), etc., in `ai-actions.ts` or anywhere the
   live model's output is processed. The model decides *what* the user means.
   Deterministic code may only enforce **well-formedness**: null/format cleaning,
   date/time parsing, ID resolution, schema validation, safety classification.
   If you find yourself writing intent-matching by keyword, stop — that belongs
   in the prompt, not the code.

2. **A fixture answer is never the source of truth for behavior.** The fixture
   interpreter exists for fast, offline, deterministic *plumbing* tests (does an
   action get created, applied, logged, rendered). It must not encode "the right
   answer" to a semantic input. If a test only passes because the fixture
   hardcodes the expected output for that exact phrase, it is testing nothing.

3. **Eval inputs and fixture/normalizer logic must stay disjoint.** Any phrase
   used to judge AI *quality* must not appear as a literal in fixture or
   production code. Keep a held-out quality set the implementation has never been
   shaped around.

## The eval gate must exercise the model

`release:check` currently runs `eval:ai` in **fixture mode**, which means the gate
validates regexes, not the model. That is theater. Going forward:

- **AI quality is measured against the live model** (or recorded request/response
  cassettes that capture real model output — never hand-written expected JSON).
- Fixture-mode evals are a **smoke test only** ("the pipeline runs, actions apply,
  nothing throws"), never a quality signal. Label them as such.
- Score quality with **rubrics / an LLM judge** ("did it choose the right
  container? ask a question only when the answer changes storage? avoid
  duplicates?"), not exact-string assertions on a memorized phrase.
- The quality harness is `npm run eval:quality` (`scripts/run-ai-quality.mjs`): it
  runs each scenario against the live model N times and judges responses against a
  rubric, reporting a **pass-rate**. This — not the single-shot exact-match suite —
  is the model-quality signal. Add new behaviors as realistic, varied rubric
  scenarios in `scripts/quality/dev-scenarios.mjs`.
- A change to AI behavior is not "done" until `npm run eval:quality:heldout` still
  passes. `scripts/quality/heldout-scenarios.mjs` is **sacred**: never add prompt
  examples, code branches, or assertions aimed at passing it, and never edit it to
  make a run go green. It exists only to detect overfitting.
- **Do not chase a single failed sample** with a phrase-specific prompt/code hack.
  The model is non-deterministic; tune toward pass-rate on realistic inputs, not
  toward greening one elaborate case. Resist "more and more complicated test cases"
  for model judgment — prefer breadth + sampling + rubric judging. (Deterministic
  logic, e.g. the planner, is the opposite: add as many exact-match cases as you like.)

## Architecture rules for the AI inbox

- **One interpreter, full context.** Do not add competing interpreters that race
  and shadow each other (the day-rewrite-vs-full-context split caused real bugs).
  Whatever path runs must receive full context — projects, domains, routines,
  week plan, deadlines — not a stripped-down view.
- **Keep deterministic code as guardrails, not as the brain** (this is T059's
  actual intent — implement it, don't layer new heuristics on top of old ones).
- **Fix causes, not symptoms.** Duplicate tasks were patched with a "prune"
  step. Don't do that — make creation idempotent / fix the interpreter that
  emits the duplicate. If you're writing cleanup for output your own code
  generated, you're treating a symptom.
- **Be careful with silent auto-apply.** Actions that create, archive, or
  reschedule mutate the user's real day with no confirmation. Prefer
  propose-then-confirm for destructive/creative edits, or guarantee idempotency.

## Process discipline

- **Commit messages must describe the diff that's in the commit.** No aspirational
  or forward-looking messages ("Add day rewrite change plan" on a 4-line change).
  If the message and the diff disagree, the message is wrong.
- **Prefer working software over more planning docs.** This repo already has 60+
  tickets and a dozen design docs for a young codebase. Don't add a ticket or HLD
  unless it unblocks code you're about to write.
- **Dogfood on real, messy input** — the owner's actual inbox — not scripted
  characters. A scenario passing is not evidence the product feels good.
- **Report honestly.** If something is unverified, partial, or only works for the
  demo path, say so plainly. `docs/testing/realistic-character-results.md` lists
  real gaps — that honesty is the standard; match it.

## Definition of done for any AI change

1. No phrase-specific branching added to production code.
2. Checked against held-out inputs (not just the existing eval scenarios), with
   the live model or cassettes — and the result is reported honestly.
3. New duplicate/cleanup logic is justified as a cause-fix, not a symptom-patch.
4. Commit message matches the diff.

## Useful commands

```bash
npm run dev                 # local app (in-memory repo by default)
npm run test                # unit/integration (vitest)
npm run eval:ai             # SMOKE TEST ONLY (fixture) — not a quality signal
npm run eval:ai:live        # real model quality eval (uses API credit)
npm run test:e2e            # Playwright
npm run release:check       # full gate — see note above re: eval:ai being fixture
```
