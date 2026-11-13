import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeChunks, formatTranscript, exportSubtitles, timestamp, cleanSegments, youtubeFormat } from '../subtitles/formats.js';
import { textSize } from '../subtitles/text.js';
import { DEFAULTS, validateSettings, baseUrl, redact } from '../api/config.js';

test('word grouping retains supplied timing and original Buttercup line breaks', () => {
    const transcript = normalize({ words: [{ word: 'Olá', start: .1, end: .4 }, { word: 'mundo', start: .5, end: .8 }, { word: 'hoje', start: 1, end: 2 }] });
    assert.deepEqual(formatTranscript(transcript, { ...DEFAULTS, wordsPerLine: 2, maxLineLength: 1 }), [
        { start: .1, end: .8, text: 'Olá\nmundo' }, { start: 1, end: 2, text: 'hoje' },
    ]);
});
test('segments are the fallback, never fabricated timestamps', () => {
    assert.deepEqual(formatTranscript(normalize({ segments: [{ start: 2, end: 4, text: 'real segment' }] }), DEFAULTS), [{ start: 2, end: 4, text: 'real segment' }]);
    assert.throws(() => formatTranscript(normalize({ text: 'no timing' }), DEFAULTS), /without usable timestamps/);
});
test('zero-duration word timings fall back to complete provider segments without losing text', () => {
    const transcript = normalize({ words: [{ word: 'Olá', start: .1, end: .1 }, { word: 'mundo', start: .6, end: 1 }],
        segments: [{ start: .1, end: 1, text: 'Olá mundo' }] });
    assert.deepEqual(transcript.words, []);
    assert.deepEqual(formatTranscript(transcript, DEFAULTS), [{ start: .1, end: 1, text: 'Olá mundo' }]);
    assert.match(transcript.warnings[0], /word timestamps.*segment timestamps/i);
    const merged = mergeChunks([{ offset: 10, duration: 4, transcript }]);
    assert.equal(merged.segments[0].start, 10.1);
    assert.deepEqual(merged.warnings, transcript.warnings);
});
test('invalid optional segments do not discard complete valid word timings', () => {
    const transcript = normalize({ words: [{ word: 'Olá', start: .1, end: .5 }, { word: 'mundo', start: .6, end: 1 }],
        segments: [{ start: 0, end: -1, text: 'bad segment' }] });
    assert.deepEqual(transcript.segments, []);
    assert.deepEqual(formatTranscript(transcript, DEFAULTS), [{ start: .1, end: 1, text: 'Olá mundo' }]);
    assert.match(transcript.warnings[0], /segment timestamps.*word timestamps/i);
});

test('mixed chunk word/segment timing preserves all speech, cached formatting and supplied offsets', () => {
    const first = normalize({ words: [{ start: 0, end: .5, word: 'first' }, { start: .5, end: 1, word: 'words' }] });
    const middle = normalize({ words: [{ start: 1, end: 1, word: 'invalid timing' }],
        segments: [{ start: 1, end: 3, text: 'complete fallback phrase' }] });
    const last = normalize({ words: [{ start: 2, end: 3, word: 'last' }] });
    const merged = mergeChunks([{ offset: 0, duration: 120, transcript: first },
        { offset: 118.5, duration: 120, transcript: middle }, { offset: 237, duration: 10, transcript: last }]);
    const cues = formatTranscript(merged, { ...DEFAULTS, wordsPerLine: 1 });
    assert.deepEqual(cues, [{ start: 0, end: .5, text: 'first' }, { start: .5, end: 1, text: 'words' },
        { start: 119.5, end: 120.167, text: 'complete' }, { start: 120.167, end: 120.833, text: 'fallback' }, { start: 120.833, end: 121.5, text: 'phrase' }, { start: 239, end: 240, text: 'last' }]);
    assert.deepEqual(formatTranscript(merged, { ...DEFAULTS, wordTimestamps: false, wordsPerLine: 1 }).map(item => item.text), cues.map(item => item.text));
    const legacy = structuredClone(merged); delete legacy.wordFallbacks;
    assert.deepEqual(formatTranscript(legacy, { ...DEFAULTS, wordsPerLine: 1 }), cues, 'Older cached fallback segments must also be recovered');
    assert.equal(formatTranscript(merged, { ...DEFAULTS, wordsPerLine: 2 })[0].text, 'first words');
});

