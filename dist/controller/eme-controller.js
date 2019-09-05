"use strict";
/**
 * @author Stephan Hesse <disparat@gmail.com> | <tchakabam@gmail.com>
 *
 * DRM support for Hls.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const event_handler_1 = require("../event-handler");
const events_1 = require("../events");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
const mediakeys_helper_1 = require("../utils/mediakeys-helper");
const MAX_LICENSE_REQUEST_FAILURES = 3;
/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaKeySystemConfiguration
 * @param {Array<string>} audioCodecs List of required audio codecs to support
 * @param {Array<string>} videoCodecs List of required video codecs to support
 * @param {object} drmSystemOptions Optional parameters/requirements for the key-system
 * @returns {Array<MediaSystemConfiguration>} An array of supported configurations
 */
const createWidevineMediaKeySystemConfigurations = function (audioCodecs, videoCodecs) {
    const baseConfig = {
        // initDataTypes: ['keyids', 'mp4'],
        // label: "",
        // persistentState: "not-allowed", // or "required" ?
        // distinctiveIdentifier: "not-allowed", // or "required" ?
        // sessionTypes: ['temporary'],
        videoCapabilities: [] // { contentType: 'video/mp4; codecs="avc1.42E01E"' }
    };
    videoCodecs.forEach((codec) => {
        baseConfig.videoCapabilities.push({
            contentType: `video/mp4; codecs="${codec}"`
        });
    });
    return [
        baseConfig
    ];
};
/**
 * The idea here is to handle key-system (and their respective platforms) specific configuration differences
 * in order to work with the local requestMediaKeySystemAccess method.
 *
 * We can also rule-out platform-related key-system support at this point by throwing an error.
 *
 * @param {string} keySystem Identifier for the key-system, see `KeySystems` enum
 * @param {Array<string>} audioCodecs List of required audio codecs to support
 * @param {Array<string>} videoCodecs List of required video codecs to support
 * @throws will throw an error if a unknown key system is passed
 * @returns {Array<MediaSystemConfiguration>} A non-empty Array of MediaKeySystemConfiguration objects
 */
const getSupportedMediaKeySystemConfigurations = function (keySystem, audioCodecs, videoCodecs) {
    switch (keySystem) {
        case mediakeys_helper_1.KeySystems.WIDEVINE:
            return createWidevineMediaKeySystemConfigurations(audioCodecs, videoCodecs);
        default:
            throw new Error(`Unknown key-system: ${keySystem}`);
    }
};
/**
 * Controller to deal with encrypted media extensions (EME)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Encrypted_Media_Extensions_API
 *
 * @class
 * @constructor
 */
