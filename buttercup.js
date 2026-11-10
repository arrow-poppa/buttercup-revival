// Buttercup's BC player control and synchronized subtitle behavior, in the isolated world.
// No page scripts, Trusted Types policies, fetch hooks, XHR hooks, or credentials.
globalThis.ButtercupRenderer = class {
    constructor() { this.tracks = new WeakMap(); this.track = null; this.video = null; this.segments = []; this.owner = crypto.randomUUID(); }
    clear() {
        if (this.track && this.video?.dataset.buttercupRenderer === this.owner) {
            this.track.mode = 'hidden';
            for (const cue of Array.from(this.track.cues || [])) this.track.removeCue(cue);
            this.track.mode = 'disabled';
        }
        this.segments = []; this.video = null;
    }
    show(video, segments, language = this.language || 'und', visible = true) {
        this.language = language;
        this.clear(); this.video = video; this.segments = segments;
        video.dataset.buttercupRenderer = this.owner;
        let languages = this.tracks.get(video);
        if (!languages) { languages = new Map(); this.tracks.set(video, languages); }
        let track = languages.get(language);
        if (!track) {
            track = Array.from(video.textTracks).find(item => item.kind === 'subtitles' && item.label === 'Buttercup' && item.language === language)
                || video.addTextTrack('subtitles', 'Buttercup', language);
            languages.set(language, track);
        }
        this.track = track;
        track.mode = 'hidden';
        for (const cue of Array.from(track.cues || [])) track.removeCue(cue);
        for (const item of segments) {
            // WebVTT cue text is markup-aware; escape provider text to render it literally.
            const text = item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            track.addCue(new VTTCue(item.start, item.end, text));
        }
        track.mode = visible ? 'showing' : 'hidden';
    }
    toggle() {
        if (!this.track) return false;
        // Keep cues active/available to tools that read native subtitle tracks.
        // Hiding Buttercup is a visual choice, not removal of the subtitle source.
        this.track.mode = this.track.mode === 'showing' ? 'hidden' : 'showing';
        return this.track.mode === 'showing';
    }
};
