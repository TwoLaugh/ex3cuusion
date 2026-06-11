package com.twolaugh.ex3cuusion.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.R

// T109 PASS 1 — skin token sets for the layout-variant bake-off. Each variant body reads
// LocalSkin and styles itself entirely from these tokens; the variant host (wired later)
// provides the right skin per TodayVariant setting. Values come straight from the T109 ticket
// (which in turn came from the planner-mockups/directions/*.jsx palettes).

// ── bundled font families (res/font, all OFL) ──────────────────────────────────────────────────
// Weight requests between the declared weights resolve to the closest available face (Compose
// font matching), so e.g. SemiBold on JetBrains Mono picks the 700 cut.
private val InstrumentSerif = FontFamily(
    Font(R.font.instrument_serif_400, FontWeight.Normal)
)
private val ArchivoNarrow = FontFamily(
    Font(R.font.archivo_narrow_400, FontWeight.Normal),
    Font(R.font.archivo_narrow_600, FontWeight.SemiBold)
)
private val Archivo = FontFamily(
    Font(R.font.archivo_400, FontWeight.Normal),
    Font(R.font.archivo_600, FontWeight.SemiBold),
    Font(R.font.archivo_900, FontWeight.Black)
)
private val JetBrainsMono = FontFamily(
    Font(R.font.jetbrains_mono_400, FontWeight.Normal),
    Font(R.font.jetbrains_mono_700, FontWeight.Bold)
)
private val SpaceGrotesk = FontFamily(
    Font(R.font.space_grotesk_400, FontWeight.Normal),
    Font(R.font.space_grotesk_500, FontWeight.Medium),
    Font(R.font.space_grotesk_700, FontWeight.Bold)
)
private val IbmPlexMono = FontFamily(
    Font(R.font.ibm_plex_mono_400, FontWeight.Normal),
    Font(R.font.ibm_plex_mono_600, FontWeight.SemiBold)
)
private val SpecialElite = FontFamily(
    Font(R.font.special_elite_400, FontWeight.Normal)
)
private val Caveat = FontFamily(
    Font(R.font.caveat_400, FontWeight.Normal),
    Font(R.font.caveat_600, FontWeight.SemiBold)
)
private val Rajdhani = FontFamily(
    Font(R.font.rajdhani_500, FontWeight.Medium),
    Font(R.font.rajdhani_700, FontWeight.Bold)
)

data class Ex3Palette(
    val bg: Color,
    val surface: Color,
    val raised: Color,
    val ink: Color,
    val inkMuted: Color,
    val inkFaint: Color,
    val hairline: Color,
    val accent: Color,
    val accentSoft: Color,
    val missed: Color,
    val onAccent: Color,
    val pillarTones: List<Color>,
    val isLight: Boolean
)

data class Ex3Type(
    val body: FontFamily,
    val display: FontFamily,
    val meta: FontFamily,
    val labelLetterSpacing: TextUnit
)

data class Ex3Shape(
    val radiusSmall: Dp,
    val radiusLarge: Dp,
    val borderWidth: Dp,
    // true = subtle low-alpha hairlines (dark cockpit skins); false = full-strength ink rules
    // (the editorial/geometric light skins draw their dividers in solid ink).
    val hairlineStyle: Boolean
)

data class Ex3Skin(
    val name: String,
    val palette: Ex3Palette,
    val type: Ex3Type,
    val shape: Ex3Shape
)

// ── 0. warm-dark (current default; values mirror Ex3Colors + DayListSection.hairline +
//      TodayScreen.pillarTones exactly) ─────────────────────────────────────────────────────────
val WarmDarkSkin = Ex3Skin(
    name = "warm-dark",
    palette = Ex3Palette(
        bg = Color(0xFF161410),
        surface = Color(0xFF1D1A15),
        raised = Color(0xFF24201A),
        ink = Color(0xFFECE7DC),
        inkMuted = Color(0xFFA39C8C),
        inkFaint = Color(0xFF6B6557),
        hairline = Color(0x14ECE7DC),
        accent = Color(0xFFE0683A),
        accentSoft = Color(0x40E0683A),
        missed = Color(0xFFBA7517),
        onAccent = Color(0xFF161410),
        pillarTones = listOf(
            Color(0xFFB07A45), Color(0xFF7F8B5E), Color(0xFF8B6F8F),
            Color(0xFF5E8B8B), Color(0xFFB5A36B), Color(0xFF9C5F55)
        ),
        isLight = false
    ),
    type = Ex3Type(
        body = FontFamily.Default,
        display = FontFamily.Default,
        meta = FontFamily.Default,
        labelLetterSpacing = 1.8.sp
    ),
    shape = Ex3Shape(radiusSmall = 8.dp, radiusLarge = 14.dp, borderWidth = 1.dp, hairlineStyle = true)
)

