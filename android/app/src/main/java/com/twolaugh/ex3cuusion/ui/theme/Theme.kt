package com.twolaugh.ex3cuusion.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

// The Material colorScheme follows the ACTIVE SKIN so every Material-default surface — dropdown
// menus, snackbars, dialogs, modal sheets — stays legible on every palette (the old hardcoded
// dark scheme painted near-white menu text over the light paper skins).
//
// Warm-dark CONTRACT: WarmDarkSkin.palette mirrors Ex3Colors exactly and the dark branch below
// declares exactly the slots the old hardcoded WarmDarkColorScheme declared, so the default skin
// renders pixel-identical.
private fun colorSchemeFor(palette: Ex3Palette): ColorScheme = if (palette.isLight) {
    lightColorScheme(
        primary = palette.accent,
        onPrimary = palette.onAccent,
        secondary = palette.inkMuted,
        onSecondary = palette.bg,
        tertiary = palette.missed,
        onTertiary = palette.bg,
        background = palette.bg,
        onBackground = palette.ink,
        surface = palette.surface,
        onSurface = palette.ink,
        surfaceVariant = palette.raised,
        onSurfaceVariant = palette.inkMuted,
        outline = palette.inkFaint,
        outlineVariant = palette.raised,
        // Menus, dialogs and sheets pull from the container roles — keep them on the skin's
        // paper tones instead of Material's plain white.
        surfaceContainerLowest = palette.surface,
        surfaceContainerLow = palette.surface,
        surfaceContainer = palette.raised,
        surfaceContainerHigh = palette.raised,
        surfaceContainerHighest = palette.raised,
        // Snackbars draw from the inverse roles: a dark ink panel with paper-toned text.
        inverseSurface = palette.ink,
        inverseOnSurface = palette.bg,
        inversePrimary = palette.accent
    )
} else {
    // The exact slot set the old scheme declared — warm-dark stays pixel-identical; the other
    // dark skins get the same mapping through their own palettes.
    darkColorScheme(
        primary = palette.accent,
        onPrimary = palette.bg,
        secondary = palette.inkMuted,
        onSecondary = palette.bg,
        tertiary = palette.missed,
        onTertiary = palette.bg,
        background = palette.bg,
        onBackground = palette.ink,
        surface = palette.surface,
        onSurface = palette.ink,
        surfaceVariant = palette.raised,
        onSurfaceVariant = palette.inkMuted,
        outline = palette.inkFaint,
        outlineVariant = palette.raised
    )
}

@Composable
fun Ex3Theme(skin: Ex3Skin = WarmDarkSkin, content: @Composable () -> Unit) {
    val colorScheme = remember(skin) { colorSchemeFor(skin.palette) }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Ex3Typography,
        content = content
    )
}
