import * as util from './util'
import * as constant from './constant'


/**
 * Convert the yaml content into ast, this is the main method.
 *
 * TODO: add support for anchors
 *
 * @param text the yaml text
 */
export function parse(text) {
    try {
        return parseInternal(text);
    } catch (error) {
        if (error instanceof EvalError && error.recoverable) {
            if (error.recoverable.type === 'insert') {
                let input = String(text.replace(/\r\n?|\n/g, '\n'));
                const part1 = input.slice(0, error.recoverable.position);
                const part2 = input.slice(error.recoverable.position);
                try {
                    return parseInternal([part1, error.recoverable.insertText, part2].join(''));
                } catch(error2) {
                        throw error;
                }
            }
             else {
                throw 'invalid recoverable type';
            }
        } else {
            throw error;
        }
    }
}

function parseInternal(text) {
    let input = String(text.replace(/\r\n?|\n/g, '\n'));
    if (input.length !== 0) {

        // Add tailing `\n` if not exists
        if (input.charCodeAt(input.length - 1) !== 0x0A/* LF */ &&
            input.charCodeAt(input.length - 1) !== 0x0D/* CR */) {
            input += '\n';
        }

        // Strip BOM
        if (input.charCodeAt(0) === 0xFEFF) {
            input = input.slice(1);
        }
    }
    const state = new State(input);
    const lineLens = util.splitLines(state.input).map(line => line.length);
    // Use 0 as string terminator. That significantly simplifies bounds check.
    state.input += '\0';

    while (state.input.charCodeAt(state.position) === 0x20/* Space */) {
        state.lineIndent += 1;
        state.position += 1;
    }


    while (state.position < (state.length - 1)) {
        const docStartPosition = state.position;
        readDocument(state);
        const doc = {
            startPosition : docStartPosition,
            endPosition: state.position,
            nodes: util.popAll(state.nodes),
            comments: util.popAll(state.comments),
            tags: util.popAll(state.tags),
            errors: util.popAll(state.errors)
        };
        state.documents.push(doc);
    }

    return {documents: state.documents, lineLengths: lineLens, input: state.input};
}



function State(input) {
    this.input = input;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.documents = [];
    this.tags = [];
    this.nodes = [];
    this.errors = [];
    this.comments = [];
}

function addComment(state, startPosition) {
    state.comments.push({
        startPosition: startPosition,
        endPosition: state.position,
        kind: "COMMENT",
        raw: state.input.slice(startPosition, state.position)
    });
}

function newNode(state, kind, startPosition) {
    return {
        kind,
        startPosition: startPosition,
        endPosition: state.position,
        raw: state.input.slice(startPosition, state.position)
    };
}

function addNode(state, kind, startPosition) {
    const node = newNode(state, kind, startPosition);
    state.nodes.push(node);
    return node;
}

function skipSeparationSpace(state, allowComments) {
    let lineBreaks = 0,
        ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {
        while (util.is_WHITE_SPACE(ch)) {
            if(ch === 0x09 /*Tab*/){
                //TODO: add location info for errors
                state.errors.push("Using tabs can lead to unpredictable results");
            }
            ch = state.input.charCodeAt(++state.position);
        }

        if (allowComments && ch === 0x23/* # */) {
            let startPosition = state.position;
            do {
                ch = state.input.charCodeAt(++state.position);
            } while (ch !== 0x0A/* LF */ && ch !== 0x0D/* CR */ && ch !== 0);

            addComment(state, startPosition);
        }

        if (util.is_EOL(ch)) {
            readLineBreak(state);

            ch = state.input.charCodeAt(state.position);
            lineBreaks++;
            state.lineIndent = 0;

            while (ch === 0x20/* Space */) {
                state.lineIndent++;
                ch = state.input.charCodeAt(++state.position);
            }
        } else {
            break;
        }
    }
    return lineBreaks;
}

