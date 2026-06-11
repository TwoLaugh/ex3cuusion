package com.twolaugh.ex3cuusion.ui.theme

import androidx.compose.ui.graphics.Color

// T089 warm-dark tokens — must stay in sync with the web theme.
object Ex3Colors {
    val bg = Color(0xFF161410)
    val surface = Color(0xFF1D1A15)
    val raised = Color(0xFF24201A)
    val ink = Color(0xFFECE7DC)
    val inkMuted = Color(0xFFA39C8C)
    val inkFaint = Color(0xFF6B6557)
    val accent = Color(0xFFE0683A)
    val missed = Color(0xFFBA7517)

    // T108: the 8 page tones — desaturated warm hues, INDEX-STABLE (Folder.color stores the
    // index, so reordering this list would repaint everyone's folders; append only).
    val pageTones = listOf(
        Color(0xFF8C8474), // 0 stone (Main's default)
        Color(0xFFB07A45), // 1 clay
        Color(0xFFB5A36B), // 2 ochre
        Color(0xFF7F8B5E), // 3 olive
        Color(0xFF5E8B8B), // 4 teal
        Color(0xFF8B6F8F), // 5 mauve
        Color(0xFF9C5F55), // 6 brick
        Color(0xFF8B7355)  // 7 umber
    )
}
