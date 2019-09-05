"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const url_toolkit_1 = require("url-toolkit");
class LevelKey {
    constructor(baseURI, relativeURI) {
        this._uri = null;
        this.method = null;
        this.key = null;
        this.iv = null;
        this.baseuri = baseURI;
        this.reluri = relativeURI;
    }
    get uri() {
        if (!this._uri && this.reluri) {
            this._uri = url_toolkit_1.buildAbsoluteURL(this.baseuri, this.reluri, { alwaysNormalize: true });
        }
        return this._uri;
    }
}
exports.default = LevelKey;
//# sourceMappingURL=level-key.js.map