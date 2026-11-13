import { settingsStorage } from './storage.js';
import en from '../locales/en.js';
import ptBR from '../locales/pt-BR.js';
import es from '../locales/es.js';
import ja from '../locales/ja.js';
import zhCN from '../locales/zh-CN.js';

// Each dictionary maps a source string, exactly as written in the code or in
// popup.html, to its translation. A source with {0}, {1}… is a pattern whose
// slots carry the changing parts (and are translated themselves). Anything
// missing from a dictionary is shown as written, so a new string never breaks.
export const LANGUAGES = { en, 'pt-BR': ptBR, es, ja, 'zh-CN': zhCN };
let exact = null, patterns = [];

export function resolveLanguage(choice = 'auto', system = globalThis.navigator?.language || 'en') {
    if (Object.hasOwn(LANGUAGES, choice)) return choice;
    const base = String(system).toLowerCase().split('-')[0];
    return { pt: 'pt-BR', es: 'es', ja: 'ja', zh: 'zh-CN' }[base] || 'en';
}

export function setLanguage(choice, system) {
    const language = resolveLanguage(choice, system);
    exact = new Map(); patterns = [];
    for (const [source, target] of Object.entries(LANGUAGES[language])) {
        if (!/\{\d\}/.test(source)) { exact.set(source, target); continue; }
        const expression = source.split(/\{\d\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)');
        patterns.push({ expression: new RegExp(`^${expression}$`), slots: [...source.matchAll(/\{(\d)\}/g)].map(match => match[1]),
            target, weight: source.replace(/\{\d\}/g, '').length });
    }
    // The most specific pattern wins when several could match.
    patterns.sort((a, b) => b.weight - a.weight);
    return language;
}

export function tr(text) {
    if (!exact || typeof text !== 'string') return text;
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!core) return text;
    const known = exact.get(core);
    if (known !== undefined) return lead + known + trail;
    for (const { expression, slots, target } of patterns) {
        const match = expression.exec(core);
        if (!match) continue;
        const values = {};
        slots.forEach((slot, index) => { values[slot] = tr(match[index + 1]); });
        return lead + target.replace(/\{(\d)\}/g, (_, slot) => values[slot] ?? '') + trail;
    }
    return text;
}

export async function storedLanguage() {
    const stored = await settingsStorage.get(['settings', 'draftSetting:uiLanguage']);
    return stored['draftSetting:uiLanguage'] ?? stored.settings?.uiLanguage ?? 'auto';
}

const UNTRANSLATED = 'script, style, pre, code, textarea';
// A sentence with inline emphasis or a link is one unit: its markup is the key.
const sentence = element => element.children.length && element.matches('p, li, summary, strong, span, a')
    && !element.querySelector('[id], [data-setting], input, select, textarea, button, details');

export function localize(root, translate = tr) {
    if (root.matches?.(UNTRANSLATED)) return;
    for (const name of ['placeholder', 'title', 'aria-label']) {
        if (root.hasAttribute?.(name)) root.setAttribute(name, translate(root.getAttribute(name)));
    }
    if (sentence(root)) {
        const next = translate(root.innerHTML);
        if (next !== root.innerHTML) root.innerHTML = next;
        return;
    }
    for (const node of Array.from(root.childNodes)) {
        if (node.nodeType === 1) localize(node, translate);
        else if (node.nodeType === 3) {
            const next = translate(node.nodeValue);
            if (next !== node.nodeValue) node.nodeValue = next;
        }
    }
}

// Text written later by the popup's code is translated as it appears.
export function watch(root) {
    const text = node => {
        if (node.parentElement?.closest(UNTRANSLATED)) return;
        const next = tr(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
    };
    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'characterData') text(record.target);
            for (const node of record.addedNodes) {
                if (node.nodeType === 3) text(node);
                else if (node.nodeType === 1 && !node.closest(UNTRANSLATED)) localize(node);
            }
        }
    }).observe(root, { childList: true, subtree: true, characterData: true });
}
