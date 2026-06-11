package com.twolaugh.ex3cuusion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import com.twolaugh.ex3cuusion.ui.today.AppViewModel
import com.twolaugh.ex3cuusion.ui.today.TodayScreen

// Thin shell: theme + ViewModel + the Today screen (T104). All state lives in AppViewModel.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Ex3Theme {
                val viewModel: AppViewModel = viewModel()
                TodayScreen(viewModel)
            }
        }
    }
}
