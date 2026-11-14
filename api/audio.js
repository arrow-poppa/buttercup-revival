// MIME types come from the assistant or the user's sample file.
export function audioExtension(audio) {
    return ({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
        'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm' })[audio.type.toLowerCase().split(';')[0].trim()] || 'mp3';
}