// ── 1. broadsheet — editorial print, ink on cream, one red. LIGHT skin. ─────────────────────────
// Pillar differentiation here is structural (hatch patterns, see BroadsheetBalance); the tones
// are six muted inks used only where a flat swatch is unavoidable.
val BroadsheetSkin = Ex3Skin(
    name = "broadsheet",
    palette = Ex3Palette(
        bg = Color(0xFFF4EDDA),
        surface = Color(0xFFF4EDDA),         // print has no panels; the page is the surface
        raised = Color(0xFFEAE1C8),          // a slightly toned cream for the rare inset
        ink = Color(0xFF221B10),
        inkMuted = Color(0x8C221B10),        // rgba(34,27,16,0.55) from the ticket
        inkFaint = Color(0x59221B10),        // 0.35 alpha
        hairline = Color(0xFF221B10),        // hairlines are 1px ink rules
        accent = Color(0xFFBF3517),
        accentSoft = Color(0x26BF3517),
        missed = Color(0xFF96660F),          // not in ticket: dark amber legible on paper
        onAccent = Color(0xFFF4EDDA),
        pillarTones = listOf(                // six muted inks (ticket: "6 muted inks")
            Color(0xFF4A3A23), Color(0xFF33402F), Color(0xFF3C3046),
            Color(0xFF2C3B45), Color(0xFF5A3A22), Color(0xFF221B10)
        ),
        isLight = true
    ),
    type = Ex3Type(
        body = InstrumentSerif,
        display = InstrumentSerif,
        meta = ArchivoNarrow,                // smallcaps-style labels
        labelLetterSpacing = 1.4.sp          // ≈0.14em at label sizes
    ),
    shape = Ex3Shape(radiusSmall = 0.dp, radiusLarge = 0.dp, borderWidth = 1.dp, hairlineStyle = false)
)

// ── 2. phosphor — single-channel amber terminal. ────────────────────────────────────────────────
val PhosphorSkin = Ex3Skin(
    name = "phosphor",
    palette = Ex3Palette(
        bg = Color(0xFF0B0C08),
        surface = Color(0xFF0B0C08),         // no fills — border-only chips
        raised = Color(0xFF12130C),
        ink = Color(0xFFFFB000),
        inkMuted = Color(0x73FFB000),        // dim 0.45
        inkFaint = Color(0x38FFB000),        // faint 0.22
        hairline = Color(0x38FFB000),
        accent = Color(0xFFFFB000),
        accentSoft = Color(0x73FFB000),
        missed = Color(0xFFFFB000),          // everything is amber; urgency reads via weight/blink
        onAccent = Color(0xFF0B0C08),
        pillarTones = listOf(                // alpha steps of the one phosphor channel
            Color(0xFFFFB000), Color(0xCCFFB000), Color(0xA6FFB000),
            Color(0x80FFB000), Color(0x59FFB000), Color(0x40FFB000)
        ),
        isLight = false
    ),
    type = Ex3Type(
        body = JetBrainsMono,
        display = JetBrainsMono,
        meta = JetBrainsMono,
        labelLetterSpacing = 1.6.sp
    ),
    shape = Ex3Shape(radiusSmall = 0.dp, radiusLarge = 0.dp, borderWidth = 1.dp, hairlineStyle = true)
)

// ── 3. flightdeck — instrument cluster. ─────────────────────────────────────────────────────────
val FlightdeckSkin = Ex3Skin(
    name = "flightdeck",
    palette = Ex3Palette(
        bg = Color(0xFF14171B),
        surface = Color(0xFF1A1E24),         // "panel" in the mockup
        raised = Color(0xFF20252C),
        ink = Color(0xFFE9E7E2),
        inkMuted = Color(0xFF8A929C),
        inkFaint = Color(0xFF5C636C),
        hairline = Color(0xFF272E37),        // "edge" in the mockup
        accent = Color(0xFFFF5A1F),
        accentSoft = Color(0x26FF5A1F),      // the mockup's `${accent}26` washes
        missed = Color(0xFFE8A33D),          // "warn"
        onAccent = Color(0xFF14171B),
        pillarTones = listOf(
            Color(0xFFC9A84C), Color(0xFF4E94A3), Color(0xFFC05A4E),
            Color(0xFF8D7BB5), Color(0xFFCF8B3E), Color(0xFF8AA05A)
        ),
        isLight = false
    ),
    type = Ex3Type(
        body = SpaceGrotesk,
        display = SpaceGrotesk,
        meta = IbmPlexMono,                  // all numerals
        labelLetterSpacing = 1.8.sp          // ≈0.18em at the 9.5-10sp label sizes
    ),
    shape = Ex3Shape(radiusSmall = 4.dp, radiusLarge = 6.dp, borderWidth = 1.dp, hairlineStyle = true)
)