test('fallback phrases between adjacent words are not swallowed by a word group', () => {
    const transcript = { words: [{ start: 0, end: 1, text: 'before' }, { start: 2, end: 3, text: 'after' }],
        segments: [{ start: 1, end: 2, text: 'segment between' }] };
    assert.deepEqual(formatTranscript(transcript, DEFAULTS), [
        { start: 0, end: 1, text: 'before' }, { start: 1, end: 2, text: 'segment between' }, { start: 2, end: 3, text: 'after' }]);
});

test('captions do not begin halfway through a video when early DeepInfra chunks fall back to segments', () => {
    const fallback = text => normalize({ words: [{ start: 0, end: 0, text }],
        segments: [{ start: .2, end: 2, text }] });
    const merged = mergeChunks([
        { offset: 0, duration: 120, transcript: fallback('opening speech') },
        { offset: 118.5, duration: 120, transcript: fallback('second part speech') },
        { offset: 237, duration: 120, transcript: normalize({ words: [{ start: 1, end: 2, text: 'third' }] }) },
        { offset: 355.5, duration: 120, transcript: normalize({ words: [{ start: 1, end: 2, text: 'fourth' }] }) },
        { offset: 474, duration: 35.321, transcript: normalize({ words: [{ start: 1, end: 2, text: 'ending' }] }) },
    ]);
    // Prior word-only formatting started at 238 s, dropping the first 4 min.
    assert.equal(merged.words[0].start, 238);
    for (const record of [merged, (() => { const old = structuredClone(merged); delete old.wordFallbacks; return old; })()]) {
        const cues = formatTranscript(record, DEFAULTS);
        assert.equal(cues[0].start, .2);
        assert.deepEqual(cues.map(cue => cue.text), ['opening speech', 'second part speech', 'third', 'fourth', 'ending']);
        assert.match(exportSubtitles(cues), /00:00:00,200 --> 00:00:02,000\nopening speech/);
    }
});
test('invalid timings without a valid alternative name the source and entry; no speech or timing is invented', () => {
    assert.throws(() => normalize({ words: [{ start: 0, end: 1, word: 'valid' }, { start: 1, end: 1, word: 'untimed speech' }] }), /words.*entry 2.*end.*greater.*start/i);
    assert.throws(() => normalize({ segments: [{ start: 2, end: 1, text: 'reverse' }] }), /segments.*entry 1.*end.*greater.*start/i);
    assert.throws(() => normalize({ segments: [{ start: 0, end: 999999, text: 'SECRET_TRANSCRIPT' }] }), error => /segments.*entry 1/i.test(error.message) && !error.message.includes('SECRET_TRANSCRIPT'));
    assert.throws(() => normalize({ words: 'bad', segments: [] }), /words.*array/i);
    assert.throws(() => cleanSegments([{ start: -.00001, end: 1, text: 'negative before rounding' }]), /negative/i);
});
test('chunk offsets and overlap ownership deduplicate boundary words', () => {
    const parts = [{ offset: 0, duration: 10, transcript: normalize({ words: [
        { start: 0, end: 1, word: 'start' }, { start: 8.4, end: 8.8, word: 'boundary' }, { start: 9.5, end: 9.9, word: 'next' },
    ] }) }, { offset: 8.5, duration: 10, transcript: normalize({ words: [
        { start: 0, end: .3, word: 'boundary' }, { start: 1, end: 1.4, word: 'next' }, { start: 2, end: 3, word: 'end' },
    ] }) }];
    const result = mergeChunks(parts);
    assert.deepEqual(result.words.map(item => item.text), ['start', 'boundary', 'next', 'end']);
    assert.equal(result.words.at(-1).start, 10.5);
});
test('SRT and VTT timestamps round milliseconds across minute boundaries', () => {
    assert.equal(timestamp(59.9996), '00:01:00,000');
    assert.equal(timestamp(3600.01, true), '01:00:00.010');
    const cues = [{ start: .001, end: 1.025, text: 'ação 日本語' }];
    assert.match(exportSubtitles(cues), /00:00:00,001 --> 00:00:01,025\nação 日本語/);
    assert.match(exportSubtitles(cues, 'vtt'), /^WEBVTT\n\n1\n00:00:00\.001/);
    assert.equal(youtubeFormat(cues).events[0].dDurationMs, 1024);
});
test('reject invalid durations and remove exact duplicate cues', () => {
    assert.throws(() => cleanSegments([{ start: 2, end: 1, text: 'bad' }]));
    assert.throws(() => cleanSegments([{ start: NaN, end: 1, text: 'bad' }]));
    assert.throws(() => cleanSegments([{ start: null, end: 1, text: 'missing timestamp' }]));
    assert.throws(() => cleanSegments([{ start: .0001, end: .0002, text: 'no millisecond duration' }]));
    const cue = { start: 0, end: 1, text: 'same' };
    assert.equal(cleanSegments([cue, cue]).length, 1);
});
test('local services require literal loopback and configured headers cannot replace credentials', () => {
    for (const url of ['http://0.0.0.0:8767', 'http://localhost:8767', 'https://127.0.0.1', 'http://127.0.0.1/secret']) assert.throws(() => baseUrl(url, true));
    assert.throws(() => validateSettings({ ...DEFAULTS, extraHeaders: { Authorization: 'bad' } }));
    assert.throws(() => validateSettings({ ...DEFAULTS, extraHeaders: { 'X-Org': 'bad\r\nvalue' } }));
    assert.throws(() => validateSettings({ ...DEFAULTS, translate: true }));
    assert.equal(redact('token SECRET', { apiKey: 'SECRET' }), 'token [redacted]');
});

