package com.twolaugh.ex3cuusion.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val WarmDarkColorScheme = darkColorScheme(
    primary = Ex3Colors.accent,
    onPrimary = Ex3Colors.bg,
    secondary = Ex3Colors.inkMuted,
    onSecondary = Ex3Colors.bg,
    tertiary = Ex3Colors.missed,
    onTertiary = Ex3Colors.bg,
    background = Ex3Colors.bg,
    onBackground = Ex3Colors.ink,
    surface = Ex3Colors.surface,
    onSurface = Ex3Colors.ink,
    surfaceVariant = Ex3Colors.raised,
    onSurfaceVariant = Ex3Colors.inkMuted,
    outline = Ex3Colors.inkFaint,
    outlineVariant = Ex3Colors.raised
)

@Composable
fun Ex3Theme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WarmDarkColorScheme,
        typography = Ex3Typography,
        content = content
    )
}
