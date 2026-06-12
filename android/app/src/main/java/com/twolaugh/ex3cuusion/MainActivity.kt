package com.twolaugh.ex3cuusion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twolaugh.ex3cuusion.ui.pages.PagesHost
import com.twolaugh.ex3cuusion.ui.settings.SettingsScreen
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.theme.skinForKey
import com.twolaugh.ex3cuusion.ui.today.AppViewModel
import com.twolaugh.ex3cuusion.ui.today.TodayScreen

// The two root surfaces, in bottom-bar order.
private enum class RootTab(val label: String) { Today("Today"), Pages("Pages") }

// Thin shell: theme + ViewModel + a Material3 bottom bar over the two root surfaces (T104/T108),
// with the same hand-rolled toggle to Settings (T105) — still no navigation framework.
// T109: the persisted skin is read here and provided app-wide via LocalSkin; the Today host
// switches layout variants off it. Pages and Settings stay on warm-dark tokens (ticket: common
// chrome stays single), but the bottom bar + window bg follow the skin so the Today surface
// under test reads edge-to-edge.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Ex3Theme {
                val viewModel: AppViewModel = viewModel()
                val skinKey by viewModel.settings.skinFlow.collectAsState()
                val skin = remember(skinKey) { skinForKey(skinKey) }
                var showSettings by remember { mutableStateOf(false) }
                var tab by rememberSaveable { mutableStateOf(RootTab.Today) }

                // Status/nav icon contrast follows whatever is actually behind the bars: the skin's
                // background on the Today tab, warm-dark on Pages/Settings (both still warm-dark).
                val lightBehindStatusBar = skin.palette.isLight && tab == RootTab.Today && !showSettings
                val lightBehindNavBar = skin.palette.isLight && !showSettings
                SideEffect {
                    val controller = WindowCompat.getInsetsController(window, window.decorView)
                    controller.isAppearanceLightStatusBars = lightBehindStatusBar
                    controller.isAppearanceLightNavigationBars = lightBehindNavBar
                }

                // B2: text-selection colors follow the SKIN, not the hardcoded warm-dark Material
                // scheme. Without this every BasicTextField (the inline-add rows, TaskSheet, note
                // editor) paints its selection box + cursor handles in the warm-dark orange — on
                // the light paper skins that reads as a wrong-coloured text box.
                val selectionColors = remember(skin) {
                    TextSelectionColors(
                        handleColor = skin.palette.accent,
                        backgroundColor = skin.palette.accent.copy(alpha = 0.4f)
                    )
                }
                CompositionLocalProvider(
                    LocalSkin provides skin,
                    LocalTextSelectionColors provides selectionColors
                ) {
                    if (showSettings) {
                        BackHandler { showSettings = false }
                        SettingsScreen(settings = viewModel.settings, onBack = { showSettings = false })
                    } else {
                        Scaffold(
                            containerColor = skin.palette.bg,
                            // Insets stay with the children (Today brings its own Scaffold; Pages
                            // screens pad the status bar themselves) — only the bar height lands here.
                            contentWindowInsets = WindowInsets(0.dp),
                            bottomBar = {
                                NavigationBar(containerColor = skin.palette.surface, tonalElevation = 0.dp) {
                                    for (rootTab in RootTab.entries) {
                                        NavigationBarItem(
                                            selected = tab == rootTab,
                                            onClick = { tab = rootTab },
                                            icon = {
                                                Icon(
                                                    imageVector = when (rootTab) {
                                                        RootTab.Today -> Icons.Outlined.Today
                                                        RootTab.Pages -> Icons.Outlined.Description
                                                    },
                                                    contentDescription = null
                                                )
                                            },
                                            label = { Text(rootTab.label, style = MaterialTheme.typography.labelMedium) },
                                            colors = NavigationBarItemDefaults.colors(
                                                selectedIconColor = skin.palette.ink,
                                                selectedTextColor = skin.palette.ink,
                                                indicatorColor = skin.palette.raised,
                                                unselectedIconColor = skin.palette.inkFaint,
                                                unselectedTextColor = skin.palette.inkFaint
                                            )
                                        )
                                    }
                                }
                            }
                        ) { padding ->
                            Box(Modifier.fillMaxSize().padding(padding)) {
                                when (tab) {
                                    RootTab.Today -> TodayScreen(viewModel, onOpenSettings = { showSettings = true })
                                    RootTab.Pages -> PagesHost(viewModel)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
