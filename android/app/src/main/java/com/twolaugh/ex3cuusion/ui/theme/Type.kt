package com.twolaugh.ex3cuusion.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// T089: weights 400/500 only — no bold anywhere in the app.
val Ex3Typography = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 28.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.Medium, fontSize = 22.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 16.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 14.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.Medium, fontSize = 14.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp)
)
