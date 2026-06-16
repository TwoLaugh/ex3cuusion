package com.twolaugh.ex3cuusion.ui.settings

import android.content.Context
import android.content.SharedPreferences
import android.provider.Telephony
import android.telecom.TelecomManager
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

    // Held for the allowlist seed, which needs to resolve the device's default SMS/dialer packages.
    private val appContext: Context = context.applicationContext

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

    // Launcher mode: the master toggle for the whole "Daybook is my home screen + enforced return"
    // feature. Defaults OFF — the feature is a hard no-op (no service, no notification) until the
    // user opts in. Mirrored into a StateFlow so MainActivity can start/stop the guard reactively
    // and Settings can re-compose live (same shape as skinFlow).
    var launcherEnabled: Boolean
        get() = prefs.getBoolean(KEY_LAUNCHER_ENABLED, false)
        set(value) {
            prefs.edit().putBoolean(KEY_LAUNCHER_ENABLED, value).apply()
            _launcherEnabledFlow.value = value
        }

    private val _launcherEnabledFlow = MutableStateFlow(launcherEnabled)
    val launcherEnabledFlow: StateFlow<Boolean> = _launcherEnabledFlow.asStateFlow()

    // Launcher mode: how long (in minutes) you may stay continuously in another app before the
    // phone is brought back to Today. Default 5, clamped 1..120 on read so the guard loop never
    // sees a junk/zero value (it reads this fresh every iteration so changes apply live).
    var returnTimeoutMinutes: Int
        get() = prefs.getInt(KEY_RETURN_TIMEOUT, DEFAULT_RETURN_TIMEOUT).coerceIn(1, 120)
        set(value) {
            prefs.edit().putInt(KEY_RETURN_TIMEOUT, value.coerceIn(1, 120)).apply()
        }

    // Launcher mode: the per-app allowlist. Starred apps are exempt from the return-bounce (the
    // guard reads this fresh each tick) and keep their notifications when the notif filter is on.
    // Stored as a StringSet of package names. Mirrored into a StateFlow so the Apps tab recomposes
    // its stars live as the user toggles them.
    //
    // First-read seeding: when the seeded boolean is still false we initialize the set to a sensible
    // default (common messengers + the device's default SMS/dialer apps), persist it, and mark
    // seeded. Gating on the boolean — not on emptiness — means a user who deliberately clears every
    // star is never re-seeded behind their back.
    var allowedApps: Set<String>
        get() {
            if (!prefs.getBoolean(KEY_ALLOWLIST_SEEDED, false)) {
                val seed = defaultAllowlistSeed()
                prefs.edit()
                    .putStringSet(KEY_ALLOWED_APPS, seed)
                    .putBoolean(KEY_ALLOWLIST_SEEDED, true)
                    .apply()
                return seed
            }
            return prefs.getStringSet(KEY_ALLOWED_APPS, emptySet())?.toSet() ?: emptySet()
        }
        set(value) {
            // Writing through also marks seeded so a later read never clobbers an explicit choice.
            prefs.edit()
                .putStringSet(KEY_ALLOWED_APPS, value)
                .putBoolean(KEY_ALLOWLIST_SEEDED, true)
                .apply()
            _allowedAppsFlow.value = value
        }

    private val _allowedAppsFlow = MutableStateFlow(allowedApps)
    val allowedAppsFlow: StateFlow<Set<String>> = _allowedAppsFlow.asStateFlow()

    // Add/remove a single package and write through (updates the flow). Used by the Apps-tab star.
    fun toggleAllowedApp(pkg: String) {
        val current = allowedApps
        allowedApps = if (pkg in current) current - pkg else current + pkg
    }

    // The seed set: common messengers/maps + the device's default SMS and dialer packages. Nulls
    // and blanks are filtered so devices missing an app simply seed fewer entries.
    private fun defaultAllowlistSeed(): Set<String> {
        val dynamic = mutableListOf<String?>()
        dynamic += try {
            Telephony.Sms.getDefaultSmsPackage(appContext)
        } catch (_: Exception) {
            null
        }
        dynamic += try {
            val telecom = appContext.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            telecom?.defaultDialerPackage
        } catch (_: Exception) {
            null
        }
        return (DEFAULT_ALLOWLIST + dynamic)
            .filterNotNull()
            .filter { it.isNotBlank() }
            .toSet()
    }

    // Launcher mode: when on, the NotificationFilterService dismisses notifications that aren't from
    // allowed apps / message+email+call categories. Default OFF (hard no-op). Mirrored to a flow so
    // Settings recomposes live (same shape as launcherEnabledFlow).
    var notificationFilterEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIF_FILTER, false)
        set(value) {
            prefs.edit().putBoolean(KEY_NOTIF_FILTER, value).apply()
            _notificationFilterEnabledFlow.value = value
        }

    private val _notificationFilterEnabledFlow = MutableStateFlow(notificationFilterEnabled)
    val notificationFilterEnabledFlow: StateFlow<Boolean> = _notificationFilterEnabledFlow.asStateFlow()

    companion object {
        const val DEFAULT_MODEL = "gpt-5.4-mini"
        const val DEFAULT_SKIN = "warm_dark"
        const val DEFAULT_DAY_START = "08:00"
        const val DEFAULT_DAY_END = "23:00"
        const val DEFAULT_RETURN_TIMEOUT = 5

        // Seed packages for the per-app allowlist (common messengers + maps). The default SMS and
        // dialer packages are resolved at seed time and unioned with these.
        val DEFAULT_ALLOWLIST = setOf(
            "com.whatsapp",
            "com.discord",
            "com.google.android.apps.maps"
        )

        private const val KEY_API_KEY = "openai_api_key"
        private const val KEY_MODEL = "openai_model"
        private const val KEY_ENRICHMENT_ENABLED = "ai_enrichment_enabled"
        private const val KEY_SKIN = "today_skin"
        private const val KEY_DAY_START = "day_window_start"
        private const val KEY_DAY_END = "day_window_end"
        private const val KEY_LAUNCHER_ENABLED = "launcher_enabled"
        private const val KEY_RETURN_TIMEOUT = "return_timeout_minutes"
        private const val KEY_ALLOWED_APPS = "allowed_apps"
        private const val KEY_ALLOWLIST_SEEDED = "allowlist_seeded"
        private const val KEY_NOTIF_FILTER = "notification_filter_enabled"

        private val HH_MM = Regex("""^([01]\d|2[0-3]):[0-5]\d$""")
        private fun validHhMm(value: String): Boolean = HH_MM.matches(value.trim())
    }
}