test('subtitle file names keep the video ID and a Windows-safe title', async () => {
    const { subtitleFilename } = await import('../subtitles/formats.js');
    assert.equal(subtitleFilename('abcdefghijk', ' What? A "test": part 1/2 <日本語>... ', 'srt'), '[abcdefghijk]___What A test part 1 2 日本語.srt');
    assert.equal(subtitleFilename('abcdefghijk', '', 'vtt'), '[abcdefghijk].vtt');
    assert.equal(subtitleFilename('abcdefghijk', 'x'.repeat(300)).length, '[abcdefghijk]___.srt'.length + 120);
    const { validateSettings } = await import('../api/config.js');
    assert.equal(validateSettings({ saveFolder: ' G:\\Meu Drive\\Subtitles ' }).saveFolder, 'G:\\Meu Drive\\Subtitles');
    assert.throws(() => validateSettings({ saveFolder: 'Subtitles' }), /full path/);
});

test('a few words without an end time keep every word timing instead of falling back to long segments', () => {
    const words = Array.from({ length: 30 }, (_, index) => ({ start: index, end: index + .4, word: `w${index}` }));
    words[9].end = words[9].start; words[19].end = null; delete words[29].end;
    const transcript = normalize({ words, segments: [{ start: 0, end: 30, text: words.map(word => word.word).join(' ') }] });
    assert.deepEqual(transcript.warnings, []);
    assert.equal(transcript.words.length, 30);
    assert.deepEqual([9, 19, 29].map(index => transcript.words[index]), [{ start: 9, end: 9.5, text: 'w9' }, { start: 19, end: 19.5, text: 'w19' }, { start: 29, end: 29.2, text: 'w29' }]);
    const cues = formatTranscript(transcript, { ...DEFAULTS, cueBreaks: 'words', wordsPerLine: 10, maxLineLength: 0 });
    assert.deepEqual(cues.map(cue => cue.text.split(' ').length), [10, 10, 10]);
    // Wrong, or mostly missing, word timings are still refused in favour of segments.
    assert.match(normalize({ words: [{ start: -1, end: 1, word: 'bad' }], segments: [{ start: 0, end: 1, text: 'bad' }] }).warnings[0], /Invalid word timestamps/);
    assert.match(normalize({ words: words.map(word => ({ ...word, end: word.start })), segments: [{ start: 0, end: 30, text: 'all' }] }).warnings[0], /Invalid word timestamps/);
});

