"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eventemitter3_1 = require("eventemitter3");
/**
 * Simple adapter sub-class of Nodejs-like EventEmitter.
 */
class Observer extends eventemitter3_1.EventEmitter {
    /**
     * We simply want to pass along the event-name itself
     * in every call to a handler, which is the purpose of our `trigger` method
     * extending the standard API.
     */
    trigger(event, ...data) {
        this.emit(event, event, ...data);
    }
}
exports.Observer = Observer;
//# sourceMappingURL=observer.js.map