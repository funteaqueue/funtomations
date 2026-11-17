// Зміїний язик — Serpent Tongue. Foundry VTT 14 / dnd5e 5.3.3 and 6.x.
// Fantik Automations owns persistent card buttons and timed poison cleanup.
const serpent = game.modules.get('fantik-automations')?.api?.serpentTongue;
if (!serpent?.use) return ui.notifications.warn('Онови Fantik Automations до 0.4.1+ та перезавантаж клієнти.');
await serpent.use({
    item: typeof item !== 'undefined' ? item : undefined,
    activity: typeof activity !== 'undefined' ? activity : undefined
});
