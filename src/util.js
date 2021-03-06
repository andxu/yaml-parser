export function fromDecimalCode(c) {
    if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
        return c - 0x30;
    }

    return -1;
}

export function is_EOL(c) {
    return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

export function is_WHITE_SPACE(c) {
    return (c === 0x09/* Tab */) || (c === 0x20/* Space */);
}

export function is_WS_OR_EOL(c) {
    return (c === 0x09/* Tab */) ||
        (c === 0x20/* Space */) ||
        (c === 0x0A/* LF */) ||
        (c === 0x0D/* CR */);
}

export function is_FLOW_INDICATOR(c) {
    return c === 0x2C/* , */ ||
        c === 0x5B/* [ */ ||
        c === 0x5D/* ] */ ||
        c === 0x7B/* { */ ||
        c === 0x7D/* } */;
}

export function repeat(str, count) {
    return str.repeat(count);
}

export function splitLines(str) {
    return str.split(/\r\n?|\n/);
}

export function countCharacters(str, ch) {
    return (str.length - str.replace(new RegExp(ch,"g"), '').length) / ch.length;
}


export function getIndentAtPosition(str, pos) {
    while (pos > 0 && !is_EOL(str.charCodeAt(pos - 1))) {
        pos --;
    }

    let indent = 0;
    while (pos < str.length && str.charCodeAt(pos) === 0x20/* Space */) {
        pos ++;
        indent ++;
    }
    return indent;
}

export function getLineAtPosition(str, pos) {
    while (pos >= 0 && !is_EOL(str.charCodeAt(pos))) {
        pos --;
    }

    let start = pos;
    while (pos < str.length && !is_EOL(str.charCodeAt(pos))) {
        pos ++;
    }
    return str.slice(start, pos);
}

export function getLineAfterPosition(str, pos) {
    let start = pos;
    while (pos < str.length && !is_EOL(str.charCodeAt(pos))) {
        pos ++;
    }
    return str.slice(start, pos);
}

export function popAll(array) {
    return array.splice(0, array.length);
}

export function isComment(node) {
    return node && node.kind === 'COMMENT';
}

export function isBlock(node) {
    return node && node.kind === 'BLOCK';
}

export function isMapping(node) {
    return node && node.kind === 'MAPPING';
}

export function isArray(node) {
    return node && node.kind === 'SEQ';
}

export function isMappingItem(node) {
    return node && node.kind === 'PAIR';
}

export function isKey(target) {
    return (target && target.parent
        && ( (target.parent.key === target)
            || (target.parent.mappings || []).find(node => node.key === target))
    );
}

export function isValue(target) {
    return (target && target.parent
        && ( (target.parent.value === target)
            || (target.parent.mappings || []).find(node => node.value === target))
    );
}



export function convertPosition(lineLens, lineNumber, columnNumber) {

    let pos = 0;
    for (let i = 0; i < lineNumber; i ++) {
        pos += lineLens[i] + 1;
    }
    return pos + columnNumber;
}

export function getDocumentAtPosition(documents, pos) {
    return documents.find(doc => insideNode(doc, pos));
}

export function getNodeAtPosition(arg1, pos) {
    let nodes;
    if (Array.isArray(arg1)) {
        nodes = arg1;
    } else {
        nodes = [arg1];
    }
    for(let node of nodes) {
        if (!node || !insideNode(node, pos)) {
            continue;
        }
        let find;
        if (isSimpleNode(node)) {
            return node;
        }

        if (node.kind === 'MAPPING') {
            find = getNodeAtPosition(node.mappings, pos);
        } else if (node.kind === 'SEQ') {
            find = getNodeAtPosition(node.items, pos);
        } else if (node.kind === 'BLOCK') {
            find = getNodeAtPosition([node.blockIndicator, node.blockBody], pos);
        } else if (node.kind === 'PAIR') {
            find = getNodeAtPosition([node.key, node.colon, node.value, ...node.tags], pos);
        }

        return find;
    }
}

function isSimpleNode(node) {
    return node.kind === 'SCALAR' || node.kind === 'TAG' ||  node.kind === 'COMMENT' || node.kind === 'COLON'
        || node.kind === 'BLOCK_INDICATOR' || node.kind === 'DOC_START' || node.kind === 'DOC_END' ;
}


function insideNode(node, pos) {
    return node.startPosition <= pos && node.endPosition > pos;
}


let simpleEscapeMap = new Array(256);
let simpleEscapeCheck = new Array(256); // integer, for fast access

function simpleEscapeSequence(c) {
  return (c === 0x30/* 0 */) ? '\x00' :
        (c === 0x61/* a */) ? '\x07' :
        (c === 0x62/* b */) ? '\x08' :
        (c === 0x74/* t */) ? '\x09' :
        (c === 0x09/* Tab */) ? '\x09' :
        (c === 0x6E/* n */) ? '\x0A' :
        (c === 0x76/* v */) ? '\x0B' :
        (c === 0x66/* f */) ? '\x0C' :
        (c === 0x72/* r */) ? '\x0D' :
        (c === 0x65/* e */) ? '\x1B' :
        (c === 0x20/* Space */) ? ' ' :
        (c === 0x22/* " */) ? '\x22' :
        (c === 0x2F/* / */) ? '/' :
        (c === 0x5C/* \ */) ? '\x5C' :
        (c === 0x4E/* N */) ? '\x85' :
        (c === 0x5F/* _ */) ? '\xA0' :
        (c === 0x4C/* L */) ? '\u2028' :
        (c === 0x50/* P */) ? '\u2029' : '';
}

for (let i = 0; i < 256; i++) {
    simpleEscapeMap[i] = simpleEscapeSequence(i);
    simpleEscapeCheck[i] = simpleEscapeMap[i] ? 1 : 0;
}


function fromHexCode(c) {
    let lc;

    if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
        return c - 0x30;
    }

    /*eslint-disable no-bitwise*/
    lc = c | 0x20;

    if ((0x61/* a */ <= lc) && (lc <= 0x66/* f */)) {
        return lc - 0x61 + 10;
    }

    return -1;
}