function readLineBreak(state) {
    let ch = state.input.charCodeAt(state.position);

    if (ch === 0x0A/* LF */) {
        state.position++;
    } else if (ch === 0x0D/* CR */) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 0x0A/* LF */) {
            state.position++;
        }
    } else {
        throw new Error('a line break is expected');
    }

    state.line ++;
    state.lineStart = state.position;
}

function testDocumentSeparator(state) {
    let _position = state.position,
        ch;

    ch = state.input.charCodeAt(_position);

    // Condition state.position === state.lineStart is tested
    // in parent on each call, for efficiency. No needs to test here again.
    if ((ch === 0x2D/* - */ || ch === 0x2E/* . */) &&
        ch === state.input.charCodeAt(_position + 1) &&
        ch === state.input.charCodeAt(_position + 2)) {

        _position += 3;

        ch = state.input.charCodeAt(_position);

        if (ch === 0 || util.is_WS_OR_EOL(ch)) {
            return true;
        }
    }

    return false;
}

function readDocument(state) {
    let ch;

    if ((ch = state.input.charCodeAt(state.position)) !== 0) {
        skipSeparationSpace(state, true);

        ch = state.input.charCodeAt(state.position);

        if (state.lineIndent === 0 && ch === 0x25/* % */) {
            throw new Error('directives are not supported.');
        }
    }

    skipSeparationSpace(state, true);

    if (state.lineIndent === 0 &&
        state.input.charCodeAt(state.position) === 0x2D/* - */ &&
        state.input.charCodeAt(state.position + 1) === 0x2D/* - */ &&
        state.input.charCodeAt(state.position + 2) === 0x2D/* - */) {
        state.position += 3;
        addNode(state, 'DOC_START', state.position - 3);
        skipSeparationSpace(state, true);
    }

    composeNode(state, state.lineIndent - 1, constant.CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true);

    if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 0x2E/* . */) {
            state.position += 3;
            addNode(state, 'DOC_END', state.position - 3);
            skipSeparationSpace(state, true);
        }
        return;
    }

    if (state.position < (state.length - 1)) {
        throw new Error('end of the stream or a document separator is expected');
    }
}



function readBlockScalar(state, nodeIndent) {
    let captureStart,
        didReadContent = false,
        detectedIndent = false,
        textIndent = nodeIndent,
        tmp,
        ch;

    captureStart = state.position;

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x7C/* | */ || ch === 0x3E/* > */) {
    } else {
        return false;
    }


    while (ch !== 0) {
        ch = state.input.charCodeAt(++state.position);

        if (ch === 0x2B/* + */ || ch === 0x2D/* - */) {

        } else if ((tmp = util.fromDecimalCode(ch)) >= 0) {
            if (tmp === 0) {
                throw new Error('bad explicit indentation width of a block scalar; it cannot be less than one');
            } else if (!detectedIndent) {
                textIndent = nodeIndent + tmp - 1;
                detectedIndent = true;
            } else {
                throw new Error('repeat of an indentation width identifier');
            }

        } else {
            break;
        }
    }
    const blockIndicator = newNode(state, 'BLOCK_INDICATOR', captureStart);

    if (util.is_WHITE_SPACE(ch)) {
        do {
            ch = state.input.charCodeAt(++state.position);
        }
        while (util.is_WHITE_SPACE(ch));

        if (ch === 0x23/* # */) {
            const commentStart = state.position;
            do {
                ch = state.input.charCodeAt(++state.position);
            }
            while (!util.is_EOL(ch) && (ch !== 0));
            addComment(state, commentStart);
        }
    }
    let blockStartPosition = -1;
    while (ch !== 0) {
        readLineBreak(state);
        if (blockStartPosition < 0) {
            blockStartPosition = state.position;
        }
        state.lineIndent = 0;

        ch = state.input.charCodeAt(state.position);

        while ((!detectedIndent || state.lineIndent < textIndent) &&
        (ch === 0x20/* Space */)) {
            state.lineIndent++;
            ch = state.input.charCodeAt(++state.position);
        }

        if (!detectedIndent && state.lineIndent > textIndent) {
            textIndent = state.lineIndent;
        }

        if (util.is_EOL(ch)) {
            continue;
        }

        // End of the scalar.
        if (state.lineIndent < textIndent) {

            break;
        }

        // Folded style: use fancy rules to handle line breaks.

        didReadContent = true;
        detectedIndent = true;

        while (!util.is_EOL(ch) && (ch !== 0)) {
            ch = state.input.charCodeAt(++state.position);
        }
    }

    let blockNode = {
        kind: "BLOCK",
        startPosition: captureStart,
        endPosition: state.position,
        blockIndicator,
        blockBody: {
            textIndent,
            kind: "SCALAR",
            startPosition: blockStartPosition,
            endPosition: state.position,
            raw: state.input.slice(blockStartPosition, state.position)
        }
    };
    blockNode.blockBody.parent = blockNode;
    blockIndicator.parent = blockNode;
    state.nodes.push(blockNode);
    return true;
}

