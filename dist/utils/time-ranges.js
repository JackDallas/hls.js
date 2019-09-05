"use strict";
/**
 *  TimeRanges to string helper
 */
Object.defineProperty(exports, "__esModule", { value: true });
const TimeRanges = {
    toString: function (r) {
        let log = '';
        let len = r.length;
        for (let i = 0; i < len; i++) {
            log += '[' + r.start(i).toFixed(3) + ',' + r.end(i).toFixed(3) + ']';
        }
        return log;
    }
};
exports.default = TimeRanges;
//# sourceMappingURL=time-ranges.js.map