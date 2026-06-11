package com.twolaugh.ex3cuusion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twolaugh.ex3cuusion.ui.settings.SettingsScreen
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import com.twolaugh.ex3cuusion.ui.today.AppViewModel
import com.twolaugh.ex3cuusion.ui.today.TodayScreen

// Thin shell: theme + ViewModel + the Today screen (T104), with a hand-rolled two-screen toggle
// to Settings (T105) — no navigation framework for two screens.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Ex3Theme {
                val viewModel: AppViewModel = viewModel()
                var showSettings by remember { mutableStateOf(false) }
                if (showSettings) {
                    BackHandler { showSettings = false }
                    SettingsScreen(settings = viewModel.settings, onBack = { showSettings = false })
                } else {
                    TodayScreen(viewModel, onOpenSettings = { showSettings = true })
                }
            }
        }
    }
}
