"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mediasource_helper_1 = require("./utils/mediasource-helper");
function isSupported() {
    const mediaSource = mediasource_helper_1.getMediaSource();
    if (!mediaSource) {
        return false;
    }
    const sourceBuffer = SourceBuffer || window.WebKitSourceBuffer;
    const isTypeSupported = mediaSource &&
        typeof mediaSource.isTypeSupported === 'function' &&
        mediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
    // if SourceBuffer is exposed ensure its API is valid
    // safari and old version of Chrome doe not expose SourceBuffer globally so checking SourceBuffer.prototype is impossible
    const sourceBufferValidAPI = !sourceBuffer ||
        (sourceBuffer.prototype &&
            typeof sourceBuffer.prototype.appendBuffer === 'function' &&
            typeof sourceBuffer.prototype.remove === 'function');
    return !!isTypeSupported && !!sourceBufferValidAPI;
}
exports.isSupported = isSupported;
//# sourceMappingURL=is-supported.js.map