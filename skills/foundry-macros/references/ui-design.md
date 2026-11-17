# Accepted macro design and UI/UX

User-approved default, 2026-11-02. Apply this visual and interaction language to new Foundry macros without asking the user to restate it. Adapt controls to the spell; do not display irrelevant slot, target, attack, or damage controls. A new explicit request overrides this reference.

## Compactness takes priority

- Put anything that fits readably together on one row: related selectors, switches, totals, metadata, and actions. Do not give each field its own row by habit. Avoid overflowing or shrinking controls into unreadability.
- Show each fact once. Do not repeat a target, result, formula, resource state, spell name in another language, or instruction in several places unless it is necessary to identify an action. The reference macro is a starting point, not a mandate to reproduce every label.
- If information can live in a hover tooltip without obscuring the current choice or action, put it there. This includes roll details, full names behind abbreviations/icons, control explanations, and secondary metadata. Preserve keyboard focus access and accessible control names.
- No unnecessary visible text: no decorative subtitles, repeated labels, explanatory paragraphs, filler hints, or redundant completion/result blocks. Use clear icons with tooltips where a label would only restate their meaning. Keep only text needed to identify the spell/target/value, make a choice, or resolve an actionable error.
- Before delivery, inspect every visible row and string: can it share a row, is it duplicated, can it move to hover, or can it be removed? Apply this pass to the card, main picker, and expanded settings. Compactness is achieved by removing redundancy, not by making everything smaller.

## Reference and scope

Use [../assets/chromatic-orb.js](../assets/chromatic-orb.js) as the concrete example. The supplied v3.1 example includes a shared target-queue route and step-by-step rolls in one card: native Apply integration, chromatic artwork, elemental JB2A tint, formula tooltips, remembered element, and a real aiming mouse cursor. It works with the existing Fantik Automations API 4 integration; custom API 5 damage/healing buttons are not the chosen design.

Relevant functions:

| Concern | Reference functions |
| --- | --- |
| Card, dice icons, artwork | `orbCard`, `orbAnchor`, `orbDieIcon`, `orbArt` |
| Full formula with evaluated dice | `orbTooltip` |
| Compact panel and actual cursor | `orbCreateUI`, its `syncCursor` |
| Range overlay, route, JB2A flight/loop | `orbCreateVisual`, `orbCreateSharedRoute` |
| One card, current native damage, history | `orbPublish` |
| Remembered user choice | `orbRememberedType`, `orbRememberType` |
| Caster, sources, dice/resources | corresponding `orbResolve*`, `orbSources`, `orbConsume` helpers; also read their dedicated references |

Copy relevant code into the new task, rename ids/locks/flags/effect names, and adapt it. Do not automatically rewrite this reference asset while creating an unrelated macro. Its Chromatic Orb damage scaling, d8 duplicates, bounce limits, target uniqueness, healing use case, and manual jump button are spell-specific. Do not copy them into other spells. User feedback informed this design; local source inspection, browser previews, and mock tests do not constitute complete live-world verification of every integration.

## Visual language

- Dark charcoal card and panel (`#202326`), off-white text (`#f4efe5`), muted gold borders/accent (`#81745d`, `#c6b48d`), warm gold primary action (`#d4bf8f`). Use an elemental/spell accent where meaningful while keeping the shared frame consistent.
- Thin borders, approximately 9–10 px corner radius, 12–14 px padding. Serif spell heading around 18–20 px; clean sans-serif controls around 11–12 px. Secondary metadata around 9–10 px. Preserve contrast and focus visibility.
- Card must fit a 250–270 px chat column. Panel is about 390 px wide, constrained to the viewport, draggable, and leaves the map usable. Keep long target names readable.
- Small spell-specific artwork above the title, not a large banner or a paragraph of flavor. Use encoded SVG `<img>` for code-native art. Chromatic Orb's artwork is a **multicolored faceted sphere**, not a diamond and not recolored for the selected element. Other spells get their own appropriate artwork.
- No redundant descriptive text, result summary block, permanent raw-dice rows, or boilerplate about height, cover, and walls in the UI. Necessary actionable errors may appear briefly; technical limits belong in delivery notes.

## Main panel

- Keep frequently used choices on the main screen. For spells using slots, put levels and **Магія пакту** in the same selector, preserving the actual resource pool and its level. Place a small **Списати чарунку** switch beside/below it; use **Списати ресурси** when appropriate to the binding.
- If range checking is relevant, put **Ігнорувати відстань** to the right of the consumption switch. Do not call it “Відстань вручну”. This changes picker validation, not world settings.
- Attack mode is a horizontal three-way control: **Завада / Нормальна / Перевага**, never a dropdown. Respect per-target mode where multiple attacks require it.
- Put source override, fallback manual bonus, and optional animation settings behind a gear. An explicit bound spell/activity source wins; otherwise use the first available spellcasting source automatically, without a selection prompt or choosing the highest bonus.
- Keep primary actions, completion/cancellation, **Без цілі**, and **Лише картка в чат** in a compact single footer row where practical. Use an accessible undo icon with Backspace support when needed. Keep fallback actions on the main screen. Prevent overflow on narrow viewports; do not make an unreadably small row just to meet a fixed pixel width.
- Use scoped CSS and small `button[role=switch]` controls with `aria-checked` (or equivalently robust accessible controls). Foundry's global checkbox pseudo-elements previously broke the layout. Keep keyboard focus states.
- For a spell with selectable elements, remember the latest element per user in that world using a macro-specific User flag. Validate stored values, fall back safely, and serialize rapid writes. A preference-write failure must not block casting. Do not persist targets, pending rolls, or spent-resource state as a reusable preference.

