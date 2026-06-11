package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import com.twolaugh.ex3cuusion.ui.theme.BauhausSkin
import com.twolaugh.ex3cuusion.ui.theme.BroadsheetSkin
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.FlightdeckSkin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.today.UiState

// T109 PASS 1: the variant switch, unwired. Nothing references this from MainActivity yet —
// it exists so every variant body (and its balance presentation) is reachable from one
// compiled entry point; the real host (Settings-driven, with the bottom-sheet balance) lands
// in a later pass outside this worktree.

enum class TodayVariant(val skin: Ex3Skin) {
    Flightdeck(FlightdeckSkin),
    Broadsheet(BroadsheetSkin),
    Bauhaus(BauhausSkin)
}

@Composable
fun VariantTodayBody(
    variant: TodayVariant,
    ui: UiState,
    actions: VariantActions,
    modifier: Modifier = Modifier
) {
    CompositionLocalProvider(LocalSkin provides variant.skin) {
        when (variant) {
            TodayVariant.Flightdeck -> FlightdeckTodayBody(ui, actions, modifier)
            TodayVariant.Broadsheet -> BroadsheetTodayBody(ui, actions, modifier)
            TodayVariant.Bauhaus -> BauhausTodayBody(ui, actions, modifier)
        }
    }
}

@Composable
fun VariantBalance(
    variant: TodayVariant,
    ui: UiState,
    modifier: Modifier = Modifier
) {
    CompositionLocalProvider(LocalSkin provides variant.skin) {
        when (variant) {
            TodayVariant.Flightdeck -> FlightdeckBalance(ui, modifier)
            TodayVariant.Broadsheet -> BroadsheetBalance(ui, modifier)
            TodayVariant.Bauhaus -> BauhausBalance(ui, modifier)
        }
    }
}
