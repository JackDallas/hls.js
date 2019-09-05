"use strict";
/**
 * PlaylistLoader - delegate for media manifest/playlist loading tasks. Takes care of parsing media to internal data-models.
 *
 * Once loaded, dispatches events with parsed data-models of manifest/levels/audio/subtitle tracks.
 *
 * Uses loader(s) set in config to do actual internal loading of resource tasks.
 *
 * @module
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("../events");
const event_handler_1 = require("../event-handler");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
const loader_1 = require("../types/loader");
const mp4demuxer_1 = require("../demux/mp4demuxer");
const m3u8_parser_1 = require("./m3u8-parser");
const { performance } = window;
/**
 * @constructor
 */
class PlaylistLoader extends event_handler_1.default {
    /**
     * @constructs
     * @param {Hls} hls
     */
    constructor(hls) {
        super(hls, events_1.default.MANIFEST_LOADING, events_1.default.LEVEL_LOADING, events_1.default.AUDIO_TRACK_LOADING, events_1.default.SUBTITLE_TRACK_LOADING);
        this.loaders = {};
    }
    /**
     * @param {PlaylistContextType} type
     * @returns {boolean}
     */
    static canHaveQualityLevels(type) {
        return (type !== loader_1.PlaylistContextType.AUDIO_TRACK &&
            type !== loader_1.PlaylistContextType.SUBTITLE_TRACK);
    }
    /**
     * Map context.type to LevelType
     * @param {PlaylistLoaderContext} context
     * @returns {LevelType}
     */
    static mapContextToLevelType(context) {
        const { type } = context;
        switch (type) {
            case loader_1.PlaylistContextType.AUDIO_TRACK:
                return loader_1.PlaylistLevelType.AUDIO;
            case loader_1.PlaylistContextType.SUBTITLE_TRACK:
                return loader_1.PlaylistLevelType.SUBTITLE;
            default:
                return loader_1.PlaylistLevelType.MAIN;
        }
    }
    static getResponseUrl(response, context) {
        let url = response.url;
        // responseURL not supported on some browsers (it is used to detect URL redirection)
        // data-uri mode also not supported (but no need to detect redirection)
        if (url === undefined || url.indexOf('data:') === 0) {
            // fallback to initial URL
            url = context.url;
        }
        return url;
    }
    /**
     * Returns defaults or configured loader-type overloads (pLoader and loader config params)
     * Default loader is XHRLoader (see utils)
     * @param {PlaylistLoaderContext} context
     * @returns {Loader} or other compatible configured overload
     */
    createInternalLoader(context) {
        const config = this.hls.config;
        const PLoader = config.pLoader;
        const Loader = config.loader;
        // TODO(typescript-config): Verify once config is typed that InternalLoader always returns a Loader
        const InternalLoader = PLoader || Loader;
        const loader = new InternalLoader(config);
        // TODO - Do we really need to assign the instance or if the dep has been lost
        context.loader = loader;
        this.loaders[context.type] = loader;
        return loader;
    }
    getInternalLoader(context) {
        return this.loaders[context.type];
    }
    resetInternalLoader(contextType) {
        if (this.loaders[contextType]) {
            delete this.loaders[contextType];
        }
    }
    /**
     * Call `destroy` on all internal loader instances mapped (one per context type)
     */
    destroyInternalLoaders() {
        for (let contextType in this.loaders) {
            let loader = this.loaders[contextType];
            if (loader) {
                loader.destroy();
            }
            this.resetInternalLoader(contextType);
        }
    }
    destroy() {
        this.destroyInternalLoaders();
        super.destroy();
    }
    onManifestLoading(data) {
        this.load({
            url: data.url,
            type: loader_1.PlaylistContextType.MANIFEST,
            level: 0,
            id: null,
            responseType: 'text'
        });
    }
    onLevelLoading(data) {
        this.load({
            url: data.url,
            type: loader_1.PlaylistContextType.LEVEL,
            level: data.level,
            id: data.id,
            responseType: 'text'
        });
    }
    onAudioTrackLoading(data) {
        this.load({
            url: data.url,
            type: loader_1.PlaylistContextType.AUDIO_TRACK,
            level: null,
            id: data.id,
            responseType: 'text'
        });
    }
    onSubtitleTrackLoading(data) {
        this.load({
            url: data.url,
            type: loader_1.PlaylistContextType.SUBTITLE_TRACK,
            level: null,
            id: data.id,
            responseType: 'text'
        });
    }
    load(context) {
        const config = this.hls.config;
        logger_1.logger.debug(`Loading playlist of type ${context.type}, level: ${context.level}, id: ${context.id}`);
        // Check if a loader for this context already exists
        let loader = this.getInternalLoader(context);
        if (loader) {
            const loaderContext = loader.context;
            if (loaderContext && loaderContext.url === context.url) {
                logger_1.logger.trace('playlist request ongoing');
                return false;
            }
            else {
                logger_1.logger.warn(`aborting previous loader for type: ${context.type}`);
                loader.abort();
            }
        }
        let maxRetry;
        let timeout;
        let retryDelay;
        let maxRetryDelay;
        // apply different configs for retries depending on
        // context (manifest, level, audio/subs playlist)
        switch (context.type) {
            case loader_1.PlaylistContextType.MANIFEST:
                maxRetry = config.manifestLoadingMaxRetry;
                timeout = config.manifestLoadingTimeOut;
                retryDelay = config.manifestLoadingRetryDelay;
                maxRetryDelay = config.manifestLoadingMaxRetryTimeout;
                break;
            case loader_1.PlaylistContextType.LEVEL:
                // Disable internal loader retry logic, since we are managing retries in Level Controller
                maxRetry = 0;
                maxRetryDelay = 0;
                retryDelay = 0;
                timeout = config.levelLoadingTimeOut;
                // TODO Introduce retry settings for audio-track and subtitle-track, it should not use level retry config
                break;
            default:
                maxRetry = config.levelLoadingMaxRetry;
                timeout = config.levelLoadingTimeOut;
                retryDelay = config.levelLoadingRetryDelay;
                maxRetryDelay = config.levelLoadingMaxRetryTimeout;
                break;
        }
        loader = this.createInternalLoader(context);
        const loaderConfig = {
            timeout,
            maxRetry,
            retryDelay,
            maxRetryDelay
        };
        const loaderCallbacks = {
            onSuccess: this.loadsuccess.bind(this),
            onError: this.loaderror.bind(this),
            onTimeout: this.loadtimeout.bind(this)
        };
        logger_1.logger.debug(`Calling internal loader delegate for URL: ${context.url}`);
        loader.load(context, loaderConfig, loaderCallbacks);
        return true;
    }
    loadsuccess(response, stats, context, networkDetails = null) {
        if (context.isSidxRequest) {
            this._handleSidxRequest(response, context);
            this._handlePlaylistLoaded(response, stats, context, networkDetails);
            return;
        }
        this.resetInternalLoader(context.type);
        if (typeof response.data !== 'string') {
            throw new Error('expected responseType of "text" for PlaylistLoader');
        }
        const string = response.data;
        stats.tload = performance.now();
        // stats.mtime = new Date(target.getResponseHeader('Last-Modified'));
        // Validate if it is an M3U8 at all
        if (string.indexOf('#EXTM3U') !== 0) {
            this._handleManifestParsingError(response, context, 'no EXTM3U delimiter', networkDetails);
            return;
        }
        // Check if chunk-list or master. handle empty chunk list case (first EXTINF not signaled, but TARGETDURATION present)
        if (string.indexOf('#EXTINF:') > 0 || string.indexOf('#EXT-X-TARGETDURATION:') > 0) {
            this._handleTrackOrLevelPlaylist(response, stats, context, networkDetails);
        }
        else {
            this._handleMasterPlaylist(response, stats, context, networkDetails);
        }
    }
    loaderror(response, context, networkDetails = null) {
        this._handleNetworkError(context, networkDetails, false, response);
    }
    loadtimeout(stats, context, networkDetails = null) {
        this._handleNetworkError(context, networkDetails, true);
    }
    // TODO(typescript-config): networkDetails can currently be a XHR or Fetch impl,
    // but with custom loaders it could be generic investigate this further when config is typed
    _handleMasterPlaylist(response, stats, context, networkDetails) {
        const hls = this.hls;
        const string = response.data;
        const url = PlaylistLoader.getResponseUrl(response, context);
        const levels = m3u8_parser_1.default.parseMasterPlaylist(string, url);
        if (!levels.length) {
            this._handleManifestParsingError(response, context, 'no level found in manifest', networkDetails);
            return;
        }
        // multi level playlist, parse level info
        const audioGroups = levels.map(level => ({
            id: level.attrs.AUDIO,
            codec: level.audioCodec
        }));
        const audioTracks = m3u8_parser_1.default.parseMasterPlaylistMedia(string, url, 'AUDIO', audioGroups);
        const subtitles = m3u8_parser_1.default.parseMasterPlaylistMedia(string, url, 'SUBTITLES');
        if (audioTracks.length) {
            // check if we have found an audio track embedded in main playlist (audio track without URI attribute)
            let embeddedAudioFound = false;
            audioTracks.forEach(audioTrack => {
                if (!audioTrack.url) {
                    embeddedAudioFound = true;
                }
            });
            // if no embedded audio track defined, but audio codec signaled in quality level,
            // we need to signal this main audio track this could happen with playlists with
            // alt audio rendition in which quality levels (main)
            // contains both audio+video. but with mixed audio track not signaled
            if (embeddedAudioFound === false && levels[0].audioCodec && !levels[0].attrs.AUDIO) {
                logger_1.logger.log('audio codec signaled in quality level, but no embedded audio track signaled, create one');
                audioTracks.unshift({
                    type: 'main',
                    name: 'main',
                    default: false,
                    autoselect: false,
                    forced: false,
                    id: -1
                });
            }
        }
        hls.trigger(events_1.default.MANIFEST_LOADED, {
            levels,
            audioTracks,
            subtitles,
            url,
            stats,
            networkDetails
        });
    }
    _handleTrackOrLevelPlaylist(response, stats, context, networkDetails) {
        const hls = this.hls;
        const { id, level, type } = context;
        const url = PlaylistLoader.getResponseUrl(response, context);
        // if the values are null, they will result in the else conditional
        const levelUrlId = Number.isFinite(id) ? id : 0;
        const levelId = Number.isFinite(level) ? level : levelUrlId;
        const levelType = PlaylistLoader.mapContextToLevelType(context);
        const levelDetails = m3u8_parser_1.default.parseLevelPlaylist(response.data, url, levelId, levelType, levelUrlId);
        // set stats on level structure
        // TODO(jstackhouse): why? mixing concerns, is it just treated as value bag?
        levelDetails.tload = stats.tload;
        // We have done our first request (Manifest-type) and receive
        // not a master playlist but a chunk-list (track/level)
        // We fire the manifest-loaded event anyway with the parsed level-details
        // by creating a single-level structure for it.
        if (type === loader_1.PlaylistContextType.MANIFEST) {
            const singleLevel = {
                url,
                details: levelDetails
            };
            hls.trigger(events_1.default.MANIFEST_LOADED, {
                levels: [singleLevel],
                audioTracks: [],
                url,
                stats,
                networkDetails
            });
        }
        // save parsing time
        stats.tparsed = performance.now();
        // in case we need SIDX ranges
        // return early after calling load for
        // the SIDX box.
        if (levelDetails.needSidxRanges) {
            const sidxUrl = levelDetails.initSegment.url;
            this.load({
                url: sidxUrl,
                isSidxRequest: true,
                type,
                level,
                levelDetails,
                id,
                rangeStart: 0,
                rangeEnd: 2048,
                responseType: 'arraybuffer'
            });
            return;
        }
        // extend the context with the new levelDetails property
        context.levelDetails = levelDetails;
        this._handlePlaylistLoaded(response, stats, context, networkDetails);
    }
    _handleSidxRequest(response, context) {
        if (typeof response.data === 'string') {
            throw new Error('sidx request must be made with responseType of array buffer');
        }
        const sidxInfo = mp4demuxer_1.default.parseSegmentIndex(new Uint8Array(response.data));
        // if provided fragment does not contain sidx, early return
        if (!sidxInfo) {
            return;
        }
        const sidxReferences = sidxInfo.references;
        const levelDetails = context.levelDetails;
        sidxReferences.forEach((segmentRef, index) => {
            const segRefInfo = segmentRef.info;
            if (!levelDetails) {
                return;
            }
            const frag = levelDetails.fragments[index];
            if (frag.byteRange.length === 0) {
                frag.setByteRange(String(1 + segRefInfo.end - segRefInfo.start) + '@' + String(segRefInfo.start));
            }
        });
        if (levelDetails) {
            levelDetails.initSegment.setByteRange(String(sidxInfo.moovEndOffset) + '@0');
        }
    }
    _handleManifestParsingError(response, context, reason, networkDetails) {
        this.hls.trigger(events_1.default.ERROR, {
            type: errors_1.ErrorTypes.NETWORK_ERROR,
            details: errors_1.ErrorDetails.MANIFEST_PARSING_ERROR,
            fatal: true,
            url: response.url,
            reason,
            networkDetails
        });
    }
    _handleNetworkError(context, networkDetails, timeout = false, response = null) {
        logger_1.logger.info(`A network error occured while loading a ${context.type}-type playlist`);
        let details;
        let fatal;
        const loader = this.getInternalLoader(context);
        switch (context.type) {
            case loader_1.PlaylistContextType.MANIFEST:
                details = (timeout ? errors_1.ErrorDetails.MANIFEST_LOAD_TIMEOUT : errors_1.ErrorDetails.MANIFEST_LOAD_ERROR);
                fatal = true;
                break;
            case loader_1.PlaylistContextType.LEVEL:
                details = (timeout ? errors_1.ErrorDetails.LEVEL_LOAD_TIMEOUT : errors_1.ErrorDetails.LEVEL_LOAD_ERROR);
                fatal = false;
                break;
            case loader_1.PlaylistContextType.AUDIO_TRACK:
                details = (timeout ? errors_1.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT : errors_1.ErrorDetails.AUDIO_TRACK_LOAD_ERROR);
                fatal = false;
                break;
            default:
                // details = ...?
                fatal = false;
        }
        if (loader) {
            loader.abort();
            this.resetInternalLoader(context.type);
        }
        // TODO(typescript-events): when error events are handled, type this
        let errorData = {
            type: errors_1.ErrorTypes.NETWORK_ERROR,
            details,
            fatal,
            url: context.url,
            loader,
            context,
            networkDetails
        };
        if (response) {
            errorData.response = response;
        }
        this.hls.trigger(events_1.default.ERROR, errorData);
    }
    _handlePlaylistLoaded(response, stats, context, networkDetails) {
        const { type, level, id, levelDetails } = context;
        if (!levelDetails || !levelDetails.targetduration) {
            this._handleManifestParsingError(response, context, 'invalid target duration', networkDetails);
            return;
        }
        const canHaveLevels = PlaylistLoader.canHaveQualityLevels(context.type);
        if (canHaveLevels) {
            this.hls.trigger(events_1.default.LEVEL_LOADED, {
                details: levelDetails,
                level: level || 0,
                id: id || 0,
                stats,
                networkDetails
            });
        }
        else {
            switch (type) {
                case loader_1.PlaylistContextType.AUDIO_TRACK:
                    this.hls.trigger(events_1.default.AUDIO_TRACK_LOADED, {
                        details: levelDetails,
                        id,
                        stats,
                        networkDetails
                    });
                    break;
                case loader_1.PlaylistContextType.SUBTITLE_TRACK:
                    this.hls.trigger(events_1.default.SUBTITLE_TRACK_LOADED, {
                        details: levelDetails,
                        id,
                        stats,
                        networkDetails
                    });
                    break;
            }
        }
    }
}
exports.default = PlaylistLoader;
//# sourceMappingURL=playlist-loader.js.map