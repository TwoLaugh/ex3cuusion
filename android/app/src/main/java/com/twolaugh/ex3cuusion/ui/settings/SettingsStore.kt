package com.twolaugh.ex3cuusion.ui.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// T105 settings persistence. The OpenAI key is sensitive, so the backing file is
// EncryptedSharedPreferences (androidx.security-crypto, AES256-GCM under an Android Keystore
// master key). Keystore/Tink failures happen on some devices and after backup restores; in that
// case fall back to plain SharedPreferences rather than losing the AI feature entirely.
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "ai_settings",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (_: Exception) {
        context.getSharedPreferences("ai_settings_fallback", Context.MODE_PRIVATE)
    }

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_API_KEY, value.trim()).apply()
        }

    var model: String
        get() = prefs.getString(KEY_MODEL, DEFAULT_MODEL)?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_MODEL
        set(value) {
            prefs.edit().putString(KEY_MODEL, value.trim()).apply()
        }

    // The stored switch position; defaults ON (the feature only acts when a key exists anyway).
    var enrichmentEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENRICHMENT_ENABLED, true)
        set(value) {
            prefs.edit().putBoolean(KEY_ENRICHMENT_ENABLED, value).apply()
        }

    // The actual gate the capture path checks: switch ON and a key present.
    val enrichmentActive: Boolean
        get() = enrichmentEnabled && apiKey.isNotBlank()

    // T109: the selected layout/skin variant key (Ex3Skin.key, e.g. "warm_dark", "phosphor").
    // Mirrored into a StateFlow so the app root and the Settings picker re-compose live on change
    // (plain SharedPreferences has no compose-observable read).
    var skin: String
        get() = prefs.getString(KEY_SKIN, DEFAULT_SKIN)?.takeIf { it.isNotBlank() } ?: DEFAULT_SKIN
        set(value) {
            prefs.edit().putString(KEY_SKIN, value).apply()
            _skinFlow.value = value
        }

    private val _skinFlow = MutableStateFlow(skin)
    val skinFlow: StateFlow<String> = _skinFlow.asStateFlow()

    // B1: the day window ("Day" section in Settings) the capacity gauge derives from. Raw text is
    // stored as typed (write-through fields, no save button); the GETTERS validate, so readers —
    // the flow included — only ever see a well-formed HH:MM or the default.
    var dayStart: String
        get() = prefs.getString(KEY_DAY_START, DEFAULT_DAY_START)?.takeIf(::validHhMm) ?: DEFAULT_DAY_START
        set(value) {
            prefs.edit().putString(KEY_DAY_START, value.trim()).apply()
            _dayWindowFlow.value = dayStart to dayEnd
        }

    var dayEnd: String
        get() = prefs.getString(KEY_DAY_END, DEFAULT_DAY_END)?.takeIf(::validHhMm) ?: DEFAULT_DAY_END
        set(value) {
            prefs.edit().putString(KEY_DAY_END, value.trim()).apply()
            _dayWindowFlow.value = dayStart to dayEnd
        }

    private val _dayWindowFlow = MutableStateFlow(dayStart to dayEnd)

    // (start, end) as validated HH:MM strings; AppViewModel applies it to the engine on change.
    val dayWindowFlow: StateFlow<Pair<String, String>> = _dayWindowFlow.asStateFlow()

    companion object {
        const val DEFAULT_MODEL = "gpt-5.4-mini"
        const val DEFAULT_SKIN = "warm_dark"
        const val DEFAULT_DAY_START = "08:00"
        const val DEFAULT_DAY_END = "23:00"
        private const val KEY_API_KEY = "openai_api_key"
        private const val KEY_MODEL = "openai_model"
        private const val KEY_ENRICHMENT_ENABLED = "ai_enrichment_enabled"
        private const val KEY_SKIN = "today_skin"
        private const val KEY_DAY_START = "day_window_start"
        private const val KEY_DAY_END = "day_window_end"

        private val HH_MM = Regex("""^([01]\d|2[0-3]):[0-5]\d$""")
        private fun validHhMm(value: String): Boolean = HH_MM.matches(value.trim())
    }
}
