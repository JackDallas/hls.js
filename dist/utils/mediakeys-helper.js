"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMediaKeySystemAccess
 */
var KeySystems;
(function (KeySystems) {
    KeySystems["WIDEVINE"] = "com.widevine.alpha";
    KeySystems["PLAYREADY"] = "com.microsoft.playready";
})(KeySystems = exports.KeySystems || (exports.KeySystems = {}));
const requestMediaKeySystemAccess = (function () {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.requestMediaKeySystemAccess) {
        return window.navigator.requestMediaKeySystemAccess.bind(window.navigator);
    }
    else {
        return null;
    }
})();
exports.requestMediaKeySystemAccess = requestMediaKeySystemAccess;
//# sourceMappingURL=mediakeys-helper.js.map