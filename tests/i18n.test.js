import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, resolveLanguage, setLanguage, tr } from '../api/i18n.js';

test('language follows the explicit choice, then the browser language, then English', () => {
    assert.equal(resolveLanguage('es', 'pt-BR'), 'es');
    assert.equal(resolveLanguage('auto', 'pt-PT'), 'pt-BR');
    assert.equal(resolveLanguage('auto', 'es-419'), 'es');
    assert.equal(resolveLanguage('auto', 'ja-JP'), 'ja');
    assert.equal(resolveLanguage('auto', 'zh-TW'), 'zh-CN');
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
        for (const language of ['ja', 'zh-CN']) assert.ok(Object.hasOwn(LANGUAGES[language], source), `${language} is missing: ${source}`);
        assert.ok(Object.hasOwn(LANGUAGES.es, source), `es is missing: ${source}`);
    }
});