function readBlockSequence(state, nodeIndent) {
    let _line,
        following,
        detected = false,
        ch,
        captureStart = state.position,
        _result = null;

    ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {

        if (ch !== 0x2D/* - */) {
            break;
        }

        following = state.input.charCodeAt(state.position + 1);

        if (!util.is_WS_OR_EOL(following)) {
            break;
        }

        detected = true;
        state.position++;

        if (skipSeparationSpace(state, true)) {
            if (state.lineIndent <= nodeIndent) {
                // a null element
                ch = state.input.charCodeAt(state.position);
                continue;
            }
        }

        _line = state.line;
        composeNode(state, nodeIndent, constant.CONTEXT_BLOCK_IN, false, true);
        if (!_result) {
            _result = {
                startPosition:  captureStart,
                items: [],
                kind: "SEQ",
            };
        }

        let current = state.nodes.pop();
        current.parent = _result;
        current.tags = state.tags.splice(0,  state.tags.length);

        _result.items.push(current);
        _result.endPosition = current.endPosition;

        skipSeparationSpace(state, true);

        ch = state.input.charCodeAt(state.position);

        if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
            console.log('bad indentation of a sequence entry');
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }

    if (detected) {
        _result.endPosition = state.position;
        state.nodes.push(_result);
        return true;
    }
    return false;
}

function readSingleQuotedScalar(state) {
    let ch,
        captureStart;

    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x27/* ' */) {
        return false;
    }
    captureStart = state.position;
    state.position++;


    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 0x27/* ' */) {
            ch = state.input.charCodeAt(++state.position);

            if (ch === 0x27/* ' */) {
                state.position++;
            } else {
                state.nodes.push(
                    {
                        startPosition: captureStart,
                        endPosition: state.position,
                        kind: 'SCALAR',
                        singleQuoted: true,
                        raw: state.input.slice(captureStart, state.position),

                    });
                return true;
            }

        } else if (util.is_EOL(ch)) {
            skipSeparationSpace(state, false);
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            throw new Error('unexpected end of the document within a single quoted scalar');

        } else {
            state.position++;
        }
    }
    throw new Error('unexpected end of the stream within a single quoted scalar');
}

function readDoubleQuotedScalar(state) {
    let captureStart,
        ch;

    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x22/* " */) {
        return false;
    }

    captureStart = state.position;
    state.position++;


    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 0x22/* " */) {
            state.position++;
            addNode(state, 'SCALAR', captureStart).doubleQuoted = true;
            return true;

        } else if (ch === 0x5C/* \ */) {
            ch = state.input.charCodeAt(++state.position);

            if (util.is_EOL(ch)) {
                skipSeparationSpace(state, false);
            } else {
                state.position++;
            }

        } else if (util.is_EOL(ch)) {
            skipSeparationSpace(state, false);
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            console.log('unexpected end of the document within a double quoted scalar');

        } else {
            state.position++;
        }
    }

    throw new Error('unexpected end of the stream within a double quoted scalar');
}

