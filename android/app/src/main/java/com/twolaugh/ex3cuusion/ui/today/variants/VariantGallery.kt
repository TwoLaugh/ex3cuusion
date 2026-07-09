package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.twolaugh.ex3cuusion.ui.theme.AfterburnerSkin
import com.twolaugh.ex3cuusion.ui.theme.BauhausSkin
import com.twolaugh.ex3cuusion.ui.theme.BroadsheetSkin
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.FieldnotesSkin
import com.twolaugh.ex3cuusion.ui.theme.FlightdeckSkin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.theme.PhosphorSkin
import com.twolaugh.ex3cuusion.ui.today.UiState

// T109: the variant switch. TodayScreen resolves the persisted skin to a TodayVariant (null =
// warm-dark, the untouched default composition) and renders VariantTodayBody inside its chrome;
// actions.openBalance() raises the host bottom sheet around VariantBalance.
//
// HORIZONTAL PADDING ownership: this wrapper (the host side of the seam) applies each body's
// gutter so individual bodies stay full-width composables. Bauhaus is the exception with 0 —
// its tray bar and balance footer run full-bleed and the body indents its own sections by 18dp.

enum class TodayVariant(val skin: Ex3Skin, val bodyGutter: Dp) {
    Flightdeck(FlightdeckSkin, 14.dp),
    Broadsheet(BroadsheetSkin, 18.dp),
    Bauhaus(BauhausSkin, 0.dp), // body owns its padding (full-bleed bars)
    Phosphor(PhosphorSkin, 16.dp),
    Fieldnotes(FieldnotesSkin, 18.dp),
    Afterburner(AfterburnerSkin, 16.dp)
}

@Composable
fun VariantTodayBody(
    variant: TodayVariant,
    ui: UiState,
    actions: VariantActions,
    modifier: Modifier = Modifier
) {
    CompositionLocalProvider(LocalSkin provides variant.skin) {
        val padded = modifier.padding(horizontal = variant.bodyGutter)
        when (variant) {
            TodayVariant.Flightdeck -> FlightdeckTodayBody(ui, actions, padded)
            TodayVariant.Broadsheet -> BroadsheetTodayBody(ui, actions, padded)
            TodayVariant.Bauhaus -> BauhausTodayBody(ui, actions, padded)
            TodayVariant.Phosphor -> PhosphorTodayBody(ui, actions, padded)
            TodayVariant.Fieldnotes -> FieldnotesTodayBody(ui, actions, padded)
            TodayVariant.Afterburner -> AfterburnerTodayBody(ui, actions, padded)
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
            TodayVariant.Phosphor -> PhosphorBalance(ui, modifier)
            TodayVariant.Fieldnotes -> FieldnotesBalance(ui, modifier)
            TodayVariant.Afterburner -> AfterburnerBalance(ui, modifier)
        }
    }
}
