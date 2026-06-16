@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.launcher

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import com.twolaugh.ex3cuusion.launcher.InstalledAppsRepository
import com.twolaugh.ex3cuusion.launcher.LaunchableApp
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Launcher mode: the third tab body. A searchable, flat list of installed apps — the user
// explicitly wanted "a simple list you search", not an icon grid. App discovery is heavy, so it
// runs once off the main thread (cached at the repository level) and shows a quiet loading line
// meanwhile. Launching an app calls onLaunched() so the host can react if it ever needs to.
@Composable
fun AppsHost(onLaunched: () -> Unit = {}) {
    val palette = LocalSkin.current.palette
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }

    // Load (or hit the repository cache) off the main thread. produceState keeps the loaded flag
    // distinct from "empty list" so we can show the loading line only while genuinely loading.
    val apps by produceState<List<LaunchableApp>?>(initialValue = null) {
        value = withContext(Dispatchers.IO) { InstalledAppsRepository.loadApps(context) }
    }

    val filtered = remember(apps, query) {
        val all = apps ?: emptyList()
        if (query.isBlank()) all
        else all.filter { it.label.contains(query.trim(), ignoreCase = true) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Apps",
            style = MaterialTheme.typography.titleLarge,
            color = palette.ink,
            modifier = Modifier.padding(horizontal = 4.dp)
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Search apps") },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = palette.ink,
                unfocusedTextColor = palette.ink,
                cursorColor = palette.accent,
                focusedBorderColor = palette.accent,
                unfocusedBorderColor = palette.inkFaint,
                focusedPlaceholderColor = palette.inkFaint,
                unfocusedPlaceholderColor = palette.inkFaint
            ),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))

        when {
            apps == null -> {
                Text(
                    text = "Loading apps…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkMuted,
                    modifier = Modifier.padding(12.dp)
                )
            }
            filtered.isEmpty() -> {
                Text(
                    text = if (query.isBlank()) "No apps found." else "No apps match \"${query.trim()}\".",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkMuted,
                    modifier = Modifier.padding(12.dp)
                )
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(filtered, key = { it.packageName }) { app ->
                        AppRow(
                            app = app,
                            onClick = {
                                InstalledAppsRepository.launchIntentFor(context, app.packageName)?.let {
                                    context.startActivity(it)
                                    onLaunched()
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AppRow(app: LaunchableApp, onClick: () -> Unit) {
    val palette = LocalSkin.current.palette
    // Drawable -> ImageBitmap once per row; remembered on the icon identity so we don't re-rasterize
    // on every recomposition (search typing recomposes the list frequently).
    val bitmap = remember(app.packageName) { app.icon.toBitmap().asImageBitmap() }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 6.dp)
    ) {
        Image(
            bitmap = bitmap,
            contentDescription = null,
            modifier = Modifier.size(40.dp)
        )
        Text(
            text = app.label,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.ink
        )
    }
}
