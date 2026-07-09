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
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.DisposableEffect
import com.twolaugh.ex3cuusion.launcher.LauncherPermissions
import com.twolaugh.ex3cuusion.launcher.ReturnGuardService
import com.twolaugh.ex3cuusion.ui.theme.AllSkins
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.theme.key

// T105: AI enrichment settings — OpenAI API key (password-style, paste-friendly), model name,
// and the enrichment on/off switch. Values write through to the SettingsStore as they change;
// there is no save button to forget.
@Composable
fun SettingsScreen(settings: SettingsStore, onBack: () -> Unit) {
    // Settings renders under the ACTIVE skin (it is reachable from every Today variant), so all
    // tokens come from LocalSkin instead of the warm-dark statics.
    val palette = LocalSkin.current.palette
    val context = LocalContext.current
    var apiKey by remember { mutableStateOf(settings.apiKey) }
    var model by remember { mutableStateOf(settings.model) }
    var enabled by remember { mutableStateOf(settings.enrichmentEnabled) }
    var keyVisible by remember { mutableStateOf(false) }
    var dayStart by remember { mutableStateOf(settings.dayStart) }
    var dayEnd by remember { mutableStateOf(settings.dayEnd) }

    // Launcher mode local state. The master switch + timeout write through like everything else.
    var launcherEnabled by remember { mutableStateOf(settings.launcherEnabled) }
    var returnTimeout by remember { mutableStateOf(settings.returnTimeoutMinutes.toString()) }
    var notificationFilter by remember { mutableStateOf(settings.notificationFilterEnabled) }

    // Permission states are read directly in composition; this nonce re-reads them whenever the
    // screen resumes (the user returns from a system-settings deep link having granted something).
    var permissionNonce by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) permissionNonce++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(containerColor = palette.bg) { padding ->
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
                        tint = palette.inkMuted
                    )
                }
                Text(
                    text = "Settings",
                    style = MaterialTheme.typography.titleLarge,
                    color = palette.ink
                )
            }

            // Launcher mode — the headline feature, so it leads. Master switch + return timeout +
            // a permissions checklist shown only when the feature is on.
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Launcher",
                style = MaterialTheme.typography.titleMedium,
                color = palette.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Make Daybook your home screen. After your limit on any app, you're returned here to re-choose deliberately.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkMuted
            )

            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Launcher mode",
                    style = MaterialTheme.typography.bodyLarge,
                    color = palette.ink,
                    modifier = Modifier.weight(1f)
                )
                Switch(
                    checked = launcherEnabled,
                    onCheckedChange = {
                        launcherEnabled = it
                        settings.launcherEnabled = it
                        // Start immediately if perms are present (or stop on OFF).
                        ReturnGuardService.syncWithSettings(context, settings)
                    },
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = palette.accent,
                        checkedThumbColor = palette.ink
                    )
                )
            }

            if (launcherEnabled) {
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = returnTimeout,
                    onValueChange = { input ->
                        // Keep digits only; write through the validated int (store clamps 1..120).
                        val digits = input.filter { it.isDigit() }.take(3)
                        returnTimeout = digits
                        digits.toIntOrNull()?.let { settings.returnTimeoutMinutes = it }
                    },
                    label = { Text("Return after (minutes)") },
                    placeholder = { Text(SettingsStore.DEFAULT_RETURN_TIMEOUT.toString()) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = settingsFieldColors(),
                    modifier = Modifier.fillMaxWidth()
                )

                // Permission checklist — re-read on each resume via permissionNonce.
                val usageOk = remember(permissionNonce) { LauncherPermissions.hasUsageAccess(context) }
                val overlayOk = remember(permissionNonce) { LauncherPermissions.hasOverlay(context) }
                val batteryOk = remember(permissionNonce) { LauncherPermissions.isIgnoringBatteryOptimizations(context) }

                Spacer(Modifier.height(16.dp))
                PermissionRow(
                    name = "Usage access",
                    granted = usageOk,
                    onGrant = { context.startActivity(LauncherPermissions.usageAccessIntent()) }
                )
                PermissionRow(
                    name = "Display over other apps",
                    granted = overlayOk,
                    onGrant = { context.startActivity(LauncherPermissions.overlayIntent(context)) }
                )

                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { context.startActivity(LauncherPermissions.homeSettingsIntent()) }) {
                    Text("Set Daybook as home app", color = palette.accent)
                }
                if (!batteryOk) {
                    TextButton(onClick = { context.startActivity(LauncherPermissions.batteryExemptionIntent(context)) }) {
                        Text("Ignore battery optimisation", color = palette.accent)
                    }
                }

                Spacer(Modifier.height(8.dp))
                Text(
                    text = "The limit isn't instant — Daybook checks every couple of seconds. Calls and your dialer are never interrupted.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkFaint
                )

                // The allowlist lives on the Apps tab (per-row stars); this is just a pointer to it.
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Starred apps (Apps tab) run without a limit.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkMuted
                )

                // Notification filter. It is logically independent of the master switch, but for v1
                // we keep it INSIDE the launcherEnabled block so the Launcher section stays coherent
                // (turning Launcher mode off hides it). Its own Notification-access permission is
                // separate from the guard's usage/overlay perms.
                Spacer(Modifier.height(20.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "Silence other notifications",
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.ink,
                        modifier = Modifier.weight(1f)
                    )
                    Switch(
                        checked = notificationFilter,
                        onCheckedChange = {
                            notificationFilter = it
                            settings.notificationFilterEnabled = it
                        },
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = palette.accent,
                            checkedThumbColor = palette.ink
                        )
                    )
                }

                if (notificationFilter) {
                    // Re-read access on each resume (the user grants it in a system-settings screen).
                    val notifAccessOk = remember(permissionNonce) {
                        LauncherPermissions.hasNotificationAccess(context)
                    }
                    Spacer(Modifier.height(8.dp))
                    PermissionRow(
                        name = "Notification access",
                        granted = notifAccessOk,
                        onGrant = { context.startActivity(LauncherPermissions.notificationAccessIntent()) }
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Keeps messages, emails, calls, and your starred apps. Everything else is dismissed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.inkFaint
                    )
                }
            }

            // B1: the day window — capacity = minutes between these two clock times (day-shape
            // principle: capacity is the day window, not an abstract minute budget). Write-through
            // like everything here; the store ignores half-typed values until they parse.
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Day",
                style = MaterialTheme.typography.titleMedium,
                color = palette.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Your waking window — today's capacity is what is left of it.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkMuted
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = dayStart,
                    onValueChange = {
                        dayStart = it
                        settings.dayStart = it
                    },
                    label = { Text("Starts (HH:MM)") },
                    placeholder = { Text(SettingsStore.DEFAULT_DAY_START) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = settingsFieldColors(),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = dayEnd,
                    onValueChange = {
                        dayEnd = it
                        settings.dayEnd = it
                    },
                    label = { Text("Ends (HH:MM)") },
                    placeholder = { Text(SettingsStore.DEFAULT_DAY_END) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = settingsFieldColors(),
                    modifier = Modifier.weight(1f)
                )
            }

            // T109: the layout/skin bake-off picker. One radio row per skin; the row's three dots
            // preview the palette (bg / ink / accent). Writing settings.skin updates the skinFlow,
            // so the app root re-provides LocalSkin immediately — no restart.
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Layout & skin",
                style = MaterialTheme.typography.titleMedium,
                color = palette.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Six dogfood candidates from the mockup directions — losers get deleted after the bake-off.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkMuted
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
                color = palette.ink
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Captures are sent to OpenAI with your folder names + task titles for filing; nothing else leaves the device.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkMuted
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
                            tint = palette.inkFaint
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
                        color = palette.ink
                    )
                    Text(
                        text = if (apiKey.isBlank()) "Add an API key to enable" else "File new captures automatically",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.inkFaint
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
                        checkedTrackColor = palette.accent,
                        checkedThumbColor = palette.ink
                    )
                )
            }

            Spacer(Modifier.height(40.dp))
        }
    }
}