function escapedHexLen(c) {
    if (c === 0x78/* x */) { return 2; }
    if (c === 0x75/* u */) { return 4; }
    if (c === 0x55/* U */) { return 8; }
    return 0;
}

function fromDecimalCode(c) {
    if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
        return c - 0x30;
    }

    return -1;
}
function charFromCodepoint(c) {
    if (c <= 0xFFFF) {
        return String.fromCharCode(c);
    }
    // Encode UTF-16 surrogate pair
    // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
    return String.fromCharCode(((c - 0x010000) >> 10) + 0xD800,
        ((c - 0x010000) & 0x03FF) + 0xDC00);
}

export function getScalarValue(node) {
    if (node.kind === 'SCALAR') {
        const buffer = new Buffer(node.raw.length);
        let tmp, hexLength, hexResult;
        if (node.doubleQuoted) {
            let ch;
            // [i to length - 1] to skip two quotes
            for (let i = 1; i < node.raw.length - 1; i++ ){
                ch = node.raw.charCodeAt(i);
                if (0x5C/* \ */ === ch) {
                    ch = node.raw.charCodeAt(++i);
                    if (is_EOL(ch)) {
                        // TODO: handle multiple line spaces.
                        i++;
                    } else if (ch < 256 && simpleEscapeCheck(ch)) {
                        buffer.push(simpleEscapeMap[ch]);
                        i++;
                    } else if ((tmp = escapedHexLen(ch)) > 0) {
                        hexLength = tmp;
                        hexResult = 0;

                        for (; hexLength > 0 && i < node.raw.length - 1; hexLength--) {
                            ch = node.raw.charCodeAt(++i);

                            if ((tmp = fromHexCode(ch)) >= 0) {
                                hexResult = (hexResult << 4) + tmp;

                            } else {
                                hexResult = -1;
                                break;
                            }
                        }

                        buffer.push(hexResult < 0 ? '?' : charFromCodepoint(hexResult));
                    } else {
                        // instead reporting: unknown escape sequence
                        buffer.push('?');
                    }
                }
            }
            return buffer.toString();
        } else if (node.singleQuoted) {
            let ch;
            // [i to length - 1] to skip two quotes
            for (let i = 1; i < node.raw.length - 1; i++ ) {
                ch = node.raw.charCodeAt(i);
                if (0x27/* ' */ === ch) {
                    if (i < node.raw.length - 1 && (0x27/* ' */ === node.raw.charCodeAt(i + 1))) {
                        buffer.push('\'');
                        i++;
                    }
                } else if (is_EOL(ch)) {
                    buffer.push(' ');
                } else {
                    buffer.push(ch);
                }
            }
        } else {
            return node.raw;
        }
    }
    return undefined;

}