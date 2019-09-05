"use strict";
/**
 * HLS config
 */
Object.defineProperty(exports, "__esModule", { value: true });
const abr_controller_1 = require("./controller/abr-controller");
const buffer_controller_1 = require("./controller/buffer-controller");
const cap_level_controller_1 = require("./controller/cap-level-controller");
const fps_controller_1 = require("./controller/fps-controller");
const xhr_loader_1 = require("./utils/xhr-loader");
// import FetchLoader from './utils/fetch-loader';
const audio_track_controller_1 = require("./controller/audio-track-controller");
const audio_stream_controller_1 = require("./controller/audio-stream-controller");
const Cues = require("./utils/cues");
const timeline_controller_1 = require("./controller/timeline-controller");
const subtitle_track_controller_1 = require("./controller/subtitle-track-controller");
const subtitle_stream_controller_1 = require("./controller/subtitle-stream-controller");
const eme_controller_1 = require("./controller/eme-controller");
const mediakeys_helper_1 = require("./utils/mediakeys-helper");
// If possible, keep hlsDefaultConfig shallow
// It is cloned whenever a new Hls instance is created, by keeping the config
// shallow the properties are cloned, and we don't end up manipulating the default
exports.hlsDefaultConfig = Object.assign({ autoStartLoad: true, startPosition: -1, defaultAudioCodec: void 0, debug: false, capLevelOnFPSDrop: false, capLevelToPlayerSize: false, initialLiveManifestSize: 1, maxBufferLength: 30, maxBufferSize: 60 * 1000 * 1000, maxBufferHole: 0.5, lowBufferWatchdogPeriod: 0.5, highBufferWatchdogPeriod: 3, nudgeOffset: 0.1, nudgeMaxRetry: 3, maxFragLookUpTolerance: 0.25, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: Infinity, liveSyncDuration: void 0, liveMaxLatencyDuration: void 0, liveDurationInfinity: false, liveBackBufferLength: Infinity, maxMaxBufferLength: 600, enableWorker: true, enableSoftwareAES: true, manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 1, manifestLoadingRetryDelay: 1000, manifestLoadingMaxRetryTimeout: 64000, startLevel: void 0, levelLoadingTimeOut: 10000, levelLoadingMaxRetry: 4, levelLoadingRetryDelay: 1000, levelLoadingMaxRetryTimeout: 64000, fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000, fragLoadingMaxRetryTimeout: 64000, startFragPrefetch: false, fpsDroppedMonitoringPeriod: 5000, fpsDroppedMonitoringThreshold: 0.2, appendErrorMaxRetry: 3, loader: xhr_loader_1.default, 
    // loader: FetchLoader,
    fLoader: void 0, pLoader: void 0, xhrSetup: void 0, licenseXhrSetup: void 0, 
    // fetchSetup: void 0,
    abrController: abr_controller_1.default, bufferController: buffer_controller_1.default, capLevelController: cap_level_controller_1.default, fpsController: fps_controller_1.default, stretchShortVideoTrack: false, maxAudioFramesDrift: 1, forceKeyFrameOnDiscontinuity: true, abrEwmaFastLive: 3, abrEwmaSlowLive: 9, abrEwmaFastVoD: 3, abrEwmaSlowVoD: 9, abrEwmaDefaultEstimate: 5e5, abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7, abrMaxWithRealBitrate: false, maxStarvationDelay: 4, maxLoadingDelay: 4, minAutoBitrate: 0, emeEnabled: false, widevineLicenseUrl: void 0, requestMediaKeySystemAccessFunc: mediakeys_helper_1.requestMediaKeySystemAccess }, timelineConfig(), { subtitleStreamController: (__USE_SUBTITLES__) ? subtitle_stream_controller_1.SubtitleStreamController : void 0, subtitleTrackController: (__USE_SUBTITLES__) ? subtitle_track_controller_1.default : void 0, timelineController: (__USE_SUBTITLES__) ? timeline_controller_1.default : void 0, audioStreamController: (__USE_ALT_AUDIO__) ? audio_stream_controller_1.default : void 0, audioTrackController: (__USE_ALT_AUDIO__) ? audio_track_controller_1.default : void 0, emeController: (__USE_EME_DRM__) ? eme_controller_1.default : void 0 });
function timelineConfig() {
    if (!__USE_SUBTITLES__) {
        // intentionally doing this over returning Partial<TimelineControllerConfig> above
        // this has the added nice property of still requiring the object below to completely define all props.
        return {};
    }
    return {
        cueHandler: Cues,
        enableCEA708Captions: true,
        enableWebVTT: true,
        captionsTextTrack1Label: 'English',
        captionsTextTrack1LanguageCode: 'en',
        captionsTextTrack2Label: 'Spanish',
        captionsTextTrack2LanguageCode: 'es' // used by timeline-controller
    };
}
//# sourceMappingURL=config.js.map