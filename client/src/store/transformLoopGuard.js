// Crude protection against a user-authored transform (store/modules/
// transforms.js) hanging the page in an infinite loop -- e.g. a typo'd
// `while(true){}` pasted while iterating on a transform's source in
// components/modals/TransformEditorModal.vue. JS is single-threaded, so once
// a synchronous loop is actually running, nothing external (a timer, another
// tick) can interrupt it; the only way to bound it is to make the loop check
// a deadline *itself*, on every iteration. This rewrites the compiled
// source, textually, to insert exactly that check as the first statement of
// every `for`/`while`/`do` loop body it finds.
//
// Deliberately not a real parser: a small hand-rolled scanner that tracks
// just enough state (string/template/comment) to avoid matching "for" inside
// a string or a `forEach` identifier, and to find each loop's own opening
// `{` past its header's balanced parens. Known, accepted limitation (same
// spirit as sinkAutoDispatch.js's own "known imprecision" cases): a
// brace-less loop body (`while(true) doStuff();`) and a loop written inside
// a template literal's `${...}` expression are left unguarded, since finding
// their exact boundary needs real statement-level parsing. Every loop
// actually worth protecting against -- the "pasted a stray `{}`-bodied loop"
// mistake -- goes through the common, braced form this does catch.
const NORMAL = 0, SINGLE_QUOTE = 1, DOUBLE_QUOTE = 2, TEMPLATE = 3, LINE_COMMENT = 4, BLOCK_COMMENT = 5;

function is_ident_char(ch) {
    return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function skip_ws_and_comments(source, from) {
    const n = source.length;
    let i = from;
    while(i < n) {
        const ch = source[i];
        if(ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
        if(ch === '/' && source[i + 1] === '/') {
            i += 2;
            while(i < n && source[i] !== '\n') i++;
            continue;
        }
        if(ch === '/' && source[i + 1] === '*') {
            i += 2;
            while(i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        break;
    }
    return i;
}

// Finds the index just past a loop header's balanced `(...)`, starting at
// `openIdx` (source[openIdx] === '('). Tracks its own string/comment state
// (independent of the caller's) since the parens can themselves contain
// anything -- `for(const s = ")"; ...)`.
function skip_balanced_parens(source, openIdx) {
    const n = source.length;
    let depth = 0;
    let state = NORMAL;
    let templateDepth = 0;
    let i = openIdx;
    while(i < n) {
        const ch = source[i];
        if(state === NORMAL) {
            if(ch === '(') depth++;
            else if(ch === ')') {
                depth--;
                if(depth === 0) return i + 1;
            } else if(ch === '"') state = DOUBLE_QUOTE;
            else if(ch === "'") state = SINGLE_QUOTE;
            else if(ch === '`') { state = TEMPLATE; templateDepth = 0; }
            else if(ch === '/' && source[i + 1] === '/') state = LINE_COMMENT;
            else if(ch === '/' && source[i + 1] === '*') { state = BLOCK_COMMENT; i++; }
        } else if(state === SINGLE_QUOTE || state === DOUBLE_QUOTE) {
            const quote = state === SINGLE_QUOTE ? "'" : '"';
            if(ch === '\\') i++;
            else if(ch === quote) state = NORMAL;
        } else if(state === TEMPLATE) {
            if(ch === '\\') i++;
            else if(ch === '`' && templateDepth === 0) state = NORMAL;
            else if(ch === '$' && source[i + 1] === '{') { templateDepth++; i++; }
            else if(ch === '}' && templateDepth > 0) templateDepth--;
        } else if(state === LINE_COMMENT) {
            if(ch === '\n') state = NORMAL;
        } else if(state === BLOCK_COMMENT) {
            if(ch === '*' && source[i + 1] === '/') { state = NORMAL; i++; }
        }
        i++;
    }
    return n; // unterminated parens -- caller finds no '{' after and skips.
}

// Returns the list of source indices right after a loop body's opening `{`
// -- everywhere the injected deadline check below should land.
function find_loop_body_starts(source) {
    const n = source.length;
    const insertions = [];
    let state = NORMAL;
    let templateDepth = 0;
    let i = 0;
    while(i < n) {
        const ch = source[i];
        if(state === NORMAL) {
            if(ch === '"') { state = DOUBLE_QUOTE; i++; continue; }
            if(ch === "'") { state = SINGLE_QUOTE; i++; continue; }
            if(ch === '`') { state = TEMPLATE; templateDepth = 0; i++; continue; }
            if(ch === '/' && source[i + 1] === '/') { state = LINE_COMMENT; i += 2; continue; }
            if(ch === '/' && source[i + 1] === '*') { state = BLOCK_COMMENT; i += 2; continue; }

            if(/[A-Za-z_$]/.test(ch) && !is_ident_char(source[i - 1])) {
                const match = /^(for|while|do)\b/.exec(source.slice(i));
                if(match) {
                    const keyword = match[1];
                    let after = skip_ws_and_comments(source, i + keyword.length);
                    if(keyword !== 'do' && source[after] === '(') {
                        after = skip_ws_and_comments(source, skip_balanced_parens(source, after));
                    }
                    if(source[after] === '{') insertions.push(after + 1);
                    i += keyword.length;
                    continue;
                }
            }
            i++;
            continue;
        }
        if(state === SINGLE_QUOTE || state === DOUBLE_QUOTE) {
            const quote = state === SINGLE_QUOTE ? "'" : '"';
            if(ch === '\\') i += 2;
            else { if(ch === quote) state = NORMAL; i++; }
            continue;
        }
        if(state === TEMPLATE) {
            if(ch === '\\') { i += 2; continue; }
            if(ch === '`' && templateDepth === 0) { state = NORMAL; i++; continue; }
            if(ch === '$' && source[i + 1] === '{') { templateDepth++; i += 2; continue; }
            if(ch === '}' && templateDepth > 0) { templateDepth--; i++; continue; }
            i++;
            continue;
        }
        if(state === LINE_COMMENT) {
            if(ch === '\n') state = NORMAL;
            i++;
            continue;
        }
        if(state === BLOCK_COMMENT) {
            if(ch === '*' && source[i + 1] === '/') { state = NORMAL; i += 2; continue; }
            i++;
            continue;
        }
    }
    return insertions;
}

// `__txDeadline` arrives as a hidden third parameter (transformRun.js), not
// a closure variable -- so the same compiled/cached function can be reused
// across runs while each run gets its own fresh deadline.
const GUARD_SNIPPET = 'if(Date.now()>__txDeadline)throw new Error("Transform exceeded its execution time limit.");';

export function guard_loops(source) {
    const insertions = find_loop_body_starts(source);
    if(!insertions.length) return source;

    let result = '';
    let last = 0;
    for(const idx of insertions) {
        result += source.slice(last, idx) + GUARD_SNIPPET;
        last = idx;
    }
    return result + source.slice(last);
}
