async function cast(context) {
    // Cantrips (level 0) just roll a flat 1, leveled spells roll level * d4.
    const formula = context.castLevel > 0 ? `${context.castLevel}d4` : '1';
    const roll = await new Roll(formula, context.actor?.getRollData()).evaluate();
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor: context.actor}),
        flavor: game.i18n.localize('FANTIK-AUTOMATIONS.IncomprehensibleMagicalEffect.Healing')
    }, {
        rollMode: 'publicroll'
    });
}

export const incomprehensibleMagicalEffect = {
    id: 'incomprehensibleMagicalEffect',
    name: 'Незрозумілий магічний ефект',
    description: 'Whenever the actor casts any spell (hit or miss), rolls healing to chat: cast level × d4 for leveled spells (upcasting counts), flat 1 for cantrips.',
    version: '1.0.0',
    match: {
        // Actor scope: fires when the caster owns the feature item, whatever spell they cast
        actorItemNames: ['Незрозумілий магічний ефект']
    },
    events: [
        // Actor-bound: intentionally fires for EVERY spell the owning actor casts.
        {
            event: 'spellCastComplete',
            handler: cast,
            priority: 50,
            scopes: ['actor']
        }
    ]
};
