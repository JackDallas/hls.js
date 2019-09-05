"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const URLToolkit = require("url-toolkit");
const fragment_1 = require("./fragment");
const level_1 = require("./level");
const level_key_1 = require("./level-key");
const attr_list_1 = require("../utils/attr-list");
const logger_1 = require("../utils/logger");
const codecs_1 = require("../utils/codecs");
/**
 * M3U8 parser
 * @module
 */
// https://regex101.com is your friend
const MASTER_PLAYLIST_REGEX = /#EXT-X-STREAM-INF:([^\n\r]*)[\r\n]+([^\r\n]+)/g;
const MASTER_PLAYLIST_MEDIA_REGEX = /#EXT-X-MEDIA:(.*)/g;
const LEVEL_PLAYLIST_REGEX_FAST = new RegExp([
    /#EXTINF:\s*(\d*(?:\.\d+)?)(?:,(.*)\s+)?/.source,
    /|(?!#)([\S+ ?]+)/.source,
    /|#EXT-X-BYTERANGE:*(.+)/.source,
    /|#EXT-X-PROGRAM-DATE-TIME:(.+)/.source,
    /|#.*/.source // All other non-segment oriented tags will match with all groups empty
].join(''), 'g');
const LEVEL_PLAYLIST_REGEX_SLOW = /(?:(?:#(EXTM3U))|(?:#EXT-X-(PLAYLIST-TYPE):(.+))|(?:#EXT-X-(MEDIA-SEQUENCE): *(\d+))|(?:#EXT-X-(TARGETDURATION): *(\d+))|(?:#EXT-X-(KEY):(.+))|(?:#EXT-X-(START):(.+))|(?:#EXT-X-(ENDLIST))|(?:#EXT-X-(DISCONTINUITY-SEQ)UENCE:(\d+))|(?:#EXT-X-(DIS)CONTINUITY))|(?:#EXT-X-(VERSION):(\d+))|(?:#EXT-X-(MAP):(.+))|(?:(#)([^:]*):(.*))|(?:(#)(.*))(?:.*)\r?\n?/;
const MP4_REGEX_SUFFIX = /\.(mp4|m4s|m4v|m4a)$/i;
class M3U8Parser {
    static findGroup(groups, mediaGroupId) {
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            if (group.id === mediaGroupId) {
                return group;
            }
        }
    }
    static convertAVC1ToAVCOTI(codec) {
        let avcdata = codec.split('.');
        let result;
        if (avcdata.length > 2) {
            result = avcdata.shift() + '.';
            result += parseInt(avcdata.shift()).toString(16);
            result += ('000' + parseInt(avcdata.shift()).toString(16)).substr(-4);
        }
        else {
            result = codec;
        }
        return result;
    }
    static resolve(url, baseUrl) {
        return URLToolkit.buildAbsoluteURL(baseUrl, url, { alwaysNormalize: true });
    }
    static parseMasterPlaylist(string, baseurl) {
        // TODO(typescript-level)
        let levels = [];
        MASTER_PLAYLIST_REGEX.lastIndex = 0;
        // TODO(typescript-level)
        function setCodecs(codecs, level) {
            ['video', 'audio'].forEach((type) => {
                const filtered = codecs.filter((codec) => codecs_1.isCodecType(codec, type));
                if (filtered.length) {
                    const preferred = filtered.filter((codec) => {
                        return codec.lastIndexOf('avc1', 0) === 0 || codec.lastIndexOf('mp4a', 0) === 0;
                    });
                    level[`${type}Codec`] = preferred.length > 0 ? preferred[0] : filtered[0];
                    // remove from list
                    codecs = codecs.filter((codec) => filtered.indexOf(codec) === -1);
                }
            });
            level.unknownCodecs = codecs;
        }
        let result;
        while ((result = MASTER_PLAYLIST_REGEX.exec(string)) != null) {
            // TODO(typescript-level)
            const level = {};
            const attrs = level.attrs = new attr_list_1.default(result[1]);
            level.url = M3U8Parser.resolve(result[2], baseurl);
            const resolution = attrs.decimalResolution('RESOLUTION');
            if (resolution) {
                level.width = resolution.width;
                level.height = resolution.height;
            }
            level.bitrate = attrs.decimalInteger('AVERAGE-BANDWIDTH') || attrs.decimalInteger('BANDWIDTH');
            level.name = attrs.NAME;
            setCodecs([].concat((attrs.CODECS || '').split(/[ ,]+/)), level);
            if (level.videoCodec && level.videoCodec.indexOf('avc1') !== -1) {
                level.videoCodec = M3U8Parser.convertAVC1ToAVCOTI(level.videoCodec);
            }
            levels.push(level);
        }
        return levels;
    }
    static parseMasterPlaylistMedia(string, baseurl, type, audioGroups = []) {
        let result;
        let medias = [];
        let id = 0;
        MASTER_PLAYLIST_MEDIA_REGEX.lastIndex = 0;
        while ((result = MASTER_PLAYLIST_MEDIA_REGEX.exec(string)) !== null) {
            const attrs = new attr_list_1.default(result[1]);
            if (attrs.TYPE === type) {
                const media = {
                    id: id++,
                    groupId: attrs['GROUP-ID'],
                    name: attrs.NAME || attrs.LANGUAGE,
                    type,
                    default: (attrs.DEFAULT === 'YES'),
                    autoselect: (attrs.AUTOSELECT === 'YES'),
                    forced: (attrs.FORCED === 'YES'),
                    lang: attrs.LANGUAGE
                };
                if (attrs.URI) {
                    media.url = M3U8Parser.resolve(attrs.URI, baseurl);
                }
                if (audioGroups.length) {
                    // If there are audio groups signalled in the manifest, let's look for a matching codec string for this track
                    const groupCodec = M3U8Parser.findGroup(audioGroups, media.groupId);
                    // If we don't find the track signalled, lets use the first audio groups codec we have
                    // Acting as a best guess
                    media.audioCodec = groupCodec ? groupCodec.codec : audioGroups[0].codec;
                }
                medias.push(media);
            }
        }
        return medias;
    }
    static parseLevelPlaylist(string, baseurl, id, type, levelUrlId) {
        let currentSN = 0;
        let totalduration = 0;
        let level = new level_1.default(baseurl);
        let discontinuityCounter = 0;
        let prevFrag = null;
        let frag = new fragment_1.default();
        let result;
        let i;
        let levelkey;
        let firstPdtIndex = null;
        LEVEL_PLAYLIST_REGEX_FAST.lastIndex = 0;
        while ((result = LEVEL_PLAYLIST_REGEX_FAST.exec(string)) !== null) {
            const duration = result[1];
            if (duration) {
                frag.duration = parseFloat(duration);
                // avoid sliced strings    https://github.com/video-dev/hls.js/issues/939
                const title = (' ' + result[2]).slice(1);
                frag.title = title || null;
                frag.tagList.push(title ? ['INF', duration, title] : ['INF', duration]);
            }
            else if (result[3]) {
                if (Number.isFinite(frag.duration)) {
                    const sn = currentSN++;
                    frag.type = type;
                    frag.start = totalduration;
                    if (levelkey) {
                        frag.levelkey = levelkey;
                    }
                    frag.sn = sn;
                    frag.level = id;
                    frag.cc = discontinuityCounter;
                    frag.urlId = levelUrlId;
                    frag.baseurl = baseurl;
                    // avoid sliced strings    https://github.com/video-dev/hls.js/issues/939
                    frag.relurl = (' ' + result[3]).slice(1);
                    assignProgramDateTime(frag, prevFrag);
                    level.fragments.push(frag);
                    prevFrag = frag;
                    totalduration += frag.duration;
                    frag = new fragment_1.default();
                }
            }
            else if (result[4]) {
                const data = (' ' + result[4]).slice(1);
                if (prevFrag) {
                    frag.setByteRange(data, prevFrag);
                }
                else {
                    frag.setByteRange(data);
                }
            }
            else if (result[5]) {
                // avoid sliced strings    https://github.com/video-dev/hls.js/issues/939
                frag.rawProgramDateTime = (' ' + result[5]).slice(1);
                frag.tagList.push(['PROGRAM-DATE-TIME', frag.rawProgramDateTime]);
                if (firstPdtIndex === null) {
                    firstPdtIndex = level.fragments.length;
                }
            }
            else {
                result = result[0].match(LEVEL_PLAYLIST_REGEX_SLOW);
                if (!result) {
                    logger_1.logger.warn('No matches on slow regex match for level playlist!');
                    continue;
                }
                for (i = 1; i < result.length; i++) {
                    if (typeof result[i] !== 'undefined') {
                        break;
                    }
                }
                // avoid sliced strings    https://github.com/video-dev/hls.js/issues/939
                const value1 = (' ' + result[i + 1]).slice(1);
                const value2 = (' ' + result[i + 2]).slice(1);
                switch (result[i]) {
                    case '#':
                        frag.tagList.push(value2 ? [value1, value2] : [value1]);
                        break;
                    case 'PLAYLIST-TYPE':
                        level.type = value1.toUpperCase();
                        break;
                    case 'MEDIA-SEQUENCE':
                        currentSN = level.startSN = parseInt(value1);
                        break;
                    case 'TARGETDURATION':
                        level.targetduration = parseFloat(value1);
                        break;
                    case 'VERSION':
                        level.version = parseInt(value1);
                        break;
                    case 'EXTM3U':
                        break;
                    case 'ENDLIST':
                        level.live = false;
                        break;
                    case 'DIS':
                        discontinuityCounter++;
                        frag.tagList.push(['DIS']);
                        break;
                    case 'DISCONTINUITY-SEQ':
                        discontinuityCounter = parseInt(value1);
                        break;
                    case 'KEY': {
                        // https://tools.ietf.org/html/draft-pantos-http-live-streaming-08#section-3.4.4
                        const decryptparams = value1;
                        const keyAttrs = new attr_list_1.default(decryptparams);
                        const decryptmethod = keyAttrs.enumeratedString('METHOD');
                        const decrypturi = keyAttrs.URI;
                        const decryptiv = keyAttrs.hexadecimalInteger('IV');
                        if (decryptmethod) {
                            levelkey = new level_key_1.default(baseurl, decrypturi);
                            if ((decrypturi) && (['AES-128', 'SAMPLE-AES', 'SAMPLE-AES-CENC'].indexOf(decryptmethod) >= 0)) {
                                levelkey.method = decryptmethod;
                                levelkey.key = null;
                                // Initialization Vector (IV)
                                levelkey.iv = decryptiv;
                            }
                        }
                        break;
                    }
                    case 'START': {
                        const startAttrs = new attr_list_1.default(value1);
                        const startTimeOffset = startAttrs.decimalFloatingPoint('TIME-OFFSET');
                        // TIME-OFFSET can be 0
                        if (Number.isFinite(startTimeOffset)) {
                            level.startTimeOffset = startTimeOffset;
                        }
                        break;
                    }
                    case 'MAP': {
                        const mapAttrs = new attr_list_1.default(value1);
                        frag.relurl = mapAttrs.URI;
                        if (mapAttrs.BYTERANGE) {
                            frag.setByteRange(mapAttrs.BYTERANGE);
                        }
                        frag.baseurl = baseurl;
                        frag.level = id;
                        frag.type = type;
                        frag.sn = 'initSegment';
                        level.initSegment = frag;
                        frag = new fragment_1.default();
                        frag.rawProgramDateTime = level.initSegment.rawProgramDateTime;
                        break;
                    }
                    default:
                        logger_1.logger.warn(`line parsed but not handled: ${result}`);
                        break;
                }
            }
        }
        frag = prevFrag;
        // logger.log('found ' + level.fragments.length + ' fragments');
        if (frag && !frag.relurl) {
            level.fragments.pop();
            totalduration -= frag.duration;
        }
        level.totalduration = totalduration;
        level.averagetargetduration = totalduration / level.fragments.length;
        level.endSN = currentSN - 1;
        level.startCC = level.fragments[0] ? level.fragments[0].cc : 0;
        level.endCC = discontinuityCounter;
        if (!level.initSegment && level.fragments.length) {
            // this is a bit lurky but HLS really has no other way to tell us
            // if the fragments are TS or MP4, except if we download them :/
            // but this is to be able to handle SIDX.
            if (level.fragments.every((frag) => MP4_REGEX_SUFFIX.test(frag.relurl))) {
                logger_1.logger.warn('MP4 fragments found but no init segment (probably no MAP, incomplete M3U8), trying to fetch SIDX');
                frag = new fragment_1.default();
                frag.relurl = level.fragments[0].relurl;
                frag.baseurl = baseurl;
                frag.level = id;
                frag.type = type;
                frag.sn = 'initSegment';
                level.initSegment = frag;
                level.needSidxRanges = true;
            }
        }
        /**
         * Backfill any missing PDT values
           "If the first EXT-X-PROGRAM-DATE-TIME tag in a Playlist appears after
           one or more Media Segment URIs, the client SHOULD extrapolate
           backward from that tag (using EXTINF durations and/or media
           timestamps) to associate dates with those segments."
         * We have already extrapolated forward, but all fragments up to the first instance of PDT do not have their PDTs
         * computed.
         */
        if (firstPdtIndex) {
            backfillProgramDateTimes(level.fragments, firstPdtIndex);
        }
        return level;
    }
}
exports.default = M3U8Parser;
function backfillProgramDateTimes(fragments, startIndex) {
    let fragPrev = fragments[startIndex];
    for (let i = startIndex - 1; i >= 0; i--) {
        const frag = fragments[i];
        frag.programDateTime = fragPrev.programDateTime - (frag.duration * 1000);
        fragPrev = frag;
    }
}
function assignProgramDateTime(frag, prevFrag) {
    if (frag.rawProgramDateTime) {
        frag.programDateTime = Date.parse(frag.rawProgramDateTime);
    }
    else if (prevFrag && prevFrag.programDateTime) {
        frag.programDateTime = prevFrag.endProgramDateTime;
    }
    if (!Number.isFinite(frag.programDateTime)) {
        frag.programDateTime = null;
        frag.rawProgramDateTime = null;
    }
}
//# sourceMappingURL=m3u8-parser.js.map