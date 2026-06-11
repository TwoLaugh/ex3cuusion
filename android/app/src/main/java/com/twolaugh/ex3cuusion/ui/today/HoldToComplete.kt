package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

// Completing a task deserves a moment of ceremony, not a hair-trigger tap (user feedback,
// 2026-06-11): press and HOLD — a ring fills over the hold; at full it commits with a haptic
// tick. Releasing early snaps the ring back. One state per row/chip.
class HoldToCompleteState {
    val progress = Animatable(0f)
}

@Composable
fun rememberHoldToComplete(): HoldToCompleteState = remember { HoldToCompleteState() }

fun Modifier.holdToComplete(
    state: HoldToCompleteState,
    durationMs: Int = 600,
    onComplete: () -> Unit
): Modifier = composed {
    val haptics = LocalHapticFeedback.current
    pointerInput(state, durationMs) {
        coroutineScope {
            detectTapGestures(
                onPress = {
                    val fill = launch {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        state.progress.animateTo(1f, tween(durationMs, easing = FastOutSlowInEasing))
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        onComplete()
                        state.progress.snapTo(0f)
                    }
                    tryAwaitRelease()
                    if (state.progress.value < 1f) {
                        fill.cancel()
                        launch { state.progress.animateTo(0f, tween(140)) }
                    }
                }
            )
        }
    }
}
