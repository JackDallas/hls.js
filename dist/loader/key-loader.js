"use strict";
/*
 * Decrypt key Loader
*/
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("../events");
const event_handler_1 = require("../event-handler");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
class KeyLoader extends event_handler_1.default {
    constructor(hls) {
        super(hls, events_1.default.KEY_LOADING);
        this.loaders = {};
        this.decryptkey = null;
        this.decrypturl = null;
    }
    destroy() {
        for (const loaderName in this.loaders) {
            let loader = this.loaders[loaderName];
            if (loader) {
                loader.destroy();
            }
        }
        this.loaders = {};
        super.destroy();
    }
    onKeyLoading(data) {
        const { frag } = data;
        const type = frag.type;
        const loader = this.loaders[type];
        if (!frag.decryptdata) {
            logger_1.logger.warn('Missing decryption data on fragment in onKeyLoading');
            return;
        }
        const uri = frag.decryptdata.uri;
        if (uri === this.decrypturl || this.decryptkey) {
            frag.decryptdata.key = this.decryptkey;
            this.hls.trigger(events_1.default.KEY_LOADED, { frag: frag });
            return;
        }
        // if uri is different from previous one or if decrypt key not retrieved yet
        if (uri !== this.decrypturl || this.decryptkey === null) {
            let config = this.hls.config;
            if (loader) {
                logger_1.logger.warn(`abort previous key loader for type:${type}`);
                loader.abort();
            }
            if (!uri) {
                logger_1.logger.warn('key uri is falsy');
                return;
            }
            frag.loader = this.loaders[type] = new config.loader(config);
            this.decrypturl = uri;
            this.decryptkey = null;
            const loaderContext = {
                url: uri,
                frag: frag,
                responseType: 'arraybuffer'
            };
            // maxRetry is 0 so that instead of retrying the same key on the same variant multiple times,
            // key-loader will trigger an error and rely on stream-controller to handle retry logic.
            // this will also align retry logic with fragment-loader
            const loaderConfig = {
                timeout: config.fragLoadingTimeOut,
                maxRetry: 0,
                retryDelay: config.fragLoadingRetryDelay,
                maxRetryDelay: config.fragLoadingMaxRetryTimeout
            };
            const loaderCallbacks = {
                onSuccess: this.loadsuccess.bind(this),
                onError: this.loaderror.bind(this),
                onTimeout: this.loadtimeout.bind(this)
            };
            frag.loader.load(loaderContext, loaderConfig, loaderCallbacks);
        }
    }
    loadsuccess(response, stats, context) {
        let frag = context.frag;
        if (!frag.decryptdata) {
            logger_1.logger.error('after key load, decryptdata unset');
            return;
        }
        this.decryptkey = frag.decryptdata.key = new Uint8Array(response.data);
        // detach fragment loader on load success
        frag.loader = undefined;
        delete this.loaders[frag.type];
        this.hls.trigger(events_1.default.KEY_LOADED, { frag: frag });
    }
    loaderror(response, context) {
        let frag = context.frag;
        let loader = frag.loader;
        if (loader) {
            loader.abort();
        }
        delete this.loaders[frag.type];
        this.hls.trigger(events_1.default.ERROR, { type: errors_1.ErrorTypes.NETWORK_ERROR, details: errors_1.ErrorDetails.KEY_LOAD_ERROR, fatal: false, frag, response });
    }
    loadtimeout(stats, context) {
        let frag = context.frag;
        let loader = frag.loader;
        if (loader) {
            loader.abort();
        }
        delete this.loaders[frag.type];
        this.hls.trigger(events_1.default.ERROR, { type: errors_1.ErrorTypes.NETWORK_ERROR, details: errors_1.ErrorDetails.KEY_LOAD_TIMEOUT, fatal: false, frag });
    }
}
exports.default = KeyLoader;
//# sourceMappingURL=key-loader.js.map