class EvalError extends Error {
    constructor(message) {
        super(message);
    }
}

function findLast(text, current, charactor) {
   let i = current;
   for (; i >=0 && text.charAt(i) !== charactor; i--);
   return i;
}

function readBlockMapping(state, nodeIndent, flowIndent) {
    let following,
        allowCompact,
        _line,
        _pos,
        _result = null,
        keyNode = null,
        colonNode = null,
        valueNode = null,
        atExplicitKey = false,
        detected = false,
        ch;

    ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {
        following = state.input.charCodeAt(state.position + 1);
        _line = state.line; // Save the current line.
        _pos = state.position;

        //
        // Explicit notation case. There are two separate blocks:
        // first for the key (denoted by "?") and second for the value (denoted by ":")
        //
        if ((ch === 0x3F/* ? */ || ch === 0x3A/* : */) && util.is_WS_OR_EOL(following)) {

            if (ch === 0x3F/* ? */) {
                if (atExplicitKey) {
                    //TODO: more compatible version to handle this
                    throw new Error("cannot enter complex mode while it is already in complex mode.");
                }
                detected = true;
                atExplicitKey = true;
                allowCompact = true;
                state.position ++;
            } else if (atExplicitKey) {
                // i.e. 0x3A/* : */ === character after the explicit key.
                atExplicitKey = false;
                allowCompact = true;
                state.position ++;
                colonNode = newNode(state, 'COLON', state.position - 1);
            } else {
                detected = true;
                atExplicitKey = false;
                allowCompact = true;
                const error = new EvalError('incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
                error.recoverable = {
                    type: 'insert',
                    position: findLast(state.input, state.position, '\n'),
                    insertText: ':'
                };
                throw error;
            }


            ch = following;

            //
            // Implicit notation case. Flow-style node as the key first, then ":", and the value.
            //
        } else if (composeNode(state, flowIndent, constant.CONTEXT_FLOW_OUT, false, true)) {

            if (state.line === _line) {
                ch = state.input.charCodeAt(state.position);

                while (util.is_WHITE_SPACE(ch)) {
                    ch = state.input.charCodeAt(++state.position);
                }

                if (ch === 0x3A/* : */) {
                    ch = state.input.charCodeAt(++state.position);

                    colonNode = newNode(state, 'COLON', state.position - 1);

                    if (!util.is_WS_OR_EOL(ch)) {
                        console.log('a whitespace character is expected after the key-value separator within a block mapping');
                        state.position --;
                    }

                    if (atExplicitKey) {
                        //TODO: more compatible version to handle this
                        throw new Error('cannot enter complex mode while it is already in complex mode.');
                        // keyNode = valueNode = null;
                    }

                    detected = true;
                    atExplicitKey = false;
                    allowCompact = false;
                    keyNode = state.nodes.pop();
                } else if (detected) {
                    const error = new EvalError('can not read an implicit mapping pair; a colon is missed');
                    error.recoverable = {
                        type: 'insert',
                        position: findLast(state.input, state.position, '\n'),
                        insertText: ':'
                    };
                    throw error;

                } else {
                    return true; // Keep the result of `composeNode`.
                }

            } else if (detected) {
                reportError(state, 'can not read a block mapping entry; a multi-line key may not be an implicit key');
                // recovery
                const errorNode = state.nodes.pop();
                const currentLine = util.getLineAfterPosition(state.input, errorNode.startPosition);
                if (currentLine.includes(':')) {
                    const colonPos = currentLine.lastIndexOf(':');
                    state.position = errorNode.startPosition + colonPos;
                    keyNode = newNode(state, 'SCALAR', errorNode.startPosition);
                    state.position ++;
                    colonNode = newNode(state, 'COLON', state.position - 1);
                    const valueStart  = state.position;
                    state.position = state.lineStart - 1;
                    while (state.position >= 0 && util.is_EOL(state.input.charCodeAt(state.position))) {
                        state.position --;
                    }
                    state.position ++;
                    valueNode = valueStart < state.position ? newNode(state, 'SCALAR', valueStart) : null;
                    _result.mappings.push({
                        parent: _result,
                        kind: "PAIR",
                        startPosition: keyNode.startPosition,
                        endPosition: state.position,
                        key: keyNode,
                        value: valueNode,
                        colon: colonNode, // in error recovery node, there is no colon node
                        tags: []
                    });
                } else {
                    state.position = errorNode.startPosition + currentLine.length;
                    keyNode = newNode(state, 'SCALAR', errorNode.startPosition);
                    const valueStart  = state.position;
                    state.position = state.lineStart - 1;
                    while (state.position >= 0 && util.is_EOL(state.input.charCodeAt(state.position))) {
                        state.position --;
                    }

                    valueNode = valueStart < state.position ? newNode(state, 'SCALAR', valueStart) : null;
                    _result.mappings.push({
                        parent: _result,
                        kind: "PAIR",
                        startPosition: keyNode.startPosition,
                        endPosition: state.position,
                        key: keyNode,
                        value: valueNode,
                        colon: colonNode, // in error recovery node, there is no colon node
                        tags: []
                    });
                }



                // reset state variables
                _line = state.line;
                state.tags = [];
                state.position = state.lineStart;
                skipSeparationSpace(state, false);

                atExplicitKey = false;
                allowCompact = false;
                colonNode = keyNode = valueNode = null;
                continue;
            } else {
                return true; // Keep the result of `composeNode`.
            }

        } else {
            break; // Reading is done. Go to the epilogue.
        }

        //
        // Common reading code for both explicit and implicit notations.
        //
        if (state.line === _line || state.lineIndent > nodeIndent) {
            if (composeNode(state, nodeIndent, constant.CONTEXT_BLOCK_OUT, true, allowCompact)) {
                if (atExplicitKey) {
                    keyNode = state.nodes.pop();
                } else {
                    valueNode = state.nodes.pop();
                }
            }

            if (!atExplicitKey) {
                if (_result === null) {
                    _result = {
                        startPosition: keyNode.startPosition,
                        parent: null,
                        indent: state.lineIndent,
                        mappings: [{
                            kind: "PAIR",
                            startPosition: keyNode.startPosition,
                            endPosition: state.position,
                            key: keyNode, value: valueNode,
                            colon: colonNode,
                            tags: state.tags.splice(0, state.tags.length)
                        }],
                        kind: "MAPPING"
                    };
                    _result.mappings[0].parent = _result;
                    keyNode.parent = _result;
                    if (valueNode) valueNode.parent = _result;
                } else {

                    keyNode.parent = _result;
                    if (valueNode) valueNode.parent = _result;
                    _result.mappings.push({
                        kind: "PAIR",
                        parent: _result,
                        startPosition: keyNode.startPosition,
                        endPosition: state.position,
                        key: keyNode, value: valueNode,
                        colon: colonNode,
                        tags: state.tags.splice(0, state.tags.length)
                    });
                }

                colonNode = keyNode = valueNode = null;
            }

            skipSeparationSpace(state, true);
            ch = state.input.charCodeAt(state.position);
        }

        if (state.lineIndent > nodeIndent && (ch !== 0)) {
            console.log('bad indentation of a mapping entry');
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }

    //
    // Epilogue.
    //

    // Special case: last mapping's node contains only the key in explicit notation.
    if (atExplicitKey && detected) {
        console.log('Special case: last mapping\'s node contains only the key in explicit notation.');
        if (keyNode) {
            state.nodes.push(keyNode);
        }
        return true;
    }

    // Expose the resulting mapping.
    if (detected) {
        _result.endPosition = state.position;
        state.nodes.push(_result);
    }

    return detected;
}


function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {

    let allowBlockStyles,
        allowBlockScalars,
        allowBlockCollections,
        indentStatus = 1, // 1: this>parent, 0: this=parent, -1: this<parent
        atNewLine = false,
        hasContent = false,
        flowIndent,
        blockIndent;

    allowBlockStyles = allowBlockScalars = allowBlockCollections =
        constant.CONTEXT_BLOCK_OUT === nodeContext ||
        constant.CONTEXT_BLOCK_IN === nodeContext;

    if (allowToSeek) {
        if (skipSeparationSpace(state, true)) {
            atNewLine = true;

            if (state.lineIndent > parentIndent) {
                indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
                indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
                indentStatus = -1;
            }
        }
    }
    if (indentStatus === 1) {
        while (readTagProperty(state)) {
            //TODO anchor support
            //|| readAnchorProperty(state)) {
            if (skipSeparationSpace(state, true)) {
                atNewLine = true;
                allowBlockCollections = allowBlockStyles;

                if (state.lineIndent > parentIndent) {
                    indentStatus = 1;
                } else if (state.lineIndent === parentIndent) {
                    indentStatus = 0;
                } else if (state.lineIndent < parentIndent) {
                    indentStatus = -1;
                }
            } else {
                allowBlockCollections = false;
            }
        }
    }

    if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
    }

    if (indentStatus === 1 || constant.CONTEXT_BLOCK_OUT === nodeContext) {
        if (constant.CONTEXT_FLOW_IN === nodeContext || constant.CONTEXT_FLOW_OUT === nodeContext) {
            flowIndent = parentIndent;
        } else {
            flowIndent = parentIndent + 1;
        }

        blockIndent = state.position - state.lineStart;

        if (indentStatus === 1) {
            if (allowBlockCollections &&
                (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) ||
                readFlowCollection(state, flowIndent)) {
                hasContent = true;
            } else {
                if ((allowBlockScalars && readBlockScalar(state, flowIndent)) ||
                    readSingleQuotedScalar(state, flowIndent) ||
                    readDoubleQuotedScalar(state, flowIndent)) {
                    hasContent = true;

                } else if (readPlainScalar(state, flowIndent, constant.CONTEXT_FLOW_IN === nodeContext)) {
                    hasContent = true;
                }
            }
        } else if (indentStatus === 0) {
            // Special case: block sequences are allowed to have same indentation level as the parent.
            // http://www.yaml.org/spec/1.2/spec.html#id2799784
            hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
    }
    return hasContent;
}


function readTagProperty(state) {

    let _position,
        isVerbatim = false,
        isNamed    = false,
        tagHandle,
        ch;
    _position = state.position;
    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x21/* ! */) return false;

    ch = state.input.charCodeAt(++state.position);
    if (ch === 0x3C/* < */) {
        isVerbatim = true;
        ch = state.input.charCodeAt(++state.position);

    } else if (ch === 0x21/* ! */) {
        isNamed = true;
        tagHandle = '!!';
        ch = state.input.charCodeAt(++state.position);

    } else {
        tagHandle = '!';
    }

    if (isVerbatim) {
        do { ch = state.input.charCodeAt(++state.position); }
        while (ch !== 0 && ch !== 0x3E/* > */);

        if (state.position < state.length) {
            state.input.charCodeAt(++state.position);
        } else {
            throw new Error('unexpected end of the stream within a verbatim tag');
        }
    } else {
        while (ch !== 0 && !util.is_WS_OR_EOL(ch)) {

            if (ch === 0x21/* ! */) {
                if (!isNamed) {
                    tagHandle = state.input.slice(_position - 1, state.position + 1);

                    if (!constant.PATTERN_TAG_HANDLE.test(tagHandle)) {
                        throw new Error('named tag handle cannot contain such characters');
                    }

                    isNamed = true;
                    _position = state.position + 1;
                } else {
                    throw new Error( 'tag suffix cannot contain exclamation marks');
                }
            }

            ch = state.input.charCodeAt(++state.position);
        }

    }


    state.tags.push(newNode(state, 'TAG', _position));
    return true;
}

function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let preceding,
        following,
        captureStart,
        captureEnd,
        _line,
        _lineStart,
        _lineIndent,
        ch;
    ch = state.input.charCodeAt(state.position);

    if (util.is_WS_OR_EOL(ch) ||
        util.is_FLOW_INDICATOR(ch) ||
        ch === 0x23/* # */ ||
        ch === 0x26/* & */ ||
        ch === 0x2A/* * */ ||
        ch === 0x21/* ! */ ||
        ch === 0x7C/* | */ ||
        ch === 0x3E/* > */ ||
        ch === 0x27/* ' */ ||
        ch === 0x22/* " */ ||
        ch === 0x25/* % */ ||
        ch === 0x40/* @ */ ||
        ch === 0x60/* ` */) {
        return false;
    }


    if (ch === 0x3F/* ? */ || ch === 0x2D/* - */) {
        following = state.input.charCodeAt(state.position + 1);

        if (util.is_WS_OR_EOL(following) ||
            withinFlowCollection && util.is_FLOW_INDICATOR(following)) {
            return false;
        }
    }
    captureStart = captureEnd = state.position;

    while (ch !== 0) {
        if (ch === 0x3A/* : */) {
            following = state.input.charCodeAt(state.position + 1);

            if (util.is_WS_OR_EOL(following) ||
                withinFlowCollection && util.is_FLOW_INDICATOR(following)) {
                break;
            }

        } else if (ch === 0x23/* # */) {
            preceding = state.input.charCodeAt(state.position - 1);

            if (util.is_WS_OR_EOL(preceding)) {
                break;
            }

        } else if ((state.position === state.lineStart && testDocumentSeparator(state)) ||
            withinFlowCollection && util.is_FLOW_INDICATOR(ch)) {
            break;

        } else if (util.is_EOL(ch)) {
            _line = state.line;
            _lineStart = state.lineStart;
            _lineIndent = state.lineIndent;
            skipSeparationSpace(state, false);

            if (state.lineIndent >= nodeIndent) {
                ch = state.input.charCodeAt(state.position);
                continue;
            } else {
                state.position = captureEnd;
                state.line = _line;
                state.lineStart = _lineStart;
                state.lineIndent = _lineIndent;
                break;
            }
        }

        if (!util.is_WHITE_SPACE(ch)) {
            captureEnd = state.position + 1;
        }

        ch = state.input.charCodeAt(++state.position);
    }

    let raw = state.input.slice(captureStart, state.position);
    if (raw.trim().length) {
        const node = addNode(state, 'SCALAR', captureStart);
        node.plainScalar = true;
        node.indent = state.lineIndent;
        return true;
    }

    return false;
}