## Target selection

- During picking, **replace the mouse pointer over the canvas with an aiming cursor**. The center is the click hotspot. Do not interpret this as drawing a large reticle attached to a token.
- The reference uses a 32 px encoded SVG cursor, hotspot `16 16`, and a cast-specific canvas class whose CSS rule overrides PIXI's normal inline hover cursor. Remove that class/style when selection ends, on cancellation, and during teardown; leave the application's own cursor state intact. UI controls retain their normal cursors. Use a crosshair fallback.
- Cursor can use the spell/element accent; use red for an invalid or already-assigned target when repetition is disallowed. Color reflects picker legality, not an AC-based hit prediction.
- Show a clearly visible range circle: contrasting dark backing, solid colored contour around 2.5 px, very light fill around 7.5%, and a legible distance label. Update it from the appropriate origin and camera coordinates. Keep overlays non-interactive (`pointer-events:none`).
- Show target order with numbered scene markers and route lines. Avoid duplicating the queue as a long list/chips in the panel. Keep a small selected/maximum counter.
- Queue targets before rolling when the spell permits. For a sequential mechanic, advance only after the required result/confirmation; do not pre-roll future damage. Close the picker when no continuation remains instead of leaving a “finished/no double” panel open. For hidden rolls, the panel must not disclose the hidden result through its state; use GM-guided continuation as needed.

## Chat results and hover details

- Prefer one evolving card per cast, with a readable row per resolved target. Attack and damage totals sit on **one line**, prefixed by dice icons rather than repeated “Атака / Шкода / Зцілення” labels. Use d20 for attacks and the appropriate die/generic icon for damage. Actual necessary save/DC labels remain meaningful.
- No duplicate lines such as `d20: 6`, `1d20+2+5`, or `d8: 7 · 2 · 5` under the totals.
- Hovering either total shows the formula with **every evaluated die result inside its dice term** and the final sum. Example: `1d20(<s>5</s> | 14) + 2 + 5 = 21`; damage: `3d8(2 | 3 | 4) = 9`. Use real `<s>` markup, not literal Markdown tildes. Preserve all discarded/rerolled/exploded/bonus dice. The compact retained-d20 display does not change the underlying advantage roll data.
- `Roll.toAnchor` preserves the serialized roll and inspection behavior. On the verified Foundry 14 build it accepts `dataset: {tooltipHtml: ...}`; this takes precedence over the default formula-only `tooltipText`. Escape names/formulas, generate only trusted markup, and check server sanitization. Do not alter `data-roll` or invent dice to render a tooltip.
- Keep critical/natural-1 semantics based on the retained attack die. Damage totals may use elemental accents. Brief spell-specific status such as “Дубль” is fine when it determines continuation.

## Native Apply and one-card history

- Prefer the already available **standard Apply picker**. Do not add custom damage/healing buttons, automatic hit/miss badges, or require a module update solely to recreate this UI. For this user's orb healing workflow, the GM can set the native multiplier to **−1**.
- The existing Fantik Automations API 4 / metadata version 2 can preserve the system-created `damage-application` element in `[data-fantik-damage]`. Do not fabricate a disconnected imitation of the native control or assume a player macro installs handlers on GM clients.
- A native damage tray aggregates `ChatMessage.rolls`. For sequential damage to different targets, include **only the current step's DamageRoll(s)** there and update `system.targets` to that step's recorded target(s). Preserve every prior evaluated attack/damage roll in a serialized cast-history flag and inspectable anchors in the same card. Do not accidentally apply cumulative chain damage or attack totals to the latest target.
- In this implementation the GM applies the current result **before advancing**. The history remains inspectable; the native picker does not automatically select arbitrary historical rows. Explain that limitation briefly when delivering the macro. Do not claim custom duplicate-application protection for a standard picker.
- Without the optional existing integration, keep a usable ordinary card/manual path. Do not silently lose roll history. Preserve whisper/blind visibility and never change HP on render or cast.

## Animation

- Prefer appropriate installed JB2A effects through Sequencer; keep the shape/motion when adjusting color. Tint both flight and any waiting loop to the selected element. Neutral assets plus `tint()` are useful when available; verify asset keys and the installed API.
- Accepted elemental direction: fire orange/red, cold ice blue, lightning violet, acid lime, poison green, thunder lilac. Artwork need not use the same tint: Chromatic Orb's card sphere stays chromatic. Range overlays may use the element accent.
- For a spell with a manual next-step action, a temporary loop may wait at the current target. Do not await a persistent effect's entire lifetime before enabling that action. Stop cast-specific effects when advancing or ending, respect reduced motion and chat privacy, and add no sound unless requested.

## Verification focus

Inspect actual generated UI at narrow chat/panel widths, not a separate mock design. Check that native controls retain their handlers, current damage/targets do not aggregate old steps, tooltips preserve all dice and strikeouts, and cursor CSS wins over ordinary canvas hover styles and cleans up. Verify remembered choices independently between users. Preserve the dice-completion, resource, privacy, and fallback checks in the main skill.
