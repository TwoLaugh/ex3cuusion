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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twolaugh.ex3cuusion.ui.pages.PagesHost
import com.twolaugh.ex3cuusion.ui.settings.SettingsScreen
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import com.twolaugh.ex3cuusion.ui.today.AppViewModel
import com.twolaugh.ex3cuusion.ui.today.TodayScreen

// The two root surfaces, in bottom-bar order.
private enum class RootTab(val label: String) { Today("Today"), Pages("Pages") }

// Thin shell: theme + ViewModel + a Material3 bottom bar over the two root surfaces (T104/T108),
// with the same hand-rolled toggle to Settings (T105) — still no navigation framework.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Ex3Theme {
                val viewModel: AppViewModel = viewModel()
                var showSettings by remember { mutableStateOf(false) }
                var tab by rememberSaveable { mutableStateOf(RootTab.Today) }
                if (showSettings) {
                    BackHandler { showSettings = false }
                    SettingsScreen(settings = viewModel.settings, onBack = { showSettings = false })
                } else {
                    Scaffold(
                        containerColor = Ex3Colors.bg,
                        // Insets stay with the children (Today brings its own Scaffold; Pages
                        // screens pad the status bar themselves) — only the bar height lands here.
                        contentWindowInsets = WindowInsets(0.dp),
                        bottomBar = {
                            NavigationBar(containerColor = Ex3Colors.surface, tonalElevation = 0.dp) {
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
                                            selectedIconColor = Ex3Colors.ink,
                                            selectedTextColor = Ex3Colors.ink,
                                            indicatorColor = Ex3Colors.raised,
                                            unselectedIconColor = Ex3Colors.inkFaint,
                                            unselectedTextColor = Ex3Colors.inkFaint
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