function readFlowCollection(state, nodeIndent) {
    let readNext = true,
        _line,
        following,
        terminator,
        isPair,
        isExplicitPair,
        isMapping,
        keyNode,
        keyTag,
        valueNode,
        _result,
        colonNode,
        ch;
    let startPosition  = state.position;
    ch = state.input.charCodeAt(state.position);

    if (ch === 0x5B/* [ */) {
        terminator = 0x5D;/* ] */
        isMapping = false;
        _result = {
            kind: 'SEQ',
            startPosition: startPosition,
            items: []
        }
    } else if (ch === 0x7B/* { */) {
        terminator = 0x7D;/* } */
        isMapping = true;
        _result = {
            kind: 'MAPPING',
            startPosition: startPosition,
            mappings: []
        }
    } else {
        return false;
    }

    ch = state.input.charCodeAt(++state.position);

    while (ch !== 0) {
        skipSeparationSpace(state, true, nodeIndent);

        ch = state.input.charCodeAt(state.position);

        if (ch === terminator) {
            state.position++;
            _result.endPosition = state.position;
            state.nodes.push(_result);
            return true;
        } else if (!readNext) {
            throw new Error('missed comma between flow collection entries');
        }

        keyNode = valueNode = null;
        isPair = isExplicitPair = false;

        if (ch === 0x3F/* ? */) {
            following = state.input.charCodeAt(state.position + 1);

            if (util.is_WS_OR_EOL(following)) {
                isPair = isExplicitPair = true;
                state.position++;
                skipSeparationSpace(state, true, nodeIndent);
            }
        }
        _line = state.line;
        composeNode(state, nodeIndent, constant.CONTEXT_FLOW_IN, false, true);
        keyTag = state.tags.pop();
        keyNode = state.nodes.pop();
        skipSeparationSpace(state, true, nodeIndent);

        ch = state.input.charCodeAt(state.position);

        if ((isExplicitPair || state.line === _line) && ch === 0x3A/* : */) {
            isPair = true;
            ch = state.input.charCodeAt(++state.position);
            colonNode = newNode(state, 'COLON', state.position - 1);
            skipSeparationSpace(state, true, nodeIndent);
            composeNode(state, nodeIndent, constant.CONTEXT_FLOW_IN, false, true);
            valueNode = state.nodes.pop();
        }
        if (isMapping) {
            _result.mappings.push({
                parent: _result,
                kind: "PAIR",
                key: keyNode,
                value: valueNode,
                colon: colonNode,
                startPosition: keyNode.startPosition,
                endPosition: state.position
            });
        } else if (isPair) {
            const newNode = {
                kind: "MAPPING",
                parent: _result,
                startPosition: keyNode.startPosition,
                endPosition: state.position,
                mappings: [
                    {
                        kind: "PAIR",
                        key: keyNode,
                        colon: colonNode,
                        value: valueNode,
                        startPosition: keyNode.startPosition,
                        endPosition: state.position
                    }
                ]
            };
            newNode.mappings[0].parent = newNode;
            _result.items.push(newNode);
        } else {
            keyNode.parent = _result;
            _result.items.push(keyNode);
        }

        skipSeparationSpace(state, true, nodeIndent);

        ch = state.input.charCodeAt(state.position);

        if (ch === 0x2C/* , */) {
            readNext = true;
            ch = state.input.charCodeAt(++state.position);
        } else {
            readNext = false;
        }
    }
}

