package com.twolaugh.ex3cuusion.core.domain

// Time at capture (live dogfooding, 2026-06-12): the capture field IS the time picker
// (ELEGANCE OVER CHROME — no new pickers, no new buttons). A TRAILING, clearly-delimited
// time token in the typed title pins the task deterministically, before (and regardless of)
// any AI enrichment. Pure string work — no model, no clock reads; the caller passes the
// engine's currentTime so ambiguity resolution is reproducible in tests.
//
// THE GRAMMAR (conservative by design — a missed token is a plain capture, a false positive
// renames the user's task, so every ambiguous shape is rejected):
//
//   token      :=  [prefix] hour [sep minutes] [meridiem]      anchored at the END of the text,
//                                                              preceded by whitespace (or the
//                                                              token is the whole string)
//   prefix     :=  "at " | "@"
//   sep        :=  ":" | "."
//   meridiem   :=  "am" | "pm"      (optional space before it: "6 pm")
//
// Accepted forms and how they resolve:
//   "6pm" / "6.30pm" / "6:30pm" / "at 6pm" / "@6pm"  -> EXPLICIT 12h (hour 1..12 required);
//                                                       pm = h%12+12, am = h%12
//   "18:00" / "at 18:00" / "at 18" / "at 18.00"      -> EXPLICIT 24h (hour 13..23, or 0)
//   "06:30" (leading-zero two-digit hour)            -> EXPLICIT 24h (the leading zero is a
//                                                       24h spelling; "06" means 06:00)
//   "at 6" / "@6" / "at 6.30" / "6:30"               -> AMBIGUOUS 12h hour (1..12, no
//                                                       meridiem): NEAREST-FUTURE rule below
//
// Rejected (NOT a time token — title passes through unchanged):
//   - a bare trailing number without "at"/"@" and without ":"/meridiem ("Buy 6 eggs")
//   - a bare dot pair without "at"/"@" or meridiem ("Version 6.30" stays a version)
//   - hour > 23, minutes > 59, 12h-hour 0 with a meridiem ("0pm")
//   - a token anywhere but the end ("Look at 6 things" is untouched)
//
// NEAREST-FUTURE rule (deterministic, no heuristics about "plausible evenings"): for an
// ambiguous 12h hour, take the am and pm readings as clock minutes and pick the first one
// strictly after currentTime — am if it is still ahead, else pm; if BOTH have passed, the
// nearest future reading is tomorrow morning, so am wins. Explicit tokens never consult
// currentTime.
//
// Title tidying: the token (and its delimiting whitespace) is cut, trailing connective
// punctuation ("Dentist," / "Dentist —") is trimmed, whitespace collapsed at the ends. A
// capture that was ONLY a time token keeps the raw text as its title and parses no time —
// the title must never end up empty.

data class ParsedCapture(val title: String, val time: String?)

private val TIME_TOKEN = Regex(
    """(?:^|\s)(at\s+|@)?(\d{1,2})(?:([:.])(\d{2}))?(?:\s?([ap]m))?\s*$""",
    RegexOption.IGNORE_CASE
)

// Trailing connective punctuation left behind when the token is cut ("Dentist," "call mum -").
private val TRAILING_PUNCTUATION = Regex("""[\s,;:·—–-]+$""")

fun parseCaptureTime(raw: String, currentTime: String): ParsedCapture {
    val text = raw.trim()
    val fallback = ParsedCapture(text, null)
    val match = TIME_TOKEN.find(text) ?: return fallback

    val (prefixRaw, hourRaw, sepRaw, minutesRaw, meridiemRaw) = match.destructured
    val hasPrefix = prefixRaw.isNotEmpty()
    val meridiem = meridiemRaw.lowercase()
    val hour = hourRaw.toIntOrNull() ?: return fallback
    val minutes = if (minutesRaw.isEmpty()) 0 else minutesRaw.toIntOrNull() ?: return fallback
    if (minutes > 59) return fallback

    val resolved: String? = when {
        // Explicit 12h: a meridiem names the half-day; the hour must be a real 12h hour.
        meridiem.isNotEmpty() -> {
            if (hour !in 1..12) null
            else format(if (meridiem == "pm") hour % 12 + 12 else hour % 12, minutes)
        }
        // Explicit 24h spellings: hour 13..23 or 0, or a leading-zero two-digit hour ("06:30").
        hour > 23 -> null
        hour > 12 || hour == 0 || (hourRaw.length == 2 && hourRaw[0] == '0') -> {
            // a bare "18"-style number still needs the "at"/"@" delimiter or a ":"-separated
            // minute pair to count as a time at all
            if (hasPrefix || sepRaw == ":") format(hour, minutes) else null
        }
        // Ambiguous 12h hour (1..12, no meridiem): needs a clear delimiter — "at"/"@", or a
        // colon-separated minute pair; a bare number or bare dot pair is not a time.
        hasPrefix || sepRaw == ":" -> {
            val am = (hour % 12) * 60 + minutes
            val pm = (hour % 12 + 12) * 60 + minutes
            val now = timeToMinutes(currentTime)
            val pick = if (am > now) am else if (pm > now) pm else am // both passed -> tomorrow's am
            format(pick / 60, pick % 60)
        }
        else -> null
    } ?: return fallback

    val title = text.removeRange(match.range)
        .replace(TRAILING_PUNCTUATION, "")
        .trim()
    if (title.isEmpty()) return fallback // a time-only capture keeps its raw text, no pin
    return ParsedCapture(title, resolved)
}

private fun format(hour: Int, minutes: Int): String = "%02d:%02d".format(hour, minutes)
