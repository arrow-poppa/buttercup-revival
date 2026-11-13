import { canBreakBetween, joinTimedWords, textSize, wrapText, splitCueText } from './text.js';

// Word grouping and line breaks preserve the original Buttercup preferences.
export function cleanSegments(items) {
    if (!Array.isArray(items) || items.length > 100000) throw new Error('Invalid subtitle segments');
    const seen = new Set();
    return items.map((item, index) => {
        const fail = detail => { throw new Error(`Subtitle entry ${index + 1}: ${detail}`); };
        if (typeof item?.start !== 'number' || typeof item?.end !== 'number' || typeof (item.text ?? item.word) !== 'string') fail('provider did not supply numeric timestamps and text');
        if (!Number.isFinite(item.start) || !Number.isFinite(item.end)) fail('start and end must be finite numbers in seconds');
        if (item.start < 0) fail('start must not be negative');
        if (item.end <= item.start) fail('end must be greater than start');
        if (item.end > 172800) fail('end exceeds the supported 48-hour limit; timestamps must be in seconds');
        const start = Math.round(item.start * 1000) / 1000, end = Math.round(item.end * 1000) / 1000;
        const text = (item.text ?? item.word).replace(/\r/g, '').replace(/\n[ \t]*\n+/g, '\n').trim();
        if (end <= start) fail('duration is below one millisecond after rounding');
        if (!text || text.length > 20000) fail('subtitle text must contain 1 to 20000 characters');
        return { start, end, text };
    }).sort((a, b) => a.start - b.start || a.end - b.end).filter(item => {
        const key = `${item.start}|${item.end}|${item.text}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
}

// Whisper regularly leaves a word without an end time, or with a zero length,
// typically the last word of an audio window. One such entry must not discard
// every word: its start is real, so only its end is bounded by the next word.
// Many unfinished words mean the model has no real word timing; those arrays
// are left alone and rejected, so the provider's segments are used instead.
function repairWords(items) {
    let repaired = 0;
    const result = items.map((item, index) => {
        if (typeof item?.start !== 'number' || !Number.isFinite(item.start)) return item;
        if (typeof item.end === 'number' && item.end > item.start) return item;
        if (item.end != null && typeof item.end !== 'number') return item;
        repaired++;
        const next = items[index + 1]?.start;
        return { ...item, end: typeof next === 'number' && next > item.start + .01 ? Math.min(next, item.start + .5) : item.start + .2 };
    });
    return repaired * 10 <= items.length ? result : items;
}

export function normalize(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Invalid provider transcription object');
    const result = { words: [], segments: [], text: typeof response.text === 'string' ? response.text : '',
        language: typeof response.language === 'string' ? response.language : '', warnings: [] };
    const errors = [];
    for (const key of ['words', 'segments']) {
        const items = response[key];
        if (Array.isArray(items) && items.length > 100000) throw new Error(`Too many subtitle ${key}`);
        try {
            if (items == null) continue;
            if (!Array.isArray(items)) throw new Error('expected an array');
            const nonempty = items.filter(item => {
                const text = item?.text ?? item?.word;
                return typeof text !== 'string' || text.trim();
            });
            result[key] = cleanSegments(key === 'words' ? repairWords(nonempty) : nonempty);
        } catch (error) { errors.push({ key, message: error.message }); }
    }
    if (errors.length && !result.words.length && !result.segments.length) {
        throw new Error(`Invalid provider timestamps: ${errors.map(error => `${error.key}: ${error.message}`).join('; ')}. Use a model/endpoint returning timestamped segments (Audio Transcriptions: verbose_json).`);
    }
    for (const { key } of errors) result.warnings.push(key === 'words'
        ? 'Invalid word timestamps; using the segment timestamps returned by the provider.'
        : 'Invalid segment timestamps; using the word timestamps returned by the provider.');
    return result;
}

export function mergeChunks(parts) {
    const merged = { words: [], segments: [], text: '', language: '', warnings: [] };
    const wordFallbacks = [];
    let cutoff = 0;
    for (let i = 0; i < parts.length; i++) {
        const { offset, duration, transcript } = parts[i];
        const right = i + 1 < parts.length ? (offset + duration + parts[i + 1].offset) / 2 : Infinity;
        for (const key of ['words', 'segments']) {
            // Word-only replies still need complete captions when segment mode
            // is selected later. These are real provider word times, not guesses.
            const items = key === 'segments' && !transcript.segments.length ? transcript.words : transcript[key];
            for (const item of items) {
                const start = offset + item.start, end = Math.min(offset + item.end, offset + duration);
                const midpoint = (start + end) / 2;
                // Midpoint ownership avoids repeated words in the chunk overlap.
                if (midpoint < cutoff || midpoint >= right || end <= start) continue;
                const previous = merged[key].at(-1);
                if (previous && previous.text.toLocaleLowerCase() === item.text.toLocaleLowerCase() && start < previous.end) continue;
                const shifted = { start, end, text: item.text };
                merged[key].push(shifted);
                if (key === 'segments' && !transcript.words.length) wordFallbacks.push(shifted);
            }
        }
        cutoff = right;
        merged.text += (merged.text ? '\n' : '') + transcript.text;
        merged.language ||= transcript.language;
        merged.warnings.push(...(transcript.warnings || []));
    }
    merged.words = cleanSegments(merged.words);
    merged.segments = cleanSegments(merged.segments);
    if (wordFallbacks.length && merged.words.length) merged.wordFallbacks = cleanSegments(wordFallbacks);
    merged.warnings = [...new Set(merged.warnings)];
    return merged;
}

// Where a speaker finishes a sentence or a clause, read from the provider's
// own punctuation. Abbreviations and initials do not end a sentence.
const SENTENCE_END = /[.!?…。！？]+["'”’»)\]」』）】〉》〕］｝]*$/u, CLAUSE_END = /[,;:，、；：]["'”’»)\]」』）】〉》〕］｝]*$/u;
const ABBREVIATION = /^(?:(?:mr|mrs|ms|dr|sr|sra|st|vs|etc|prof|jr|no)\.|(?:\p{L}\.)+)$/iu;

const ESTIMATED_TIMING = 'Word timestamps are unavailable for some text. Subtitle boundaries were estimated within the original segment to respect the word limit.';

function limitCue(item, limit, warnings) {
    if (textSize(item.text) <= limit) return [item];
    const parts = splitCueText(item.text, limit);
    if (parts.length < 2) return [item];
    // Original segment endpoints remain exact; only internal boundaries are
    // estimated. Never invent timestamps when a provider returned no timing.
    const start = Math.round(item.start * 1000), end = Math.round(item.end * 1000);
    if (end - start < parts.length) throw new Error('The word limit would create subtitles shorter than one millisecond. Increase Max words per subtitle.');
    if (!warnings.includes(ESTIMATED_TIMING)) warnings.push(ESTIMATED_TIMING);
    const weights = parts.map(textSize), total = weights.reduce((a,b) => a+b,0);
    let cursor = start, used = 0;
    return parts.map((text,index) => {
        used += weights[index];
        const next = index === parts.length - 1 ? end : Math.max(cursor + 1, Math.min(end - (parts.length - index - 1), start + Math.round((end-start)*used/total)));
        const cue = {start:cursor/1000,end:next/1000,text};
        cursor = next; return cue;
    });
}

export function formatTranscript(transcript, options, warnings = []) {
    let segments;
    if ((options.wordTimestamps || !transcript.segments.length) && transcript.words.length) {
        segments = []; let group = [], size = 0;
        const flush = () => {
            if (group.length) segments.push({ start: group[0].start, end: group.at(-1).end, text: joinTimedWords(group) });
            group = []; size = 0;
        };
        // Older cached records have no per-part fallback metadata. Recover
        // provider segments that have no overlapping words at all, without
        // replacing the rest of the cached word timings or making another call.
        let fallbacks = transcript.wordFallbacks;
        if (fallbacks === undefined) {
            const words = transcript.words;
            let cursor = 0;
            fallbacks = transcript.segments.filter(segment => {
                while (cursor < words.length && words[cursor].end <= segment.start) cursor++;
                return cursor === words.length || words[cursor].start >= segment.end;
            });
        }
        const timeline = [...transcript.words.flatMap(word => limitCue(word, options.wordsPerLine, warnings).map(part => ({ ...part, isWord: true }))),
            ...cleanSegments(fallbacks).flatMap(item => limitCue(item, options.wordsPerLine, warnings))].sort((a, b) => a.start - b.start || a.end - b.end);
        // 'speech' follows the speaker: a subtitle ends with the sentence, at a
        // comma once it is fairly full, or at a breath. The word limit stays a cap.
        const speech = options.cueBreaks !== 'words', limit = options.wordsPerLine;
        for (const [index, word] of timeline.entries()) {
            if (!word.isWord) { flush(); segments.push(word); continue; }
            const gap = group.length ? word.start - group.at(-1).end : 0;
            const weight = textSize(word.text);
            // Oversized provider phrases were split above; actual per-word
            // timestamps remain untouched.
            if (group.length && canBreakBetween(group.at(-1).text, word.text)
                && (size + weight > limit || gap > 1 || speech && gap >= .35 && size * 2 >= limit)) flush();
            group.push(word); size += weight;
            if (!speech) continue;
            const text = joinTimedWords(group), next = timeline[index + 1];
            if (next?.isWord && !canBreakBetween('', next.text)) continue;
            if (SENTENCE_END.test(text) ? !ABBREVIATION.test(word.text) : CLAUSE_END.test(text) && size >= limit * .6) flush();
        }
        flush();
    } else segments = transcript.segments.flatMap(item => limitCue(item, options.wordsPerLine, warnings));
    if (!segments.length) throw new Error('This model returned text without usable timestamps. Choose a timestamp-capable model.');
    return cleanSegments(segments).map((item, index, all) => ({ ...item,
        end: all[index + 1] ? Math.min(item.end, Math.max(item.start + .001, all[index + 1].start)) : item.end,
        text: wrapText(item.text, options.maxLineLength) }));
}

export function timestamp(seconds, vtt = false) {
    let ms = Math.round(seconds * 1000);
    const hours = Math.floor(ms / 3600000); ms %= 3600000;
    const minutes = Math.floor(ms / 60000); ms %= 60000;
    const secs = Math.floor(ms / 1000); ms %= 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${vtt ? '.' : ','}${String(ms).padStart(3, '0')}`;
}

// [videoId]___Title.srt: the ID stays machine-readable next to a readable title.
export function subtitleFilename(videoId, title = '', format = 'srt') {
    const name = String(title || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[ .]+$/, '');
    return `[${videoId}]${name ? '___' + name : ''}.${format === 'vtt' ? 'vtt' : 'srt'}`;
}

export function exportSubtitles(segments, format = 'srt') {
    const vtt = format === 'vtt';
    return (vtt ? 'WEBVTT\n\n' : '') + cleanSegments(segments).map((item, i) =>
        `${i + 1}\n${timestamp(item.start, vtt)} --> ${timestamp(item.end, vtt)}\n${item.text.replace(/-->/g, '→')}\n`).join('\n');
}

export function youtubeFormat(segments) {
    return { events: cleanSegments(segments).map(item => ({ tStartMs: Math.round(item.start * 1000), dDurationMs: Math.round((item.end - item.start) * 1000), segs: [{ utf8: item.text }] })) };
}