/**
 * Construct the ast for the yaml text, and find the ast at the given position
 *
 * @param text the yaml text
 * @param lineNumber the zero-based line number
 * @param columnNumber the zero-based number in line
 */
export function parseWithPosition(text, lineNumber, columnNumber) {
    let { documents, lineLengths } = parse(text);
    return { documents, ...findNodeAtPosition(documents, lineLengths, lineNumber, columnNumber) };
}

export function findNodeAtPosition(documents, lineLens, lineNumber, columnNumber) {
    let newPos = util.convertPosition(lineLens, lineNumber, columnNumber);
    let matchedDocument = util.getDocumentAtPosition(documents, newPos);
    if (matchedDocument.errors.find(error => error.includes('tabs can lead to unpredictable results'))) {
        throw new Error("Cannot parse position in yaml with tab characters.");
    }

    let matchedNode;
    if (columnNumber > 0) {
        matchedNode = util.getNodeAtPosition(matchedDocument.comments, newPos - 1);
        if (!matchedNode) {
            matchedNode = util.getNodeAtPosition(matchedDocument.nodes, newPos - 1);
        }

    }
    if (!matchedNode) {
        matchedNode = util.getNodeAtPosition(matchedDocument.comments, newPos);
        if (!matchedNode) {
            matchedNode = util.getNodeAtPosition(matchedDocument.nodes, newPos);
        }

    }
    return { matchedNode, matchedDocument };
}


function reportError(state, message) {
    //TODO, handle the error message and the location where this error is thrown
}

