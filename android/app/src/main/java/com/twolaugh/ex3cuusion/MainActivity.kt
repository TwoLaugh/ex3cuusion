package com.twolaugh.ex3cuusion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.Ex3Theme
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Ex3Theme {
                TodayPlaceholder()
            }
        }
    }
}

@Composable
private fun TodayPlaceholder() {
    val today = remember {
        LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.UK))
    }
    Scaffold(containerColor = Ex3Colors.bg) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp, vertical = 24.dp)
        ) {
            Text(
                text = "ex3cuusion",
                style = MaterialTheme.typography.labelLarge,
                color = Ex3Colors.accent
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = today,
                style = MaterialTheme.typography.headlineMedium,
                color = Ex3Colors.ink
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Today list arrives in T104.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkMuted
            )
        }
    }
}
