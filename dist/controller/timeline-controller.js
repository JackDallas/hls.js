"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("../events");
const event_handler_1 = require("../event-handler");
const cea_608_parser_1 = require("../utils/cea-608-parser");
const output_filter_1 = require("../utils/output-filter");
const webvtt_parser_1 = require("../utils/webvtt-parser");
const logger_1 = require("../utils/logger");
const texttrack_utils_1 = require("../utils/texttrack-utils");
// TS todo: Reduce usage of any
class TimelineController extends event_handler_1.default {
    constructor(hls) {
        super(hls, events_1.default.MEDIA_ATTACHING, events_1.default.MEDIA_DETACHING, events_1.default.FRAG_PARSING_USERDATA, events_1.default.FRAG_DECRYPTED, events_1.default.MANIFEST_LOADING, events_1.default.MANIFEST_LOADED, events_1.default.FRAG_LOADED, events_1.default.LEVEL_SWITCHING, events_1.default.INIT_PTS_FOUND);
        this.media = null;
        this.enabled = true;
        this.textTracks = [];
        this.tracks = [];
        this.initPTS = [];
        this.unparsedVttFrags = [];
        this.cueRanges = [];
        this.captionsTracks = {};
        this.lastSn = -1;
        this.prevCC = -1;
        this.vttCCs = null;
        this.hls = hls;
        this.config = hls.config;
        this.Cues = hls.config.cueHandler;
        this.captionsProperties = {
            textTrack1: {
                label: this.config.captionsTextTrack1Label,
                languageCode: this.config.captionsTextTrack1LanguageCode
            },
            textTrack2: {
                label: this.config.captionsTextTrack2Label,
                languageCode: this.config.captionsTextTrack2LanguageCode
            }
        };
        if (this.config.enableCEA708Captions) {
            const channel1 = new output_filter_1.default(this, 'textTrack1');
            const channel2 = new output_filter_1.default(this, 'textTrack2');
            this.cea608Parser = new cea_608_parser_1.default(0, channel1, channel2);
        }
    }
    addCues(trackName, startTime, endTime, screen) {
        // skip cues which overlap more than 50% with previously parsed time ranges
        const ranges = this.cueRanges;
        let merged = false;
        for (let i = ranges.length; i--;) {
            let cueRange = ranges[i];
            let overlap = intersection(cueRange[0], cueRange[1], startTime, endTime);
            if (overlap >= 0) {
                cueRange[0] = Math.min(cueRange[0], startTime);
                cueRange[1] = Math.max(cueRange[1], endTime);
                merged = true;
                if ((overlap / (endTime - startTime)) > 0.5) {
                    return;
                }
            }
        }
        if (!merged) {
            ranges.push([startTime, endTime]);
        }
        this.Cues.newCue(this.captionsTracks[trackName], startTime, endTime, screen);
    }
    // Triggered when an initial PTS is found; used for synchronisation of WebVTT.
    onInitPtsFound(data) {
        const { frag, id, initPTS } = data;
        const { unparsedVttFrags } = this;
        if (id === 'main') {
            this.initPTS[frag.cc] = initPTS;
        }
        // Due to asynchronous processing, initial PTS may arrive later than the first VTT fragments are loaded.
        // Parse any unparsed fragments upon receiving the initial PTS.
        if (unparsedVttFrags.length) {
            this.unparsedVttFrags = [];
            unparsedVttFrags.forEach(frag => {
                this.onFragLoaded(frag);
            });
        }
    }
    getExistingTrack(trackName) {
        const { media } = this;
        if (media) {
            for (let i = 0; i < media.textTracks.length; i++) {
                let textTrack = media.textTracks[i];
                if (textTrack[trackName]) {
                    return textTrack;
                }
            }
        }
        return null;
    }
    createCaptionsTrack(trackName) {
        const { captionsProperties, captionsTracks, media } = this;
        const { label, languageCode } = captionsProperties[trackName];
        if (!captionsTracks[trackName]) {
            // Enable reuse of existing text track.
            const existingTrack = this.getExistingTrack(trackName);
            if (!existingTrack) {
                const textTrack = this.createTextTrack('captions', label, languageCode);
                if (textTrack) {
                    // Set a special property on the track so we know it's managed by Hls.js
                    textTrack[trackName] = true;
                    captionsTracks[trackName] = textTrack;
                }
            }
            else {
                captionsTracks[trackName] = existingTrack;
                texttrack_utils_1.clearCurrentCues(captionsTracks[trackName]);
                texttrack_utils_1.sendAddTrackEvent(captionsTracks[trackName], media);
            }
        }
    }
    createTextTrack(kind, label, lang) {
        const media = this.media;
        if (!media) {
            return;
        }
        return media.addTextTrack(kind, label, lang);
    }
    destroy() {
        super.destroy();
    }
    onMediaAttaching(data) {
        this.media = data.media;
        this._cleanTracks();
    }
    onMediaDetaching() {
        const { captionsTracks } = this;
        Object.keys(captionsTracks).forEach(trackName => {
            texttrack_utils_1.clearCurrentCues(captionsTracks[trackName]);
            delete captionsTracks[trackName];
        });
    }
    onManifestLoading() {
        this.lastSn = -1; // Detect discontiguity in fragment parsing
        this.prevCC = -1;
        this.vttCCs = {
            ccOffset: 0,
            presentationOffset: 0,
            0: {
                start: 0, prevCC: -1, new: false
            }
        };
        this._cleanTracks();
    }
    _cleanTracks() {
        // clear outdated subtitles
        const { media } = this;
        if (!media) {
            return;
        }
        const textTracks = media.textTracks;
        if (textTracks) {
            for (let i = 0; i < textTracks.length; i++) {
                texttrack_utils_1.clearCurrentCues(textTracks[i]);
            }
        }
    }
    onManifestLoaded(data) {
        this.textTracks = [];
        this.unparsedVttFrags = this.unparsedVttFrags || [];
        this.initPTS = [];
        this.cueRanges = [];
        if (this.config.enableWebVTT) {
            this.tracks = data.subtitles || [];
            const inUseTracks = this.media ? this.media.textTracks : [];
            this.tracks.forEach((track, index) => {
                let textTrack;
                if (index < inUseTracks.length) {
                    let inUseTrack = null;
                    for (let i = 0; i < inUseTracks.length; i++) {
                        if (canReuseVttTextTrack(inUseTracks[i], track)) {
                            inUseTrack = inUseTracks[i];
                            break;
                        }
                    }
                    // Reuse tracks with the same label, but do not reuse 608/708 tracks
                    if (inUseTrack) {
                        textTrack = inUseTrack;
                    }
                }
                if (!textTrack) {
                    textTrack = this.createTextTrack('subtitles', track.name, track.lang);
                }
                if (track.default) {
                    textTrack.mode = this.hls.subtitleDisplay ? 'showing' : 'hidden';
                }
                else {
                    textTrack.mode = 'disabled';
                }
                this.textTracks.push(textTrack);
            });
        }
    }
    onLevelSwitching() {
        this.enabled = this.hls.currentLevel.closedCaptions !== 'NONE';
    }
    onFragLoaded(data) {
        const { frag, payload } = data;
        const { cea608Parser, initPTS, lastSn, unparsedVttFrags } = this;
        if (frag.type === 'main') {
            const sn = frag.sn;
            // if this frag isn't contiguous, clear the parser so cues with bad start/end times aren't added to the textTrack
            if (frag.sn !== lastSn + 1) {
                if (cea608Parser) {
                    cea608Parser.reset();
                }
            }
            this.lastSn = sn;
        } // eslint-disable-line brace-style
        else if (frag.type === 'subtitle') {
            if (payload.byteLength) {
                // We need an initial synchronisation PTS. Store fragments as long as none has arrived.
                if (!Number.isFinite(initPTS[frag.cc])) {
                    unparsedVttFrags.push(data);
                    if (initPTS.length) {
                        // finish unsuccessfully, otherwise the subtitle-stream-controller could be blocked from loading new frags.
                        this.hls.trigger(events_1.default.SUBTITLE_FRAG_PROCESSED, { success: false, frag });
                    }
                    return;
                }
                let decryptData = frag.decryptdata;
                // If the subtitles are not encrypted, parse VTTs now. Otherwise, we need to wait.
                if ((decryptData == null) || (decryptData.key == null) || (decryptData.method !== 'AES-128')) {
                    this._parseVTTs(frag, payload);
                }
            }
            else {
                // In case there is no payload, finish unsuccessfully.
                this.hls.trigger(events_1.default.SUBTITLE_FRAG_PROCESSED, { success: false, frag });
            }
        }
    }
    _parseVTTs(frag, payload) {
        const { hls, prevCC, textTracks, vttCCs } = this;
        if (!vttCCs[frag.cc]) {
            vttCCs[frag.cc] = { start: frag.start, prevCC, new: true };
            this.prevCC = frag.cc;
        }
        // Parse the WebVTT file contents.
        webvtt_parser_1.default.parse(payload, this.initPTS[frag.cc], vttCCs, frag.cc, function (cues) {
            const currentTrack = textTracks[frag.level];
            // WebVTTParser.parse is an async method and if the currently selected text track mode is set to "disabled"
            // before parsing is done then don't try to access currentTrack.cues.getCueById as cues will be null
            // and trying to access getCueById method of cues will throw an exception
            if (currentTrack.mode === 'disabled') {
                hls.trigger(events_1.default.SUBTITLE_FRAG_PROCESSED, { success: false, frag: frag });
                return;
            }
            // Add cues and trigger event with success true.
            cues.forEach(cue => {
                // Sometimes there are cue overlaps on segmented vtts so the same
                // cue can appear more than once in different vtt files.
                // This avoid showing duplicated cues with same timecode and text.
                if (!currentTrack.cues.getCueById(cue.id)) {
                    try {
                        currentTrack.addCue(cue);
                    }
                    catch (err) {
                        const textTrackCue = new window.TextTrackCue(cue.startTime, cue.endTime, cue.text);
                        textTrackCue.id = cue.id;
                        currentTrack.addCue(textTrackCue);
                    }
                }
            });
            hls.trigger(events_1.default.SUBTITLE_FRAG_PROCESSED, { success: true, frag: frag });
        }, function (e) {
            // Something went wrong while parsing. Trigger event with success false.
            logger_1.logger.log(`Failed to parse VTT cue: ${e}`);
            hls.trigger(events_1.default.SUBTITLE_FRAG_PROCESSED, { success: false, frag: frag });
        });
    }
    onFragDecrypted(data) {
        const { frag, payload } = data;
        if (frag.type === 'subtitle') {
            if (!Number.isFinite(this.initPTS[frag.cc])) {
                this.unparsedVttFrags.push(data);
                return;
            }
            this._parseVTTs(frag, payload);
        }
    }
    onFragParsingUserdata(data) {
        if (!this.enabled || !this.config.enableCEA708Captions) {
            return;
        }
        // If the event contains captions (found in the bytes property), push all bytes into the parser immediately
        // It will create the proper timestamps based on the PTS value
        for (let i = 0; i < data.samples.length; i++) {
            const ccBytes = data.samples[i].bytes;
            if (ccBytes) {
                const ccdatas = this.extractCea608Data(ccBytes);
                this.cea608Parser.addData(data.samples[i].pts, ccdatas);
            }
        }
    }
    extractCea608Data(byteArray) {
        let count = byteArray[0] & 31;
        let position = 2;
        let tmpByte, ccbyte1, ccbyte2, ccValid, ccType;
        let actualCCBytes = [];
        for (let j = 0; j < count; j++) {
            tmpByte = byteArray[position++];
            ccbyte1 = 0x7F & byteArray[position++];
            ccbyte2 = 0x7F & byteArray[position++];
            ccValid = (4 & tmpByte) !== 0;
            ccType = 3 & tmpByte;
            if (ccbyte1 === 0 && ccbyte2 === 0) {
                continue;
            }
            if (ccValid) {
                if (ccType === 0) {
                    actualCCBytes.push(ccbyte1);
                    actualCCBytes.push(ccbyte2);
                }
            }
        }
        return actualCCBytes;
    }
}
function canReuseVttTextTrack(inUseTrack, manifestTrack) {
    return inUseTrack && inUseTrack.label === manifestTrack.name && !(inUseTrack.textTrack1 || inUseTrack.textTrack2);
}
function intersection(x1, x2, y1, y2) {
    return Math.min(x2, y2) - Math.max(x1, y1);
}
exports.default = TimelineController;
//# sourceMappingURL=timeline-controller.js.map