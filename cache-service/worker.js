import { publicRecord } from '../cache/local.js';

async function boundedJson(request, maxBytes) {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const chunks = []; let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { await reader.cancel(); throw new Error('Body too large'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin'), allowed = (env.ALLOWED_ORIGINS || '').split(',');
        const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
        const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
        if (origin && !allowed.includes(origin)) return reply({ error: 'Origin denied' }, 403);
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET,PUT,OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        const match = new URL(request.url).pathname.match(/^\/subtitles\/([a-f0-9]{64})$/);
        if (!match) return reply({ error: 'Not found' }, 404);
        if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'Method denied' }, 405);
        const limiter = request.method === 'PUT' ? env.WRITE_LIMITER : env.READ_LIMITER;
        if (!limiter || !env.DB) return reply({ error: 'Cache service not configured' }, 503);
        const ip = request.headers.get('CF-Connecting-IP');
        if (!ip || !(await limiter.limit({ key: ip })).success) return reply({ error: 'Rate limited' }, 429);
        const key = match[1];
        if (request.method === 'GET') {
            const row = await env.DB.prepare('SELECT body, id FROM subtitles WHERE cache_key = ? AND approved = 1 ORDER BY id DESC LIMIT 1').bind(key).first();
            return row ? reply({ ...JSON.parse(row.body), revision: row.id }) : reply({ error: 'Not found' }, 404);
        }
        try {
            const input = await boundedJson(request, 2_000_000), record = publicRecord(input);
            if (record.key !== key || !record.transcript.words.length && !record.transcript.segments.length) throw new Error('Invalid subtitles');
            for (const field of ['sourceLanguage', 'targetLanguage', 'audioTrack', 'type', 'provider']) {
                if (typeof record.descriptor[field] !== 'string' || record.descriptor[field].length > 100) throw new Error('Invalid metadata');
            }
            // Unknown properties are rejected, rather than accepting a hidden credential field.
            if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(Object.keys(record).sort())) throw new Error('Unexpected fields');
            if (JSON.stringify(Object.keys(input.descriptor).sort()) !== JSON.stringify(Object.keys(record.descriptor).sort())) throw new Error('Unexpected fields');
            record.createdAt = new Date().toISOString(); record.revision = 1;
            const body = JSON.stringify(record);
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(record.transcript)))), b => b.toString(16).padStart(2, '0')).join('');
            await env.DB.prepare('INSERT OR IGNORE INTO subtitles(cache_key,digest,video_id,source_language,target_language,body) VALUES(?,?,?,?,?,?)')
                .bind(key, digest, record.descriptor.videoId, record.descriptor.sourceLanguage, record.descriptor.targetLanguage, body).run();
            return reply({ stored: true, moderation: 'pending' }, 202);
        } catch { return reply({ error: 'Invalid subtitle submission' }, 400); }
    },
};
