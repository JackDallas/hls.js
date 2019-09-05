"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function sendAddTrackEvent(track, videoEl) {
    let event;
    try {
        event = new Event('addtrack');
    }
    catch (err) {
        // for IE11
        event = document.createEvent('Event');
        event.initEvent('addtrack', false, false);
    }
    event.track = track;
    videoEl.dispatchEvent(event);
}
exports.sendAddTrackEvent = sendAddTrackEvent;
function clearCurrentCues(track) {
    if (track && track.cues) {
        while (track.cues.length > 0) {
            track.removeCue(track.cues[0]);
        }
    }
}
exports.clearCurrentCues = clearCurrentCues;
//# sourceMappingURL=texttrack-utils.js.map