// These scripts commonly run without spaces. Hangul is intentionally excluded:
// Korean normally separates words with spaces, as do Latin-script languages.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const OPENING = /[（［｛〈《「『【〔“‘(\[]$/u;
const CLOSING = /^[、。，．！？；：）》」』】〕］｝”’!?.,;:)\]]/u;
const PUNCTUATION = /^[\p{P}\p{Z}\s]+$/u;
const WESTERN = /^[\p{Script=Latin}\p{N}\p{M}]+(?:['’.,-][\p{Script=Latin}\p{N}\p{M}]+)*['’.,-]?$/u;
const WESTERN_CHARACTER = /^[\p{Script=Latin}\p{N}\p{M}]+$/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Keep Latin words and numbers intact inside Japanese/Chinese text. Grapheme
// segmentation also keeps combining marks and emoji sequences together.
function units(text) {
    const result = [];
    const characters = [...graphemes.segment(text)].map(item => item.segment);
    for (const [index, segment] of characters.entries()) {
        const previous = result.at(-1);
        const continuesWord = WESTERN_CHARACTER.test(segment)
            || /^[’'.,-]$/u.test(segment) && WESTERN_CHARACTER.test(characters[index + 1] || '');
        if (continuesWord && previous && WESTERN.test(previous)) {
            result[result.length - 1] += segment;
        } else result.push(segment);
    }
    return result;
}

export function textSize(text) {
    if (PUNCTUATION.test(text)) return 0;
    if (!UNSPACED.test(text)) return text.trim().split(/\s+/u).filter(Boolean).length;
    return units(text).filter(unit => !PUNCTUATION.test(unit)).length;
}

export function canBreakBetween(previous, next) {
    return !OPENING.test(previous) && !CLOSING.test(next);
}

export function joinTimedWords(words) {
    let text = '';
    for (const word of words) {
        const next = word.text;
        const last = [...graphemes.segment(text)].at(-1)?.segment || '';
        const first = Array.from(next)[0] || '';
        // Only infer a missing space at the boundary; preserve spaces already
        // present within the provider's text, including mixed-language passages.
        const adjacent = /[（［｛〈《「『【〔]$/u.test(text) || /^[、。，．！？；：）》」』】〕］｝]/u.test(next) || UNSPACED.test(last) || UNSPACED.test(first)
            || UNSPACED.test(text) && (CLOSING.test(next) || OPENING.test(text));
        text += (text && !adjacent ? ' ' : '') + next;
    }
    return text;
}

export function wrapText(text, limit) {
    if (!limit) return text;
    if (!UNSPACED.test(text)) {
        const words = text.split(/\s+/u), result = [];
        for (let i = 0; i < words.length; i += limit) result.push(words.slice(i, i + limit).join(' '));
        return result.join('\n');
    }
    // Wrapping changes presentation only. It never creates subtitle timestamps.
    return text.split('\n').map(paragraph => {
        const result = [];
        let line = '', size = 0;
        for (const unit of units(paragraph)) {
            const weight = PUNCTUATION.test(unit) ? 0 : 1;
            if (size >= limit && weight && !CLOSING.test(unit)) {
                // Keep opening brackets with the following text and closing
                // punctuation with the preceding line (a soft length limit).
                const opening = line.match(/[（［｛〈《「『【〔“‘(\[]+$/u)?.[0] || '';
                const finished = line.slice(0, line.length - opening.length).trimEnd();
                if (finished) result.push(finished);
                line = opening; size = 0;
            }
            if (!line && /^\s+$/u.test(unit)) continue;
            line += unit; size += weight;
        }
        if (line.trim()) result.push(line.trimEnd());
        return result.join('\n');
    }).join('\n');
}

// Split cue text by the same units used for its size and display wrapping.
// Preserve spacing and punctuation instead of reconstructing the transcript.
export function splitCueText(text, limit) {
    const tokens = UNSPACED.test(text) ? units(text) : text.match(/\s+|\S+/gu) || [];
    const result = [];
    let part = '', size = 0;
    for (const token of tokens) {
        const weight = textSize(token);
        if (size && (size + weight > limit && canBreakBetween(part.trimEnd(), token) || size >= limit && OPENING.test(token))) {
            result.push(part.trim()); part = ''; size = 0;
        }
        part += token; size += weight;
    }
    if (part.trim()) result.push(part.trim());
    return result;
}
