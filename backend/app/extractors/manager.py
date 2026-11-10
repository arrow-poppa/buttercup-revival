from dataclasses import dataclass


@dataclass
class ExtractionError(Exception):
    code: str
    message: str
    recoverable: bool = False

    def __str__(self):
        return self.message


def classify_error(error: Exception) -> ExtractionError:
    text = str(error).lower()
    # Only fixed messages leave the process. Upstream errors can contain cookies/URLs.
    if any(x in text for x in ("sign in", "login", "cookies", "authentication", "age-restricted", "private video")):
        return ExtractionError("authentication", "YouTube authentication failed. Import fresh authorized cookies.")
    if "429" in text or "too many requests" in text:
        return ExtractionError("rate_limited", "YouTube rate limit reached. Wait before retrying.")
    if any(x in text for x in ("not available in your country", "geo", "region")):
        return ExtractionError("region", "This video is unavailable in your region.")
    if any(x in text for x in ("unavailable", "removed", "copyright", "not found")):
        return ExtractionError("unavailable", "This YouTube video is unavailable.")
    if any(x in text for x in ("403", "forbidden")):
        return ExtractionError("forbidden", "YouTube rejected extraction (403). Check cookies and JS runtime.", True)
    if any(x in text for x in ("challenge", "integrity", "signature", "format", "timed out", "connection", "network", "extract")):
        return ExtractionError("extraction", "Extractor could not retrieve audio. Check runtime and network.", True)
    return ExtractionError("extraction", "Audio extraction failed. Update the extractor and retry.", True)


class ExtractionManager:
    def __init__(self, primary, fallback):
        self.primary = primary
        self.fallback = fallback
        self.attempts = []

    def extract(self, video, directory, cookiefile, limits, progress):
        for index, extractor in enumerate((self.primary, self.fallback)):
            try:
                progress({"stage": "extracting", "extractor": extractor.name})
                result = extractor.extract(video, directory, cookiefile, limits, progress)
                return {**result, "extractor": extractor.name, "attempts": self.attempts}
            except ExtractionError as error:
                self.attempts.append({"extractor": extractor.name, "code": error.code, "message": error.message})
                if index or not error.recoverable or cookiefile:
                    # pytubefix has no supported Netscape cookiefile input; do not downgrade authentication.
                    raise
                progress({"stage": "fallback", "attempts": self.attempts})
        raise RuntimeError("No extractor configured")