test('subtitles follow the speaker: sentence ends, full clauses and breaths start a new cue under the word cap', () => {
    const spoken = (text, gaps = {}) => {
        let time = 0;
        return text.split(' ').map((word, index) => {
            time += gaps[index] ?? .05;
            const item = { start: Math.round(time * 100) / 100, end: Math.round((time + .3) * 100) / 100, text: word };
            time += .3; return item;
        });
    };
    const words = spoken('Hello there. Dr. Silva arrived at 5 p.m. today, and after a long day at the office, she went home quickly because it was late. Really? Yes!');
    const transcript = { words, segments: [], wordFallbacks: [] };
    const texts = options => formatTranscript(transcript, { ...DEFAULTS, maxLineLength: 0, wordsPerLine: 10, ...options }).map(cue => cue.text);
    assert.deepEqual(texts(), ['Hello there.', 'Dr. Silva arrived at 5 p.m. today,', 'and after a long day at the office,', 'she went home quickly because it was late.', 'Really?', 'Yes!']);
    assert.deepEqual(texts({ cueBreaks: 'words' }), ['Hello there. Dr. Silva arrived at 5 p.m. today, and', 'after a long day at the office, she went home', 'quickly because it was late. Really? Yes!']);
    // A breath splits a subtitle that is at least half full; a shorter one keeps going.
    const breath = { words: spoken('one two three four five six seven eight', { 2: .4, 6: .4 }), segments: [], wordFallbacks: [] };
    assert.deepEqual(formatTranscript(breath, { ...DEFAULTS, maxLineLength: 0, wordsPerLine: 8 }).map(cue => cue.text), ['one two three four five six', 'seven eight']);
    // Every cue starts and ends with its own first and last spoken word.
    const cues = formatTranscript(transcript, { ...DEFAULTS, maxLineLength: 0, wordsPerLine: 10 });
    assert.deepEqual([cues[0].start, cues[0].end, cues[1].start], [words[0].start, words[1].end, words[2].start]);
    assert.throws(() => validateSettings({ cueBreaks: 'other' }), /break mode/);
});

const timedText = (parts, language = '') => normalize({ language, words: parts.map((text, index) => ({ text, start: index * .2, end: index * .2 + .15 })) });

test('Japanese timed words join without artificial spaces and count characters, not provider tokens', () => {
    const transcript = timedText(['今日', 'は', '日本語', 'を', '勉強', 'します。'], 'ja');
    const cues = formatTranscript(transcript, { ...DEFAULTS, wordsPerLine: 6, maxLineLength: 0 });
    assert.deepEqual(cues.map(cue => cue.text), ['今日は日本語', 'を勉強します。']);
    assert.deepEqual(cues.map(({ start, end }) => [start, end]), [[0, .55], [.6, 1.15]]);
});

test('simplified and traditional Chinese respect sentence punctuation and closing quotes', () => {
    for (const [parts, expected] of [
        [['你', '好，', '世界。', '再见！'], ['你好，世界。', '再见！']],
        [['他說', '「你好。', '」', '再見！'], ['他說「你好。」', '再見！']],
    ]) {
        const cues = formatTranscript(timedText(parts), { ...DEFAULTS, wordsPerLine: 12, maxLineLength: 0 });
        assert.deepEqual(cues.map(cue => cue.text), expected);
    }
});

