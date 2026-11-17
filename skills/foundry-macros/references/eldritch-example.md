# Reusable Eldritch Blast example

Snapshot of the user's approved macro, preserved 2026-10-30.

This is a **historical design/code example**, not a complete implementation of the current global rules. It posts the card without explicitly awaiting Dice So Nice completion, and shows raw d20s directly but leaves damage die details in clickable rolls. New macros must correct these behaviors according to `SKILL.md` and [dice-lifecycle.md](dice-lifecycle.md). The ginger cat design is only one possible theme, never a global default.

## What it provides

- Foundry 14 / dnd5e 6.0.3 Script macro with 1/2/3/4 beams at total character levels 1/5/11/17.
- Compact ginger picker with repeated target clicks, undo, Esc, per-beam advantage/disadvantage, and collapsible bonus/color settings.
- Cat-shaped chat card with ears, whiskers, nose, stripes, and paws. Embedded SVG images; no additional artwork files.
- Target names, clickable attack and damage totals, every d20 result, crossed-out discarded dice, green natural 20 and red natural 1.
- Simultaneous orange JB2A beams through Sequencer, with separate origins for repeated targets.
- Recoverable run state and cleanup independent of target restoration failures.

## Files and adaptation

Copy [../assets/eldritch-blast.js](../assets/eldritch-blast.js) to the task output folder when it is a useful starting point. Adapt mechanics, item identification, colors, names, and run-lock/DOM ids for the new macro. The SVG strings (`catHead`, `catPaws`) and renderer (`drawing`) can be reused without copying Eldritch Blast's mechanics.

The test harness [../scripts/test_eldritch_example.cjs](../scripts/test_eldritch_example.cjs) runs the bundled example with mocked Foundry objects. Its optional positional argument selects another macro file with the same interface. It has 19 cases covering level boundaries, duplicate targets, advantage/disadvantage, retained/dropped critical dice, cancellation, and failure recovery. It does not cover the current caster-resolution or Dice So Nice lifecycle requirements. Adapt the mocks and add those behavior checks when updating the example or deriving a new macro.

## Limits to keep explicit

- No automatic HP, hit/miss determination, range, line-of-sight, cover, reactions, Hex, Repelling Blast, or other invocation handling.
- Damage is rolled for every beam. Agonizing Blast's flat bonus starts at zero and is user-editable. Natural 20 doubles the d10, not that bonus.
- Selection uses visible token hit-testing, not a comprehensive legality check.
- NPC levels are not supported by this character-level example.
- The generic spell-attack fallback may miss item-specific bonuses if the spell cannot be found. Do not treat the spell-name matching list as exhaustive.
- Settings are not persisted across casts. Additional animations, sounds, or workflow integration must be implemented when requested; they were discussed but are not present in this snapshot.
- Automated tests and sanitized browser previews passed. A full live Foundry cast was not run by the agent. Older system/Foundry compatibility is not established.
