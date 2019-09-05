import { ErrorTypes, ErrorDetails } from './errors';
import { HlsConfig } from './config';
import { Observer } from './observer';
/**
 * @module Hls
 * @class
 * @constructor
 */
export default class Hls extends Observer {
    static defaultConfig?: HlsConfig;
    config: HlsConfig;
    private _autoLevelCapping;
    private abrController;
    private capLevelController;
    private levelController;
    private streamController;
    private networkControllers;
    private audioTrackController;
    private subtitleTrackController;
    private emeController;
    private coreComponents;
    private media;
    private url;
    /**
     * @type {string}
     */
    static readonly version: string;
    /**
     * @type {boolean}
     */
    static isSupported(): boolean;
    /**
     * @type {HlsEvents}
     */
    static readonly Events: any;
    /**
     * @type {HlsErrorTypes}
     */
    static readonly ErrorTypes: typeof ErrorTypes;
    /**
     * @type {HlsErrorDetails}
     */
    static readonly ErrorDetails: typeof ErrorDetails;
    /**
     * @type {HlsConfig}
     */
    /**
     * @type {HlsConfig}
     */
    static DefaultConfig: HlsConfig;
    /**
     * Creates an instance of an HLS client that can attach to exactly one `HTMLMediaElement`.
     *
     * @constructs Hls
     * @param {HlsConfig} config
     */
    constructor(userConfig?: Partial<HlsConfig>);
    /**
     * Dispose of the instance
     */
    destroy(): void;
    /**
     * Attach a media element
     * @param {HTMLMediaElement} media
     */
    attachMedia(media: HTMLMediaElement): void;
    /**
     * Detach from the media
     */
    detachMedia(): void;
    /**
     * Set the source URL. Can be relative or absolute.
     * @param {string} url
     */
    loadSource(url: string): void;
    /**
     * Start loading data from the stream source.
     * Depending on default config, client starts loading automatically when a source is set.
     *
     * @param {number} startPosition Set the start position to stream from
     * @default -1 None (from earliest point)
     */
    startLoad(startPosition?: number): void;
    /**
     * Stop loading of any stream data.
     */
    stopLoad(): void;
    /**
     * Swap through possible audio codecs in the stream (for example to switch from stereo to 5.1)
     */
    swapAudioCodec(): void;
    /**
     * When the media-element fails, this allows to detach and then re-attach it
     * as one call (convenience method).
     *
     * Automatic recovery of media-errors by this process is configurable.
     */
    recoverMediaError(): void;
    /**
     * @type {QualityLevel[]}
     */
    readonly levels: any[];
    /**
     * Index of quality level currently played
     * @type {number}
     */
    /**
     * Set quality level index immediately .
     * This will flush the current buffer to replace the quality asap.
     * That means playback will interrupt at least shortly to re-buffer and re-sync eventually.
     * @type {number} -1 for automatic level selection
     */
    currentLevel: number;
    /**
     * Index of next quality level loaded as scheduled by stream controller.
     * @type {number}
     */
    /**
     * Set quality level index for next loaded data.
     * This will switch the video quality asap, without interrupting playback.
     * May abort current loading of data, and flush parts of buffer (outside currently played fragment region).
     * @type {number} -1 for automatic level selection
     */
    nextLevel: number;
    /**
     * Return the quality level of the currently or last (of none is loaded currently) segment
     * @type {number}
     */
    /**
     * Set quality level index for next loaded data in a conservative way.
     * This will switch the quality without flushing, but interrupt current loading.
     * Thus the moment when the quality switch will appear in effect will only be after the already existing buffer.
     * @type {number} newLevel -1 for automatic level selection
     */
    loadLevel: number;
    /**
     * get next quality level loaded
     * @type {number}
     */
    /**
     * Set quality level of next loaded segment in a fully "non-destructive" way.
     * Same as `loadLevel` but will wait for next switch (until current loading is done).
     * @type {number} level
     */
    nextLoadLevel: number;
    /**
     * Return "first level": like a default level, if not set,
     * falls back to index of first level referenced in manifest
     * @type {number}
     */
    /**
     * Sets "first-level", see getter.
     * @type {number}
     */
    firstLevel: number;
    /**
     * Return start level (level of first fragment that will be played back)
     * if not overrided by user, first level appearing in manifest will be used as start level
     * if -1 : automatic start level selection, playback will start from level matching download bandwidth
     * (determined from download of first segment)
     * @type {number}
     */
    /**
     * set  start level (level of first fragment that will be played back)
     * if not overrided by user, first level appearing in manifest will be used as start level
     * if -1 : automatic start level selection, playback will start from level matching download bandwidth
     * (determined from download of first segment)
     * @type {number} newLevel
     */
    startLevel: number;
    /**
     * set  dynamically set capLevelToPlayerSize against (`CapLevelController`)
     *
     * @type {boolean}
     */
    capLevelToPlayerSize: boolean;
    /**
     * Capping/max level value that should be used by automatic level selection algorithm (`ABRController`)
     * @type {number}
     */
    /**
     * Capping/max level value that should be used by automatic level selection algorithm (`ABRController`)
     * @type {number}
     */
    autoLevelCapping: number;
    /**
     * get bandwidth estimate
     * @type {number}
     */
    readonly bandwidthEstimate: number;
    /**
     * True when automatic level selection enabled
     * @type {boolean}
     */
    readonly autoLevelEnabled: boolean;
    /**
     * Level set manually (if any)
     * @type {number}
     */
    readonly manualLevel: number;
    /**
     * min level selectable in auto mode according to config.minAutoBitrate
     * @type {number}
     */
    readonly minAutoLevel: number;
    /**
     * max level selectable in auto mode according to autoLevelCapping
     * @type {number}
     */
    readonly maxAutoLevel: number;
    /**
     * next automatically selected quality level
     * @type {number}
     */
    /**
     * this setter is used to force next auto level.
     * this is useful to force a switch down in auto mode:
     * in case of load error on level N, hls.js can set nextAutoLevel to N-1 for example)
     * forced value is valid for one fragment. upon succesful frag loading at forced level,
     * this value will be resetted to -1 by ABR controller.
     * @type {number}
     */
    nextAutoLevel: number;
    /**
     * @type {AudioTrack[]}
     */
    readonly audioTracks: any[];
    /**
     * index of the selected audio track (index in audio track lists)
     * @type {number}
     */
    /**
     * selects an audio track, based on its index in audio track lists
     * @type {number}
     */
    audioTrack: number;
    /**
     * @type {Seconds}
     */
    readonly liveSyncPosition: number;
    /**
     * get alternate subtitle tracks list from playlist
     * @type {SubtitleTrack[]}
     */
    readonly subtitleTracks: any[];
    /**
     * index of the selected subtitle track (index in subtitle track lists)
     * @type {number}
     */
    /**
     * select an subtitle track, based on its index in subtitle track lists
     * @type {number}
     */
    subtitleTrack: number;
    /**
     * @type {boolean}
     */
    /**
     * Enable/disable subtitle display rendering
     * @type {boolean}
     */
    subtitleDisplay: boolean;
}