test('unpunctuated Chinese still splits at character limits and provider timing gaps', () => {
    const transcript = timedText(['今天', '天气', '很好', '我们', '出去', '走走']);
    transcript.words[4].start = 3; transcript.words[4].end = 3.15;
    transcript.words[5].start = 3.2; transcript.words[5].end = 3.35;
    const cues = formatTranscript(transcript, { ...DEFAULTS, wordsPerLine: 6, maxLineLength: 0 });
    assert.deepEqual(cues.map(cue => cue.text), ['今天天气很好', '我们', '出去走走']);
    assert.equal(cues[2].start, 3);
});

test('Japanese and Chinese segment-only results wrap without inventing times or splitting Unicode graphemes', () => {
    for (const [text, expected] of [
        ['今日は日本語を勉強します。', '今日は日本語\nを勉強します。'],
        ['你好世界今天学习中文。', '你好世界今天\n学习中文。'],
        ['你好「世界」。', '你好「世界」。'],
    ]) {
        const cues = formatTranscript(normalize({ segments: [{ start: 2, end: 8, text }] }), { ...DEFAULTS, maxLineLength: 6 });
        assert.deepEqual(cues, [{ start: 2, end: 8, text: expected }]);
    }
    const text = 'か\u3099👩‍💻日本語';
    const cues = formatTranscript(normalize({ segments: [{ start: 0, end: 2, text }] }), { ...DEFAULTS, maxLineLength: 2 });
    assert.equal(cues[0].text, 'か\u3099👩‍💻\n日本\n語');
});

test('CJK wrapping keeps brackets with their content and punctuation off the start of a line', () => {
    const transcript = normalize({ segments: [{ start: 0, end: 5, text: '你好「世界」，再见。' }] });
    const cues = formatTranscript(transcript, { ...DEFAULTS, maxLineLength: 2 });
    assert.equal(cues[0].text, '你好\n「世界」，\n再见。');
    assert.equal(formatTranscript(transcript, { ...DEFAULTS, maxLineLength: 0 })[0].text, '你好「世界」，再见。');
});

test('mixed CJK and Latin text preserves Latin words, numbers and their spaces', () => {
    const transcript = timedText(['使用', 'OpenAI', 'speech', '2026', '模型。']);
    const cues = formatTranscript(transcript, { ...DEFAULTS, wordsPerLine: 40, maxLineLength: 4 });
    assert.equal(cues[0].text, '使用OpenAI speech\n2026模型。');
});

test('Thai combining marks stay attached and timed tokens do not gain spaces', () => {
    const cues = formatTranscript(timedText(['สวัสดี', 'ครับ']), { ...DEFAULTS, wordsPerLine: 40, maxLineLength: 0 });
    assert.equal(cues[0].text, 'สวัสดีครับ');
});

test('English, Portuguese and Korean retain space-based subtitle formatting', () => {
    for (const [parts, expected] of [
        [['Hello', 'world', 'today.'], 'Hello world\ntoday.'],
        [['Olá', 'mundo', 'hoje.'], 'Olá mundo\nhoje.'],
        [['오늘', '한국어를', '공부합니다.'], '오늘 한국어를\n공부합니다.'],
    ]) {
        const cues = formatTranscript(timedText(parts), { ...DEFAULTS, maxLineLength: 2 });
        assert.equal(cues[0].text, expected);
    }
});

test('a long CJK provider phrase respects the cue limit with estimated internal times', () => {
    const cues = formatTranscript(timedText(['今天我们一起学习中文。']), { ...DEFAULTS, wordsPerLine: 2, maxLineLength: 4 });
    assert.deepEqual(cues, ['今天','我们','一起','学习','中文。'].map((text,index)=>({start:index*.03,end:Math.round((index+1)*30)/1000,text})));
});


