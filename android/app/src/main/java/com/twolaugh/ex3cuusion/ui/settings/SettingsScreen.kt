@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.twolaugh.ex3cuusion.ui.theme.AllSkins
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.key

// T105: AI enrichment settings — OpenAI API key (password-style, paste-friendly), model name,
// and the enrichment on/off switch. Values write through to the SettingsStore as they change;
// there is no save button to forget.
@Composable
fun SettingsScreen(settings: SettingsStore, onBack: () -> Unit) {
    var apiKey by remember { mutableStateOf(settings.apiKey) }
    var model by remember { mutableStateOf(settings.model) }
    var enabled by remember { mutableStateOf(settings.enrichmentEnabled) }
    var keyVisible by remember { mutableStateOf(false) }

    Scaffold(containerColor = Ex3Colors.bg) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Ex3Colors.inkMuted
                    )
                }
                Text(
                    text = "Settings",
                    style = MaterialTheme.typography.titleLarge,
                    color = Ex3Colors.ink
                )
            }

            // T109: the layout/skin bake-off picker. One radio row per skin; the row's three dots
            // preview the palette (bg / ink / accent). Writing settings.skin updates the skinFlow,
            // so the app root re-provides LocalSkin immediately — no restart.
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Layout & skin",
                style = MaterialTheme.typography.titleMedium,
                color = Ex3Colors.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Six dogfood candidates from the mockup directions — losers get deleted after the bake-off.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkMuted
            )
            Spacer(Modifier.height(8.dp))
            val selectedSkinKey by settings.skinFlow.collectAsState()
            for (skin in AllSkins) {
                SkinRow(
                    skin = skin,
                    selected = skin.key == selectedSkinKey,
                    onSelect = { settings.skin = skin.key }
                )
            }

            Spacer(Modifier.height(24.dp))
            Text(
                text = "AI enrichment",
                style = MaterialTheme.typography.titleMedium,
                color = Ex3Colors.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Captures are sent to OpenAI with your folder names + task titles for filing; nothing else leaves the device.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkMuted
            )

            Spacer(Modifier.height(20.dp))
            OutlinedTextField(
                value = apiKey,
                onValueChange = {
                    apiKey = it
                    settings.apiKey = it
                },
                label = { Text("OpenAI API key") },
                placeholder = { Text("sk-...") },
                singleLine = true,
                visualTransformation = if (keyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                trailingIcon = {
                    IconButton(onClick = { keyVisible = !keyVisible }) {
                        Icon(
                            imageVector = if (keyVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (keyVisible) "Hide key" else "Show key",
                            tint = Ex3Colors.inkFaint
                        )
                    }
                },
                colors = settingsFieldColors(),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = model,
                onValueChange = {
                    model = it
                    settings.model = it
                },
                label = { Text("Model") },
                placeholder = { Text(SettingsStore.DEFAULT_MODEL) },
                singleLine = true,
                colors = settingsFieldColors(),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = "AI enrichment",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Ex3Colors.ink
                    )
                    Text(
                        text = if (apiKey.isBlank()) "Add an API key to enable" else "File new captures automatically",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ex3Colors.inkFaint
                    )
                }
                Switch(
                    checked = enabled && apiKey.isNotBlank(),
                    enabled = apiKey.isNotBlank(),
                    onCheckedChange = {
                        enabled = it
                        settings.enrichmentEnabled = it
                    },
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = Ex3Colors.accent,
                        checkedThumbColor = Ex3Colors.ink
                    )
                )
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

// One pickable skin: radio + name + a three-dot palette preview (bg, ink, accent). The bg dot
// gets a hairline ring so dark backgrounds stay visible on the dark settings surface.
@Composable
private fun SkinRow(skin: Ex3Skin, selected: Boolean, onSelect: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect)
            .padding(vertical = 2.dp)
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(
                selectedColor = Ex3Colors.accent,
                unselectedColor = Ex3Colors.inkFaint
            )
        )
        Text(
            text = skin.name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) Ex3Colors.ink else Ex3Colors.inkMuted,
            modifier = Modifier.weight(1f)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(skin.palette.bg)
                    .border(1.dp, Ex3Colors.inkFaint, CircleShape)
            )
            Box(Modifier.size(14.dp).clip(CircleShape).background(skin.palette.ink))
            Box(Modifier.size(14.dp).clip(CircleShape).background(skin.palette.accent))
        }
    }
}

@Composable
private fun settingsFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Ex3Colors.ink,
    unfocusedTextColor = Ex3Colors.ink,
    cursorColor = Ex3Colors.accent,
    focusedBorderColor = Ex3Colors.accent,
    unfocusedBorderColor = Ex3Colors.inkFaint,
    focusedLabelColor = Ex3Colors.inkMuted,
    unfocusedLabelColor = Ex3Colors.inkFaint,
    focusedPlaceholderColor = Ex3Colors.inkFaint,
    unfocusedPlaceholderColor = Ex3Colors.inkFaint
)
