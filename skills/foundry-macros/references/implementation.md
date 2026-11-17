# Implementation patterns and verified pitfalls

These are observations from Foundry 14 / dnd5e 6.0.3, not promises for future or older releases. Prefer installed source for the actual target version.

## Target picking and cleanup

- Resolve the HTML canvas as `canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById("board")` and validate it before accessing `.style`. The locally installed Foundry 14 uses PIXI 7's `app.view`; do not assume Foundry 14 implies PIXI 8's `app.canvas`. A mock exposing only `app.canvas` previously hid a real startup failure. Include a `view`-only test and a missing-canvas cleanup test.

- Resolve the caster from actor-bearing `canvas.tokens.controlled` first; only when none is selected, fall back to `game.user.character`. Multiple selected tokens need a compact caster choice, never an arbitrary first token. Keep the chosen token and its actual actor (including an unlinked token's synthetic actor) together. Resolve once before picking targets and use that actor consistently for rolls, resources, flags, and chat speaker; targets are not casters. If no actor or scene origin is available, offer manual/chat-only casting and omit unavailable effects. Check ownership only for operations that need it; lack of write access must not block a permitted chat card. Follow the nonblocking casting and optional resource-consumption rules in `../SKILL.md`.
- Foundry 14 uses `canvas.tokens.setTargets(ids, {mode: "replace"})`. The removed `game.user.updateTokenTargets()` caused the original macro to fail both when starting selection and when restoring targets. Do not repeat that API on v14. When older versions are requested, verify their own supported API rather than guessing a fallback.
- Store beam assignments in an **array**, not `game.user.targets`, because the latter is a set of unique tokens. Only deduplicate when updating Foundry's visual target markers.
- Capture canvas-only pointer events; leave UI controls usable. Convert client coordinates with `canvas.canvasCoordinatesFromClient`. Hit-test visible tokens with actors. Empty-space clicks should not consume an assignment. Follow the specific spell's policy for targeting self.
- Store the source scene id and previous targets. Restore only still-existing targets in the same scene. Cancel on `canvasTearDown`. Do not restore stale ids into another scene.
- Treat selection as a cancellable operation. Remove DOM/event/Hook listeners and restore cursor styles on completion, cancellation, initialization failure, and teardown. Each cleanup action must tolerate another cleanup action throwing; always settle the picker promise.
- For re-entry protection, use a macro-specific key, e.g. `Symbol.for("<namespace>.<macro>.running")`, holding a run object with a cancellation callback. Do not copy the example's key into another macro. Restarting a pending picker may cancel it, but do not start a second roll workflow while the first is resolving.
- Release the run lock in a nested `finally`, independently of restoring targets. Check lock ownership before deleting it so an old run cannot clear a newer run's lock. The example also recovers its legacy boolean lock when no old panel remains.

## Roll data and chat messages

- In the example, the character's total level comes from `actor.system.details.level`, so multiclass levels count. NPC scaling needs a separate rule; do not silently substitute CR for every spell.
- Resolve spell attack and save DC from the resolved caster (selected token actor first, `game.user.character` fallback) on each use using the target system's prepared spellcasting data/formulas, including actor bonuses and effects. Do not require an Item lookup or hard-code a default attack/DC. Honor a relevant explicitly configured source; otherwise choose the first source automatically, with an override under settings rather than another prompt. dnd5e 6 attack activities expose `getAttackData()` returning `{parts, data}`; an explicitly bound activity can provide spell-specific adjustments based on the same character, but is not a prerequisite for a standalone roll. Offer manual values only when automatic data cannot be resolved. Do not overwrite the actor's item to prepare a macro roll.
- For simple advantage/disadvantage use `2d20kh1` / `2d20kl1`. Inspect evaluated dice/results, not totals, for natural results. A retained result has `active !== false` and is not `discarded`. The attack's own d20, rather than a bonus die, determines critical handling.
- Show every d20 result in the total's hover tooltip, striking through dropped results; do not add permanent raw-dice rows by default. Both dropped and retained 1/20 can retain their semantic colors, but only the retained attack d20 controls the total's color and critical damage.
- The example's critical rule doubles `1d10` to `2d10` and leaves the flat bonus unchanged. Respect requested system settings, special critical ranges, and spell-specific damage rules rather than applying this rule universally.
- Use `roll.toAnchor(...)` for inspectable totals. Keep the actual Roll objects and serialized history. Ordinarily attach evaluated rolls to `ChatMessage.rolls`; for one updating card with a native damage tray, store only the current damage there and retain all other evaluated rolls in the history flag and roll anchors, as described in [ui-design.md](ui-design.md). The native tray sums its damage rolls, so do not include prior steps. The historical example adds `inline-dsn-hidden` to inline anchors to avoid duplicate inline Dice So Nice animations. That class alone does NOT implement the required wait-before-card lifecycle or suppress the main message's automatic animation; use [dice-lifecycle.md](dice-lifecycle.md). Do not roll the same dice again to display details.
- Preserve chat privacy with `ChatMessage.applyMode(message)` before creation. Public roll animations can be shared; the example keeps non-public animations local to the roller.
- Escape token/actor names and editable text inserted into markup. A name such as `<Goblin>` must render as text. Avoid user input embedded as executable code.

## Card design and SVG in chat

- Use [ui-design.md](ui-design.md): one compact row of dice-icon totals under each target, complete evaluated values in hover tooltips, and no duplicate raw-dice/formula rows. Let long target names wrap without squeezing totals.
- Inline styles in message content travel with the message; styles injected only into the casting user's page do not style other clients. Scope picker CSS by its unique root id.
- Foundry 14's chat `content` is an `HTMLField` processed server-side by `cleanHTML`. Its allowed tags exclude inline `<svg>`, but include `<img>` and `data:` sources. The example embeds drawings as `src="data:image/svg+xml,${encodeURIComponent(svg)}"`; no file upload or separate asset installation is needed.
- This was tested against the installed `dist/database/validators.mjs` sanitizer and rendered in a browser. Recheck for another version or different media policy. Do not promise universal support or disable sanitization. Local SVG files referenced through allowed image paths are another option when the user wants separately managed assets.
- Reserve dimensions for the spell artwork and keep decoration outside interactive roll anchors. Ears, whiskers, and paws apply only to the historical cat-themed example. Preserve the content's readability even when a decorative image fails.

## Animation

- The example uses active Sequencer plus an available JB2A database entry. File presence alone does not establish that a module is enabled or its database registered.
- Resolve dice through the selected Dice So Nice lifecycle, then reveal the result card. Coordinate spell effects separately from the dice completion barrier. The historical example publishes first and plays effects afterwards; do not copy that ordering as a Dice So Nice implementation. Animation failure must not discard roll results or repeat a cast.
- For simultaneous volleys, add one effect per beam to a single Sequence without per-beam `waitUntilFinished`; use a shared unique sync group. Offset origins perpendicular to the target direction so repeated shots into one token remain distinguishable.
- Actual database keys found locally include `jb2a.eldritch_blast.orange` and `.purple`; verify keys before reuse. Fall back gracefully if assets are missing.
- With manual adjudication, animate toward selected targets without AC-based miss effects. Do not turn a decorative effect into an implied hit result.
- Running Midi-QOL/Chris's Premades activities is a separate integration mode. The example does not trigger their workflows. Avoid accidentally applying damage twice or running their per-beam animations alongside a custom volley.

For sequential effects, inspect the installed Sequencer lifecycle: a persistent effect's `play()` can stay pending until the effect ends. Await its verified creation signal when the next action must become available; do not wait for the infinite loop to finish. Use cast-specific names and end only those effects in cleanup. Match projectile and waiting-loop tint to the selected damage type; a neutral JB2A asset plus Sequencer `tint()` preserves the effect's motion while changing color. Verify database keys and active modules.

## Meaningful checks

Use the real macro wrapper shape where possible: Foundry 14 wraps the command in a block inside an AsyncFunction with `speaker`, `actor`, `token`, `character`, and `scope` parameters. A mock must not invent APIs that the target version lacks—the first mock incorrectly supplied `game.user.updateTokenTargets` and missed a live failure.

For changes to the picker or rolls, cover repeated clicks, undo, cancel, scene change, invalid inputs, dropped critical dice, and injected errors during cleanup. For styling, generate a preview from actual macro markup, not a separately recreated design. Deliver only the final JavaScript source, without a JSON export.
