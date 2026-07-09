package com.twolaugh.ex3cuusion.launcher

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.twolaugh.ex3cuusion.ui.settings.SettingsStore

// Launcher mode — the notification side of "intentional phone use". When the user turns the filter
// on (and grants Notification access), every posted notification that ISN'T from an allowed app or
// a message/email/call category is dismissed, so the phone stays quiet between deliberate visits.
//
// NOTE: this is dismiss-ON-POST — cancelling after the fact is the only mechanism a non-system app
// has. On some OEMs a brief heads-up flash can still appear before we cancel it.
class NotificationFilterService : NotificationListenerService() {

    // Cached on connect so onNotificationPosted doesn't rebuild it per notification. The store reads
    // its toggle/allowlist fresh from prefs each access, so a cached instance still sees live edits.
    private var settings: SettingsStore? = null

    override fun onListenerConnected() {
        super.onListenerConnected()
        settings = SettingsStore(applicationContext)
        Log.d(TAG, "listener connected")
    }

    override fun onListenerDisconnected() {
        Log.d(TAG, "listener disconnected")
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val store = settings ?: SettingsStore(applicationContext).also { settings = it }
            // Hard no-op when the filter is off.
            if (!store.notificationFilterEnabled) return
            if (shouldKeep(sbn, store.allowedApps)) return
            cancelNotification(sbn.key)
        } catch (e: Exception) {
            Log.w(TAG, "onNotificationPosted failed", e)
        }
    }

    // KEEP (do NOT cancel) if ANY rule matches. Everything else is dismissed.
    private fun shouldKeep(sbn: StatusBarNotification, allowed: Set<String>): Boolean {
        // 1. Our own notifications (e.g. the guard's foreground notification).
        if (sbn.packageName == packageName) return true

        val notification = sbn.notification
        val flags = notification?.flags ?: 0

        // 2. Ongoing / system-ish: never tear down persistent or non-clearable notifications.
        if (sbn.isOngoing) return true
        if (flags and Notification.FLAG_ONGOING_EVENT != 0) return true
        if (flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return true
        if (!sbn.isClearable) return true

        // 3. Core system packages.
        if (sbn.packageName == "android" || sbn.packageName == "com.android.systemui") return true

        // 4. User-starred apps.
        if (sbn.packageName in allowed) return true

        // 5. Known email/messaging safety-net packages.
        if (sbn.packageName in SAFETY_NET_PACKAGES) return true

        // 6. Message / email / call (and a few time-sensitive) categories.
        val category = notification?.category
        if (category in KEPT_CATEGORIES) return true

        return false
    }

    companion object {
        private const val TAG = "NotifFilterService"

        // Email/messaging apps we always keep even if the user hasn't starred them — a safety net so
        // turning the filter on never silently swallows real messages from a stock app.
        private val SAFETY_NET_PACKAGES = setOf(
            "com.google.android.gm",                  // Gmail
            "com.microsoft.office.outlook",           // Outlook
            "com.samsung.android.email.provider",     // Samsung Email
            "com.google.android.apps.messaging",      // Google Messages
            "com.samsung.android.messaging"           // Samsung Messages
        )

        private val KEPT_CATEGORIES = setOf(
            Notification.CATEGORY_CALL,
            Notification.CATEGORY_MISSED_CALL,
            Notification.CATEGORY_MESSAGE,
            Notification.CATEGORY_EMAIL,
            Notification.CATEGORY_ALARM,
            Notification.CATEGORY_REMINDER,
            Notification.CATEGORY_EVENT
        )
    }
}