// ── 4. fieldnotes — typewriter on field paper. LIGHT skin. ──────────────────────────────────────
val FieldnotesSkin = Ex3Skin(
    name = "fieldnotes",
    palette = Ex3Palette(
        bg = Color(0xFFEDE2C8),
        surface = Color(0xFFEDE2C8),
        raised = Color(0xFFE3D6B6),
        ink = Color(0xFF2C2316),
        inkMuted = Color(0x802C2316),        // faint 0.5 alpha
        inkFaint = Color(0x4D2C2316),
        hairline = Color(0x802C2316),        // dashed underlines drawn at this strength
        accent = Color(0xFFB3402A),
        accentSoft = Color(0x26B3402A),
        missed = Color(0xFF8F5E10),          // not in ticket: ochre stamp tone
        onAccent = Color(0xFFEDE2C8),
        pillarTones = listOf(                // not in ticket: muted earth inks
            Color(0xFF7A5B2F), Color(0xFF4E6151), Color(0xFF8A4A35),
            Color(0xFF5D4A6B), Color(0xFF6E5840), Color(0xFF54624A)
        ),
        isLight = true
    ),
    type = Ex3Type(
        body = SpecialElite,                 // typewriter
        display = Caveat,                    // handwritten accents
        meta = SpecialElite,
        labelLetterSpacing = 1.2.sp
    ),
    shape = Ex3Shape(radiusSmall = 2.dp, radiusLarge = 6.dp, borderWidth = 1.dp, hairlineStyle = false)
)

// ── 5. afterburner — hot gradient pair on near-black. ───────────────────────────────────────────
val AfterburnerSkin = Ex3Skin(
    name = "afterburner",
    palette = Ex3Palette(
        bg = Color(0xFF060608),
        surface = Color(0xFF0E0E12),         // "card"
        raised = Color(0xFF15151B),
        ink = Color(0xFFF2F0EE),
        inkMuted = Color(0xFF6F6E78),
        inkFaint = Color(0xFF46454E),
        hairline = Color(0xFF1D1D24),        // "edge"
        accent = Color(0xFFFF6A00),          // hot half of the gradient pair
        accentSoft = Color(0xFFFF2D78),      // pink half doubles as the second accent (ticket)
        missed = Color(0xFFFF2D78),
        onAccent = Color(0xFF060608),
        pillarTones = listOf(                // not in ticket: hot-neon derivations
            Color(0xFFE8A33D), Color(0xFF4E94A3), Color(0xFFFF2D78),
            Color(0xFF8D7BB5), Color(0xFFFF6A00), Color(0xFF8AA05A)
        ),
        isLight = false
    ),
    type = Ex3Type(
        body = Archivo,
        display = Rajdhani,
        meta = Rajdhani,                     // numerals
        labelLetterSpacing = 1.6.sp
    ),
    shape = Ex3Shape(radiusSmall = 6.dp, radiusLarge = 10.dp, borderWidth = 1.dp, hairlineStyle = true)
)

// ── 6. bauhaus — day-builder, bricks and primary shapes. LIGHT skin. ────────────────────────────
val BauhausSkin = Ex3Skin(
    name = "bauhaus",
    palette = Ex3Palette(
        bg = Color(0xFFF5F0E4),
        surface = Color(0xFFF5F0E4),
        raised = Color(0xFFEBE4D2),
        ink = Color(0xFF211D16),
        inkMuted = Color(0x8C211D16),        // mute 0.55 alpha
        inkFaint = Color(0x1F211D16),        // the 12% row dividers in the mockup
        hairline = Color(0xFF211D16),        // bold 2px ink borders instead of hairlines
        accent = Color(0xFFD4552E),          // ticket: pick red for actions
        accentSoft = Color(0xFFD9A521),      // pillar yellow as the second accent
        missed = Color(0xFFA07712),          // not in ticket: dark mustard
        onAccent = Color(0xFFF5F0E4),
        pillarTones = listOf(
            Color(0xFFD9A521), Color(0xFF297A80), Color(0xFFD4552E),
            Color(0xFF7B5EA7), Color(0xFF8A5A3B), Color(0xFF7D8C4A)
        ),
        isLight = true
    ),
    type = Ex3Type(
        body = Archivo,                      // 400/600
        display = Archivo,                   // used at weight 900 (Black)
        meta = Archivo,
        labelLetterSpacing = 1.4.sp
    ),
    shape = Ex3Shape(radiusSmall = 0.dp, radiusLarge = 0.dp, borderWidth = 2.dp, hairlineStyle = false)
)

// All seven, in ticket order — the Settings picker iterates this list.
val AllSkins: List<Ex3Skin> = listOf(
    WarmDarkSkin, BroadsheetSkin, PhosphorSkin, FlightdeckSkin,
    FieldnotesSkin, AfterburnerSkin, BauhausSkin
)

// The persisted settings key for a skin ("warm-dark" -> "warm_dark").
val Ex3Skin.key: String get() = name.replace('-', '_')

fun skinForKey(key: String): Ex3Skin = AllSkins.firstOrNull { it.key == key } ?: WarmDarkSkin

val LocalSkin = staticCompositionLocalOf { WarmDarkSkin }
