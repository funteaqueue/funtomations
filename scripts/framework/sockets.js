import {MODULE_ID} from './constants.js';

/**
 * Thin peer-to-peer message bus over Foundry's built-in module socket.
 * Messages are broadcast to all OTHER connected clients directly by the server,
 * no GM client is required to relay anything.
 */
const CHANNEL = `module.${MODULE_ID}`;
const handlers = new Map();

export function initSockets() {
    game.socket.on(CHANNEL, payload => {
        const handler = handlers.get(payload?.event);
        if (!handler) return;
        Promise.resolve(handler(...(payload.args ?? []))).catch(error => {
            console.error(`${MODULE_ID} | Socket handler "${payload.event}" failed`, error);
        });
    });
}

/**
 * Register a handler for a socket event. Namespace events per automation, e.g. 'casino.spin'.
 * @param {string} event
 * @param {Function} handler
 */
export function registerSocketHandler(event, handler) {
    if (handlers.has(event)) {
        console.warn(`${MODULE_ID} | Socket handler "${event}" registered twice, overwriting`);
    }
    handlers.set(event, handler);
}

/**
 * Broadcast an event to all other connected clients (never runs locally).
 * @param {string} event
 * @param {...*} args
 */
export function emitToOthers(event, ...args) {
    game.socket.emit(CHANNEL, {event, args});
}
