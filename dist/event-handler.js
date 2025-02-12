"use strict";
/*
*
* All objects in the event handling chain should inherit from this class
*
*/
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./utils/logger");
const errors_1 = require("./errors");
const events_1 = require("./events");
const FORBIDDEN_EVENT_NAMES = {
    'hlsEventGeneric': true,
    'hlsHandlerDestroying': true,
    'hlsHandlerDestroyed': true
};
class EventHandler {
    constructor(hls, ...events) {
        this.hls = hls;
        this.onEvent = this.onEvent.bind(this);
        this.handledEvents = events;
        this.useGenericHandler = true;
        this.registerListeners();
    }
    destroy() {
        this.onHandlerDestroying();
        this.unregisterListeners();
        this.onHandlerDestroyed();
    }
    onHandlerDestroying() { }
    onHandlerDestroyed() { }
    isEventHandler() {
        return typeof this.handledEvents === 'object' && this.handledEvents.length && typeof this.onEvent === 'function';
    }
    registerListeners() {
        if (this.isEventHandler()) {
            this.handledEvents.forEach(function (event) {
                if (FORBIDDEN_EVENT_NAMES[event]) {
                    throw new Error('Forbidden event-name: ' + event);
                }
                this.hls.on(event, this.onEvent);
            }, this);
        }
    }
    unregisterListeners() {
        if (this.isEventHandler()) {
            this.handledEvents.forEach(function (event) {
                this.hls.off(event, this.onEvent);
            }, this);
        }
    }
    /**
     * arguments: event (string), data (any)
     */
    onEvent(event, data) {
        this.onEventGeneric(event, data);
    }
    onEventGeneric(event, data) {
        let eventToFunction = function (event, data) {
            let funcName = 'on' + event.replace('hls', '');
            if (typeof this[funcName] !== 'function') {
                throw new Error(`Event ${event} has no generic handler in this ${this.constructor.name} class (tried ${funcName})`);
            }
            return this[funcName].bind(this, data);
        };
        try {
            eventToFunction.call(this, event, data).call();
        }
        catch (err) {
            logger_1.logger.error(`An internal error happened while handling event ${event}. Error message: "${err.message}". Here is a stacktrace:`, err);
            this.hls.trigger(events_1.default.ERROR, { type: errors_1.ErrorTypes.OTHER_ERROR, details: errors_1.ErrorDetails.INTERNAL_EXCEPTION, fatal: false, event: event, err: err });
        }
    }
}
exports.default = EventHandler;
//# sourceMappingURL=event-handler.js.map