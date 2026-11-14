import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, resolveLanguage, setLanguage, tr } from '../api/i18n.js';
import { DEFAULTS, validateSettings } from '../api/config.js';
import { formDraft, draftSettings, exportDraft, importDraft } from '../api/settings.js';

test('language follows the explicit choice, then the browser language, then English', () => {
    assert.equal(resolveLanguage('es', 'pt-BR'), 'es');
    assert.equal(resolveLanguage('auto', 'pt-PT'), 'pt-BR');
    assert.equal(resolveLanguage('auto', 'es-419'), 'es');
    assert.equal(resolveLanguage('auto', 'ja-JP'), 'ja');
    for (const language of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN', 'zh_Hant_HK']) {
        assert.equal(resolveLanguage('auto', language), 'zh-TW', language);
    }
    for (const language of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW', 'zh-Hans-HK']) {
        assert.equal(resolveLanguage('auto', language), 'zh-CN', language);
    }
    assert.equal(resolveLanguage('zh-TW', 'zh-CN'), 'zh-TW');
    assert.equal(resolveLanguage('zh-CN', 'zh-TW'), 'zh-CN');
    assert.equal(resolveLanguage('auto', 'invalid--locale'), 'en');
    assert.equal(resolveLanguage('auto', 'de-DE'), 'en');
    assert.equal(resolveLanguage('unknown', 'fr'), 'en');
});

test('messages are translated whole, by pattern with nested parts, or left as written', () => {
    setLanguage('pt-BR');
    assert.equal(tr('Settings saved.'), 'Configurações salvas.');
    assert.equal(tr('  Settings saved.\n'), '  Configurações salvas.\n');
    assert.equal(tr('Transcribing part 2/5 (120–240s, 0.96 MB)…'), 'Transcrevendo a parte 2/5 (120–240s, 0.96 MB)…');
    assert.equal(tr('Subtitles ready (cache).'), 'Legendas prontas (cache).');
    assert.equal(tr('Draft saved. Set your OpenRouter API key first.'), 'Rascunho salvo. Informe primeiro sua chave de API do OpenRouter.');
    assert.equal(tr('Backend HTTP 400: Import cookies first'), 'Backend HTTP 400: Importe os cookies primeiro');
    assert.equal(tr('Imported 2026-11-10 · enabled · session only · possibly expired / invalid'),
        'Importado em 2026-11-10 · ativado · somente nesta sessão · possivelmente expirado / inválido');
    assert.equal(tr('DeepInfra HTTP 429: provider detail'), 'DeepInfra HTTP 429: provider detail');
    assert.equal(tr('Reload extension'), 'Recarregar extensão');
    setLanguage('en');
    assert.equal(tr('Reload extension'), 'Reload extension');
    assert.equal(tr('asbplayer address is invalid. Enter a full address, such as http://127.0.0.1:8767.'),
        'asbplayer address is invalid. Enter a full address, such as http://127.0.0.1:8767.');
    assert.equal(tr('Settings saved.'), 'Settings saved.');
    setLanguage('es');
    assert.equal(tr('Connect'), 'Conectar');
    assert.equal(tr('Starting…'), 'Iniciando…');
    assert.equal(tr('Subtitles ready (transcription).'), 'Subtítulos listos (transcripción).');
    assert.equal(tr('Reload extension'), 'Recargar extensión');
    setLanguage('ja');
    assert.equal(tr('Reload extension'), '拡張機能を再読み込み');
    assert.equal(tr('Transcribing part 2/5 (120–240s)…'), '分割 2/5 を文字起こし中 (120–240s)…');
    assert.equal(tr('asbplayer address is invalid. Enter a full address, such as http://127.0.0.1:8766.'),
        'asbplayer のアドレスが正しくありません。http://127.0.0.1:8766 のような完全なアドレスを入力してください。');
    setLanguage('zh-CN');
    assert.equal(tr('Settings saved.'), '设置已保存。');
    assert.equal(tr('Subtitles ready (cache).'), '字幕已就绪（缓存）。');
    setLanguage('zh-TW');
    assert.equal(tr('Settings saved.'), '設定已儲存。');
    assert.equal(tr('Local assistant'), '本機助手');
    assert.equal(tr('Not assigned'), '未指派');
    assert.equal(tr('Subtitles ready (cache).'), '字幕已就緒（快取）。');
    setLanguage('en');
});

test('every translation keeps the slots and the markup of its source', () => {
    const shape = text => [(text.match(/\{\d\}/g) || []).sort().join(), (text.match(/<\/?[a-z]+/g) || []).sort().join()].join('|');
    for (const [language, dictionary] of Object.entries(LANGUAGES)) {
        for (const [source, target] of Object.entries(dictionary)) {
            assert.equal(typeof target, 'string');
            assert.equal(shape(target), shape(source), `${language}: ${source}`);
        }
    }
    // Every translated source key is English; English itself needs no dictionary.
    for (const source of [...Object.keys(LANGUAGES.en), ...Object.keys(LANGUAGES['pt-BR']), ...Object.keys(LANGUAGES.es)]) {
        for (const language of ['ja', 'zh-CN', 'zh-TW']) assert.ok(Object.hasOwn(LANGUAGES[language], source), `${language} is missing: ${source}`);
        assert.ok(Object.hasOwn(LANGUAGES.es, source), `es is missing: ${source}`);
    }
});

test('recent popup controls and status messages have translations in every supported locale', () => {
    const messages = ['Appearance', 'Auto (system)', 'Light', 'Dark', 'Keyboard shortcuts', 'Configure shortcuts', 'Not assigned',
        'Regenerate subtitles', 'Starting a fresh transcription…', 'Connect without native messaging', 'Copy origin',
        'Open connection editor', 'Private connection file', 'Import connection', 'Keep provider segments (original timing)',
        'Word timestamps are unavailable for some text. Subtitle boundaries were estimated within the original segment to respect the word limit.'];
    for (const language of ['pt-BR', 'es', 'ja', 'zh-CN', 'zh-TW']) {
        setLanguage(language);
        for (const message of messages) {
            assert.ok(Object.hasOwn(LANGUAGES[language], message), `${language}: ${message}`);
            assert.notEqual(tr(message), message, `${language}: ${message}`);
        }
        assert.equal(tr('Subtitles ready (cache).'), LANGUAGES[language]['Subtitles ready ({0}).'].replace('{0}', tr('cache')));
    }
    setLanguage('en');
});

test('Traditional Chinese has a complete catalog and persists through settings backups', () => {
    assert.deepEqual(Object.keys(LANGUAGES['zh-TW']).sort(), Object.keys(LANGUAGES['zh-CN']).sort());
    const settings = validateSettings({ ...DEFAULTS, uiLanguage: 'zh-TW' });
    const backup = exportDraft(formDraft(settings), 'test');
    const restored = draftSettings({ ...formDraft(DEFAULTS), ...importDraft(JSON.parse(JSON.stringify(backup))) });
    assert.equal(restored.uiLanguage, 'zh-TW');
});
