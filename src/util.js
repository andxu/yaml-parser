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