class EMEController extends event_handler_1.default {
    /**
       * @constructs
       * @param {Hls} hls Our Hls.js instance
       */
    constructor(hls) {
        super(hls, events_1.default.MEDIA_ATTACHED, events_1.default.MEDIA_DETACHED, events_1.default.MANIFEST_PARSED);
        this._mediaKeysList = [];
        this._media = null;
        this._hasSetMediaKeys = false;
        this._requestLicenseFailureCount = 0;
        /**
         * @private
         * @param {string} initDataType
         * @param {ArrayBuffer|null} initData
         */
        this._onMediaEncrypted = (e) => {
            logger_1.logger.log(`Media is encrypted using "${e.initDataType}" init data type`);
            this._attemptSetMediaKeys();
            this._generateRequestWithPreferredKeySession(e.initDataType, e.initData);
        };
        this._config = hls.config;
        this._widevineLicenseUrl = this._config.widevineLicenseUrl;
        this._licenseXhrSetup = this._config.licenseXhrSetup;
        this._emeEnabled = this._config.emeEnabled;
        this._requestMediaKeySystemAccess = this._config.requestMediaKeySystemAccessFunc;
    }
    /**
     * @param {string} keySystem Identifier for the key-system, see `KeySystems` enum
     * @returns {string} License server URL for key-system (if any configured, otherwise causes error)
     * @throws if a unsupported keysystem is passed
     */
    getLicenseServerUrl(keySystem) {
        switch (keySystem) {
            case mediakeys_helper_1.KeySystems.WIDEVINE:
                if (!this._widevineLicenseUrl) {
                    break;
                }
                return this._widevineLicenseUrl;
        }
        throw new Error(`no license server URL configured for key-system "${keySystem}"`);
    }
    /**
       * Requests access object and adds it to our list upon success
       * @private
       * @param {string} keySystem System ID (see `KeySystems`)
       * @param {Array<string>} audioCodecs List of required audio codecs to support
       * @param {Array<string>} videoCodecs List of required video codecs to support
       * @throws When a unsupported KeySystem is passed
       */
    _attemptKeySystemAccess(keySystem, audioCodecs, videoCodecs) {
        // TODO: add other DRM "options"
        // This can throw, but is caught in event handler callpath
        const mediaKeySystemConfigs = getSupportedMediaKeySystemConfigurations(keySystem, audioCodecs, videoCodecs);
        logger_1.logger.log('Requesting encrypted media key-system access');
        // expecting interface like window.navigator.requestMediaKeySystemAccess
        this.requestMediaKeySystemAccess(keySystem, mediaKeySystemConfigs)
            .then((mediaKeySystemAccess) => {
            this._onMediaKeySystemAccessObtained(keySystem, mediaKeySystemAccess);
        })
            .catch((err) => {
            logger_1.logger.error(`Failed to obtain key-system "${keySystem}" access:`, err);
        });
    }
    get requestMediaKeySystemAccess() {
        if (!this._requestMediaKeySystemAccess) {
            throw new Error('No requestMediaKeySystemAccess function configured');
        }
        return this._requestMediaKeySystemAccess;
    }
    /**
       * Handles obtaining access to a key-system
       * @private
       * @param {string} keySystem
       * @param {MediaKeySystemAccess} mediaKeySystemAccess https://developer.mozilla.org/en-US/docs/Web/API/MediaKeySystemAccess
       */
    _onMediaKeySystemAccessObtained(keySystem, mediaKeySystemAccess) {
        logger_1.logger.log(`Access for key-system "${keySystem}" obtained`);
        const mediaKeysListItem = {
            mediaKeysSessionInitialized: false,
            mediaKeySystemAccess: mediaKeySystemAccess,
            mediaKeySystemDomain: keySystem
        };
        this._mediaKeysList.push(mediaKeysListItem);
        mediaKeySystemAccess.createMediaKeys()
            .then((mediaKeys) => {
            mediaKeysListItem.mediaKeys = mediaKeys;
            logger_1.logger.log(`Media-keys created for key-system "${keySystem}"`);
            this._onMediaKeysCreated();
        })
            .catch((err) => {
            logger_1.logger.error('Failed to create media-keys:', err);
        });
    }
    /**
     * Handles key-creation (represents access to CDM). We are going to create key-sessions upon this
     * for all existing keys where no session exists yet.
     *
     * @private
     */
    _onMediaKeysCreated() {
        // check for all key-list items if a session exists, otherwise, create one
        this._mediaKeysList.forEach((mediaKeysListItem) => {
            if (!mediaKeysListItem.mediaKeysSession) {
                // mediaKeys is definitely initialized here
                mediaKeysListItem.mediaKeysSession = mediaKeysListItem.mediaKeys.createSession();
                this._onNewMediaKeySession(mediaKeysListItem.mediaKeysSession);
            }
        });
    }
    /**
       * @private
       * @param {*} keySession
       */
    _onNewMediaKeySession(keySession) {
        logger_1.logger.log(`New key-system session ${keySession.sessionId}`);
        keySession.addEventListener('message', (event) => {
            this._onKeySessionMessage(keySession, event.message);
        }, false);
    }
    /**
     * @private
     * @param {MediaKeySession} keySession
     * @param {ArrayBuffer} message
     */
    _onKeySessionMessage(keySession, message) {
        logger_1.logger.log('Got EME message event, creating license request');
        this._requestLicense(message, (data) => {
            logger_1.logger.log('Received license data, updating key-session');
            keySession.update(data);
        });
    }
    /**
     * @private
     */
    _attemptSetMediaKeys() {
        if (!this._media) {
            throw new Error('Attempted to set mediaKeys without first attaching a media element');
        }
        if (!this._hasSetMediaKeys) {
            // FIXME: see if we can/want/need-to really to deal with several potential key-sessions?
            const keysListItem = this._mediaKeysList[0];
            if (!keysListItem || !keysListItem.mediaKeys) {
                logger_1.logger.error('Fatal: Media is encrypted but no CDM access or no keys have been obtained yet');
                this.hls.trigger(events_1.default.ERROR, {
                    type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                    details: errors_1.ErrorDetails.KEY_SYSTEM_NO_KEYS,
                    fatal: true
                });
                return;
            }
            logger_1.logger.log('Setting keys for encrypted media');
            this._media.setMediaKeys(keysListItem.mediaKeys);
            this._hasSetMediaKeys = true;
        }
    }
    /**
     * @private
     */
    _generateRequestWithPreferredKeySession(initDataType, initData) {
        // FIXME: see if we can/want/need-to really to deal with several potential key-sessions?
        const keysListItem = this._mediaKeysList[0];
        if (!keysListItem) {
            logger_1.logger.error('Fatal: Media is encrypted but not any key-system access has been obtained yet');
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_NO_ACCESS,
                fatal: true
            });
            return;
        }
        if (keysListItem.mediaKeysSessionInitialized) {
            logger_1.logger.warn('Key-Session already initialized but requested again');
            return;
        }
        const keySession = keysListItem.mediaKeysSession;
        if (!keySession) {
            logger_1.logger.error('Fatal: Media is encrypted but no key-session existing');
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_NO_SESSION,
                fatal: true
            });
            return;
        }
        // initData is null if the media is not CORS-same-origin
        if (!initData) {
            logger_1.logger.warn('Fatal: initData required for generating a key session is null');
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_NO_INIT_DATA,
                fatal: true
            });
            return;
        }
        logger_1.logger.log(`Generating key-session request for "${initDataType}" init data type`);
        keysListItem.mediaKeysSessionInitialized = true;
        keySession.generateRequest(initDataType, initData)
            .then(() => {
            logger_1.logger.debug('Key-session generation succeeded');
        })
            .catch((err) => {
            logger_1.logger.error('Error generating key-session request:', err);
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_NO_SESSION,
                fatal: false
            });
        });
    }
    /**
     * @private
     * @param {string} url License server URL
     * @param {ArrayBuffer} keyMessage Message data issued by key-system
     * @param {function} callback Called when XHR has succeeded
     * @returns {XMLHttpRequest} Unsent (but opened state) XHR object
     * @throws if XMLHttpRequest construction failed
     */
    _createLicenseXhr(url, keyMessage, callback) {
        const xhr = new XMLHttpRequest();
        const licenseXhrSetup = this._licenseXhrSetup;
        try {
            if (licenseXhrSetup) {
                try {
                    licenseXhrSetup(xhr, url);
                }
                catch (e) {
                    // let's try to open before running setup
                    xhr.open('POST', url, true);
                    licenseXhrSetup(xhr, url);
                }
            }
            // if licenseXhrSetup did not yet call open, let's do it now
            if (!xhr.readyState) {
                xhr.open('POST', url, true);
            }
        }
        catch (e) {
            // IE11 throws an exception on xhr.open if attempting to access an HTTP resource over HTTPS
            throw new Error(`issue setting up KeySystem license XHR ${e}`);
        }
        // Because we set responseType to ArrayBuffer here, callback is typed as handling only array buffers
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange =
            this._onLicenseRequestReadyStageChange.bind(this, xhr, url, keyMessage, callback);
        return xhr;
    }
    /**
     * @private
     * @param {XMLHttpRequest} xhr
     * @param {string} url License server URL
     * @param {ArrayBuffer} keyMessage Message data issued by key-system
     * @param {function} callback Called when XHR has succeeded
     */
    _onLicenseRequestReadyStageChange(xhr, url, keyMessage, callback) {
        switch (xhr.readyState) {
            case 4:
                if (xhr.status === 200) {
                    this._requestLicenseFailureCount = 0;
                    logger_1.logger.log('License request succeeded');
                    if (xhr.responseType !== 'arraybuffer') {
                        logger_1.logger.warn('xhr response type was not set to the expected arraybuffer for license request');
                    }
                    callback(xhr.response);
                }
                else {
                    logger_1.logger.error(`License Request XHR failed (${url}). Status: ${xhr.status} (${xhr.statusText})`);
                    this._requestLicenseFailureCount++;
                    if (this._requestLicenseFailureCount > MAX_LICENSE_REQUEST_FAILURES) {
                        this.hls.trigger(events_1.default.ERROR, {
                            type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                            details: errors_1.ErrorDetails.KEY_SYSTEM_LICENSE_REQUEST_FAILED,
                            fatal: true
                        });
                        return;
                    }
                    const attemptsLeft = MAX_LICENSE_REQUEST_FAILURES - this._requestLicenseFailureCount + 1;
                    logger_1.logger.warn(`Retrying license request, ${attemptsLeft} attempts left`);
                    this._requestLicense(keyMessage, callback);
                }
                break;
        }
    }
    /**
     * @private
     * @param {MediaKeysListItem} keysListItem
     * @param {ArrayBuffer} keyMessage
     * @returns {ArrayBuffer} Challenge data posted to license server
     * @throws if KeySystem is unsupported
     */
    _generateLicenseRequestChallenge(keysListItem, keyMessage) {
        switch (keysListItem.mediaKeySystemDomain) {
            // case KeySystems.PLAYREADY:
            // from https://github.com/MicrosoftEdge/Demos/blob/master/eme/scripts/demo.js
            /*
              if (this.licenseType !== this.LICENSE_TYPE_WIDEVINE) {
                // For PlayReady CDMs, we need to dig the Challenge out of the XML.
                var keyMessageXml = new DOMParser().parseFromString(String.fromCharCode.apply(null, new Uint16Array(keyMessage)), 'application/xml');
                if (keyMessageXml.getElementsByTagName('Challenge')[0]) {
                    challenge = atob(keyMessageXml.getElementsByTagName('Challenge')[0].childNodes[0].nodeValue);
                } else {
                    throw 'Cannot find <Challenge> in key message';
                }
                var headerNames = keyMessageXml.getElementsByTagName('name');
                var headerValues = keyMessageXml.getElementsByTagName('value');
                if (headerNames.length !== headerValues.length) {
                    throw 'Mismatched header <name>/<value> pair in key message';
                }
                for (var i = 0; i < headerNames.length; i++) {
                    xhr.setRequestHeader(headerNames[i].childNodes[0].nodeValue, headerValues[i].childNodes[0].nodeValue);
                }
              }
              break;
            */
            case mediakeys_helper_1.KeySystems.WIDEVINE:
                // For Widevine CDMs, the challenge is the keyMessage.
                return keyMessage;
        }
        throw new Error(`unsupported key-system: ${keysListItem.mediaKeySystemDomain}`);
    }
    /**
     * @private
     * @param keyMessage
     * @param callback
     */
    _requestLicense(keyMessage, callback) {
        logger_1.logger.log('Requesting content license for key-system');
        const keysListItem = this._mediaKeysList[0];
        if (!keysListItem) {
            logger_1.logger.error('Fatal error: Media is encrypted but no key-system access has been obtained yet');
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_NO_ACCESS,
                fatal: true
            });
            return;
        }
        try {
            const url = this.getLicenseServerUrl(keysListItem.mediaKeySystemDomain);
            const xhr = this._createLicenseXhr(url, keyMessage, callback);
            logger_1.logger.log(`Sending license request to URL: ${url}`);
            const challenge = this._generateLicenseRequestChallenge(keysListItem, keyMessage);
            xhr.send(challenge);
        }
        catch (e) {
            logger_1.logger.error(`Failure requesting DRM license: ${e}`);
            this.hls.trigger(events_1.default.ERROR, {
                type: errors_1.ErrorTypes.KEY_SYSTEM_ERROR,
                details: errors_1.ErrorDetails.KEY_SYSTEM_LICENSE_REQUEST_FAILED,
                fatal: true
            });
        }
    }
    onMediaAttached(data) {
        if (!this._emeEnabled) {
            return;
        }
        const media = data.media;
        // keep reference of media
        this._media = media;
        media.addEventListener('encrypted', this._onMediaEncrypted);
    }
    onMediaDetached() {
        if (this._media) {
            this._media.removeEventListener('encrypted', this._onMediaEncrypted);
            this._media = null; // release reference
        }
    }
    // TODO: Use manifest types here when they are defined
    onManifestParsed(data) {
        if (!this._emeEnabled) {
            return;
        }
        const audioCodecs = data.levels.map((level) => level.audioCodec);
        const videoCodecs = data.levels.map((level) => level.videoCodec);
        this._attemptKeySystemAccess(mediakeys_helper_1.KeySystems.WIDEVINE, audioCodecs, videoCodecs);
    }
}
exports.default = EMEController;
//# sourceMappingURL=eme-controller.js.map