---
name: spell-automation-triage
description: This skill should be used when the user asks to "triage spells for automation", "analyze the spell list", "check which spells need automation", "propose automations for these spells", "go through the cantrips/spells CSV", or provides a spell list in CSV format to evaluate as fantik-automations candidates. Produces a proposals report only — it must never implement any automation.
version: 0.1.0
---

# Spell Automation Triage

Evaluate a CSV list of dnd5e spells and decide, spell by spell, which ones deserve a custom automation in the fantik-automations module — and for those that do, propose what the automation should do. Processing happens in batches of 10 spells, analyzed by parallel Opus agents.

**Hard rule: this skill proposes automations, it NEVER implements them.** Do not write, scaffold, or edit any automation code, even if a proposal looks trivial. The deliverable is a report. If the user asks to implement a proposal afterwards, that is a separate task outside this skill.

## Inputs

- A spell CSV in the 5etools export format (`"Name","Source","Page","Level","Casting Time","Duration","School","Range","Components",...,"Text","At Higher Levels"`), e.g. `cantrips.txt` in the module root. If no CSV path was given, look for `*.csv`/`*.txt` spell exports in the module root and confirm the file with the user.
- The CSV may contain the same spell from multiple sources (PHB'14 and PHB'24) with **different mechanics** — the batching script merges them into one spell with all versions attached; evaluate each version.

## Workflow

### Step 1: Batch the CSV

Run the parsing script (handles quoted multi-line fields; naive line-splitting breaks on this format):

```bash
node "<skill-dir>/scripts/batch_spells.mjs" <spells.csv> --batch-size 10 --out spell-batches.json
```

It prints the unique-spell count and batch count, and writes `spell-batches.json` with `{spellCount, batchCount, batches: [[spell, ...], ...]}`. Each spell is `{name, level, school, castingTime, range, components, versions: [{source, duration, text, atHigherLevels}]}`. Write the output file to a temp location or the working directory — do not commit it.

### Step 2: Analyze batches with parallel agents

Spawn one agent per batch with `model: opus`, up to **5 agents concurrently** (send them in a single message; start the next wave as results return). For each agent, embed the batch's spells (name, level, and full text of every version — agents cannot see the conversation) plus the two reference files, using this prompt template:

```
Evaluate the following dnd5e spells as automation candidates for the
fantik-automations Foundry VTT module. First read these two files:
- <skill-dir>/references/evaluation-criteria.md  (the verdict rubric and worked examples)
- <skill-dir>/references/framework-capabilities.md  (what vanilla dnd5e already handles vs. what the framework can do)

Apply the rubric strictly: automate only spells that are combat-relevant AND
have internal logic beyond what vanilla dnd5e already performs. Be conservative.

Spells to evaluate (all source versions included; verdicts may differ per version):
<batch JSON>

Return ONLY a JSON array, one object per spell:
{
  "name": "...",
  "verdict": "automate" | "skip",
  "reason": "one sentence",
  // only when verdict is "automate":
  "proposal": {
    "version": "which source version this targets, if versions differ",
    "summary": "one-line pitch",
    "behavior": "2-5 sentences: what the automation does, step by step, from the player's perspective",
    "trigger": "which framework event(s) it uses",
    "settings": "per-item settings worth exposing, or 'none'",
    "feasibility": "ready" | "needs-new-event" | "needs-gm-or-rights",
    "notes": "cross-client concerns, missing events by name, parts intentionally left as description text"
  }
}
```

If an agent returns malformed output or dies, re-run that one batch; do not silently drop spells.

### Step 3: Aggregate into the report

Collect all agent results and write `spell-automation-proposals.md` in the module root (or a user-specified path). Verify the report's spell count equals the script's reported unique-spell count — every spell must have a verdict. Structure:

```markdown
# Spell Automation Proposals — <csv name>, <date>

Evaluated N spells: X automate, Y skip.

## Proposed automations

### <Spell Name> (<level>, <version>)
**Pitch:** ...
**Behavior:** ...
**Trigger:** ... · **Feasibility:** ready | needs-new-event (<event>) | needs-gm-or-rights
**Settings:** ...
**Notes:** ...

## Skipped
| Spell | Reason |
|---|---|
| Lightning Bolt | Vanilla handles template, save, damage, upcasting. |
```

Order proposals with `feasibility: ready` first. In the skipped table keep reasons to one line.

### Step 4: Summarize

Tell the user: totals, the automate list with one-line pitches, and any proposals blocked on missing framework events (grouped by which event would unblock them — several proposals wanting `attackRollComplete` is a signal worth surfacing). Do not start implementing anything.

## Verdict rubric (summary — the full rubric is in references/)

- **skip — vanilla handles it:** plain attack/save + damage spells (Lightning Bolt, Eldritch Blast).
- **skip — social/roleplay:** not used in battle (Druidcraft, Guidance).
- **automate:** combat spell with conditional or stateful logic — creates/modifies items (Shadow Blade), reacts to later events (Blade Ward '24, Chill Touch), needs a cast-time choice (Booming Blade), or manages scene objects with lifecycle (Darkness).

## Additional Resources

### Reference Files

- **`references/evaluation-criteria.md`** — full decision checklist, the eight canonical worked examples, feasibility flags, version-difference handling. Analyst agents must read this.
- **`references/framework-capabilities.md`** — what vanilla dnd5e already automates, what the framework's trigger events and patterns can do, GM-less constraints. Analyst agents must read this.

### Scripts

- **`scripts/batch_spells.mjs`** — CSV parser/batcher (Node, no dependencies). Merges duplicate source versions by spell name and emits JSON batches.
