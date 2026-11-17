# Dice So Nice: resolve first, reveal afterwards

The user's requirement is that dice are displayed in 3D when possible, **all actually rolled dice remain available**, and the result card appears only after dice resolution. This is a required behavior, not an optional visual flourish.

## Pick a lifecycle supported by the installed version

1. Inspect the active module/API and whether interactive throws are enabled. Preserve user/world settings rather than silently changing them.
2. Resolve the caster (selected token first, assigned character fallback), target assignments, roll mode, and intended viewers before displaying dice.
3. Evaluate each roll exactly once, or let the supported interactive-throw workflow produce the final evaluated rolls. Preserve dropped/rerolled/exploded results. Display the actual roll objects; do not create decorative rerolls, pre-filter dice, or rebuild a result from its total.
4. Await all required throw completions. If critical damage depends on an attack, use that attack's final retained result before determining the damage dice. Keep the lock active while resolving.
5. Publish/reveal the styled card using those same final rolls. Store evaluated data and expose complete breakdowns in total hover tooltips. Normally use `ChatMessage.rolls`; for an updating native damage tray, keep only the current damage there and preserve the rest in serialized history and inspectable anchors (see [ui-design.md](ui-design.md)). Prevent duplicate automatic throws using the installed module's supported per-message mechanism.

Do not use a fixed sleep to guess completion. Do not publish a visible result card and then await an animation. If using a module-managed pending/hidden message, verify that it hides the actual result for every intended viewer until resolution and does not briefly flash final values. Do not imply that waiting on the roller's local completion guarantees all remote clients have completed; verify the recipient lifecycle where synchronized per-viewer reveal is required.

## Locally inspected API evidence

On 2026-10-30 the installed Dice So Nice manifest reported **6.3.1**, for Foundry 14. Source-map implementations showed:

- `Dice3D.showForRoll(roll, user = game.user, synchronize, users = null, blind, messageID = null, speaker = null, options = {ghost: false, secret: false})` delegates to the roll pipeline and returns a Promise documented as resolving to whether an animation was displayed. Inspect the pipeline's completion semantics for the chosen mode before relying on it as the barrier.
- The chat interception code returns early for `message.getFlag("dice-so-nice", "skip")`. The interactive pending-throw stamping path also respects that flag. For an explicitly animated-and-awaited roll sequence, a later message can use `flags: {"dice-so-nice": {skip: true}}` to prevent replay while retaining its rolls. Set that only as part of the verified explicit display path, not to silently skip the one intended throw.
- `waitFor3DAnimationByMessageID` listens for `diceSoNiceRollComplete`. Register waits before a possible completion event; do not await it after completion or when no animation will occur. A missed event can otherwise leave the macro waiting indefinitely.
- This installation also has a pending interactive-throw lifecycle. A pre-created card can contain provisional values in that mode. Read the resolved message/roll state when completion occurs instead of retaining a stale HTML snapshot.

These are version-specific observations, not universal guarantees. Prefer public APIs where sufficient; do not patch module internals or globally disable its hooks. The old example's `inline-dsn-hidden` class controls inline replay only and is not enough by itself.

## Completeness, privacy, and graceful failure

- All attack, damage, modifier, critical, discarded, rerolled, and exploded dice must remain in the stored results and be visible in the total's hover tooltip without requiring a click. Include the formula, all die values, struck-through dropped values, and the total; omit duplicate permanent breakdown rows in the compact card. If a 3D dice limit applies, use supported batching rather than dropping dice. Do not change world limits without authorization.
- Match animation recipients to chat whisper/blind/self-roll settings. Never broadcast private numeric results to everyone merely to enable 3D animation. Respect users who have disabled 3D dice; no forced global setting changes.
- If Dice So Nice is absent, disabled, or cannot display the throw, use ordinary evaluated rolls and report that fallback briefly. Do not fabricate an animation or block forever waiting for an event that cannot happen.
- If animation fails after some dice have been shown, retain the rolled data, avoid replaying the completed dice, and permit clear fallback delivery. Do not re-evaluate or silently lose a roll.
- Test with deferred completion promises or actual module events: before resolution no result card; after resolution exactly one card; unchanged die values and no duplicated throws. Also test disabled/absent Dice So Nice and private roll modes.
