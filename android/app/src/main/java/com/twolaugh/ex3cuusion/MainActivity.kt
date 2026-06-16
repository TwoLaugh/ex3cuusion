package com.twolaugh.ex3cuusion

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twolaugh.ex3cuusion.launcher.ReturnGuardService
import com.twolaugh.ex3cuusion.ui.launcher.AppsHost
import com.twolaugh.ex3cuusion.ui.pages.PagesHost
import com.twolaugh.ex3cuusion.ui.settings.SettingsScreen
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.theme.skinForKey
import com.twolaugh.ex3cuusion.ui.today.AppViewModel
import com.twolaugh.ex3cuusion.ui.today.TodayScreen

// The three root surfaces, in bottom-bar order.
private enum class RootTab(val label: String) { Today("Today"), Pages("Pages"), Apps("Apps") }

// Thin shell: theme + ViewModel + a Material3 bottom bar over the two root surfaces (T104/T108),
// with the same hand-rolled toggle to Settings (T105) — still no navigation framework.
// T109: the persisted skin is read here, drives the Material colorScheme (Ex3Theme) and is
// provided app-wide via LocalSkin; the Today host switches layout variants off it. Pages and
// Settings render from the same skin tokens now, so every root surface follows the palette.
class MainActivity : ComponentActivity() {

    // launchMode=singleTask: the force-return REORDER_TO_FRONT reuses this instance, so the
    // "force_today" extra arrives via onNewIntent rather than a fresh onCreate. We hoist the
    // current intent into a Compose-observable state and bump a nonce so the UI snaps to Today
    // every time a force-return lands (even if Today was already selected).
    private var currentIntent by mutableStateOf<Intent?>(null)
    private var forceTodayNonce by mutableStateOf(0)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        currentIntent = intent
        if (intent.getBooleanExtra(ReturnGuardService.EXTRA_FORCE_TODAY, false)) forceTodayNonce++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        currentIntent = intent
        if (intent?.getBooleanExtra(ReturnGuardService.EXTRA_FORCE_TODAY, false) == true) forceTodayNonce++
        enableEdgeToEdge()
        setContent {
            val viewModel: AppViewModel = viewModel()
            val context = LocalContext.current
            val skinKey by viewModel.settings.skinFlow.collectAsState()
            val skin = remember(skinKey) { skinForKey(skinKey) }

            // Launcher mode: start/stop the guard reactively. Fires on first composition and on
            // every master-toggle change; syncWithSettings only actually starts when the feature
            // is on AND the usage/overlay permissions are present, else it stops the service.
            val launcherEnabled by viewModel.settings.launcherEnabledFlow.collectAsState()
            LaunchedEffect(launcherEnabled) {
                ReturnGuardService.syncWithSettings(context, viewModel.settings)
            }

            Ex3Theme(skin = skin) {
                var showSettings by remember { mutableStateOf(false) }
                var tab by rememberSaveable { mutableStateOf(RootTab.Today) }

                // Force-return: when a bounce intent lands, snap to Today and leave Settings.
                LaunchedEffect(forceTodayNonce) {
                    if (forceTodayNonce > 0) {
                        tab = RootTab.Today
                        showSettings = false
                    }
                }

                // Every root surface (Today, Pages, Settings) paints the skin's background now,
                // so bar-icon contrast follows the skin directly.
                val lightBars = skin.palette.isLight
                SideEffect {
                    val controller = WindowCompat.getInsetsController(window, window.decorView)
                    controller.isAppearanceLightStatusBars = lightBars
                    controller.isAppearanceLightNavigationBars = lightBars
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
                                                        RootTab.Apps -> Icons.Outlined.Apps
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
                            // consumeWindowInsets: the bar-height padding above covers the system
                            // nav inset too, so children's imePadding must subtract it — without
                            // this the IME height stacks ON TOP of the bar padding and the
                            // keyboard pushes a big blank band of background above itself.
                            Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
                                when (tab) {
                                    RootTab.Today -> TodayScreen(viewModel, onOpenSettings = { showSettings = true })
                                    RootTab.Pages -> PagesHost(viewModel)
                                    RootTab.Apps -> AppsHost()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