test('mixed text keeps contractions, hyphenated words, decimals and combining marks intact', () => {
    const transcript = normalize({ segments: [{ start: 0, end: 5, text: "日本語OpenAI-compatible don't 1,234.56字幕" }] });
    assert.equal(formatTranscript(transcript, { ...DEFAULTS, maxLineLength: 3 })[0].text,
        "日本語\nOpenAI-compatible don't 1,234.56\n字幕");
    const decomposed = formatTranscript(timedText(['か\u3099', 'OpenAI', 'です。']), { ...DEFAULTS, maxLineLength: 0 });
    assert.equal(decomposed[0].text, 'か\u3099OpenAIです。');
});


test('Japanese opening brackets do not add spaces before Latin words', () => {
    const cues = formatTranscript(timedText(['「', 'OpenAI', 'です。', '」']), { ...DEFAULTS, maxLineLength: 0 });
    assert.equal(cues[0].text, '「OpenAIです。」');
});

test('segment fallback honors the cue cap in word and speech modes without changing endpoints', () => {
    const transcript = normalize({ words:[{start:2,end:2,word:'broken'}], segments:[{start:2,end:8,text:'one two three four five six seven'}] });
    for (const cueBreaks of ['speech','words']) for (const wordTimestamps of [true,false]) {
        const warnings=[];
        const cues=formatTranscript(transcript,{...DEFAULTS,wordsPerLine:3,maxLineLength:0,cueBreaks,wordTimestamps},warnings);
        assert.deepEqual(cues.map(c=>c.text),['one two three','four five six','seven']);
        assert.equal(cues[0].start,2);assert.equal(cues.at(-1).end,8);
        assert.ok(cues.every((c,i)=>c.end>c.start&&(!i||c.start===cues[i-1].end)));
        assert.match(warnings[0],/estimated/);
        assert.equal(transcript.segments[0].text,'one two three four five six seven');
    }
});

test('fallback limits preserve Japanese, Chinese, mixed Latin words, brackets and graphemes', () => {
    for (const text of ['今日は「日本語」を勉強します。','你好「世界」，今天学习中文。',"日本語OpenAI-compatible don't 1,234.56字幕",'か\u3099日本語👩‍💻字幕']) {
        const original=normalize({segments:[{start:1,end:20,text}]});
        const cues=formatTranscript(original,{...DEFAULTS,wordsPerLine:3,maxLineLength:0});
        assert.equal(cues.map(c=>c.text).join('').replace(/\s/g,''),text.replace(/\s/g,''));
        assert.ok(cues.every(c=>textSize(c.text)<=3&&!/[「（]$/.test(c.text)&&! /^[」，。]/.test(c.text)));
        assert.equal(cues[0].start,1);assert.equal(cues.at(-1).end,20);
    }
});

test('very short fallback timings fail explicitly rather than dropping text', () => {
    assert.throws(()=>formatTranscript(normalize({segments:[{start:0,end:.002,text:'one two three'}]}),{...DEFAULTS,wordsPerLine:1}),/shorter than one millisecond/);
});

test('provider layout preserves original segments and overlaps regardless of word cap', () => {
    const transcript=normalize({segments:[{start:1,end:8,text:'one two three four five'},{start:7,end:10,text:'second segment'}],words:[{start:1,end:2,word:'one'}]});
    const warnings=[];
    const settings=validateSettings({...DEFAULTS,cueBreaks:'provider',wordsPerLine:1,maxLineLength:0});
    assert.deepEqual(formatTranscript(transcript,settings,warnings),transcript.segments);
    assert.deepEqual(warnings,[]);
    assert.equal(formatTranscript(transcript,{...settings,maxLineLength:2})[0].text,'one two\nthree four\nfive');
    assert.deepEqual(formatTranscript({...transcript,segments:[]},settings),transcript.words);
    assert.throws(()=>formatTranscript({segments:[],words:[]},settings),/without usable timestamps/);
});