// Launcher mode: one permission row — name, a ✓/✗ glyph in accent/faint, and a Grant button that
// deep-links into the matching system-settings screen (hidden once granted).
@Composable
private fun PermissionRow(name: String, granted: Boolean, onGrant: () -> Unit) {
    val palette = LocalSkin.current.palette
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
    ) {
        Text(
            text = if (granted) "✓" else "✗",
            style = MaterialTheme.typography.bodyLarge,
            color = if (granted) palette.accent else palette.inkFaint
        )
        Spacer(Modifier.size(12.dp))
        Text(
            text = name,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.ink,
            modifier = Modifier.weight(1f)
        )
        if (!granted) {
            TextButton(onClick = onGrant) {
                Text("Grant", color = palette.accent)
            }
        }
    }
}

// One pickable skin: radio + name + a three-dot palette preview (bg, ink, accent). The bg dot
// gets a hairline ring so dark backgrounds stay visible on the dark settings surface.
@Composable
private fun SkinRow(skin: Ex3Skin, selected: Boolean, onSelect: () -> Unit) {
    val palette = LocalSkin.current.palette
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
                selectedColor = palette.accent,
                unselectedColor = palette.inkFaint
            )
        )
        Text(
            text = skin.name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) palette.ink else palette.inkMuted,
            modifier = Modifier.weight(1f)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(skin.palette.bg)
                    .border(1.dp, palette.inkFaint, CircleShape)
            )
            Box(Modifier.size(14.dp).clip(CircleShape).background(skin.palette.ink))
            Box(Modifier.size(14.dp).clip(CircleShape).background(skin.palette.accent))
        }
    }
}

@Composable
private fun settingsFieldColors(): androidx.compose.material3.TextFieldColors {
    val palette = LocalSkin.current.palette
    return OutlinedTextFieldDefaults.colors(
        focusedTextColor = palette.ink,
        unfocusedTextColor = palette.ink,
        cursorColor = palette.accent,
        focusedBorderColor = palette.accent,
        unfocusedBorderColor = palette.inkFaint,
        focusedLabelColor = palette.inkMuted,
        unfocusedLabelColor = palette.inkFaint,
        focusedPlaceholderColor = palette.inkFaint,
        unfocusedPlaceholderColor = palette.inkFaint
    )
}
