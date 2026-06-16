package com.twolaugh.ex3cuusion.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.twolaugh.ex3cuusion.MainActivity
import com.twolaugh.ex3cuusion.ui.settings.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Launcher mode — the core mechanism. A specialUse foreground service runs a slow poll loop: it
// watches the foreground app via UsageStats, tracks how long you've been continuously away from
// Daybook in a "real" (non-exempt) app, and once that exceeds your configured limit it pulls
// Daybook back to the front on the Today page so you must deliberately re-search to re-enter an
// app. The whole thing only ever runs while launcherEnabled is true; flip it off and the loop
// stops the service.
class ReturnGuardService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // Continuous time (epoch millis) we've been in a non-exempt other app, or null when we're in
    // Daybook / an exempt app. The bounce fires when (now - awaySince) crosses the timeout.
    private var awaySince: Long? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundNotification()
        scope.launch { guardLoop() }
    }

    // The poll loop. Reads launcherEnabled + timeout fresh each tick so Settings changes apply live.
    private suspend fun guardLoop() {
        val settings = SettingsStore(applicationContext)
        val usage = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        var lastForeground: String? = null

        while (scope.isActive) {
            if (!settings.launcherEnabled) {
                stopSelf()
                return
            }

            val now = System.currentTimeMillis()
            val timeoutMillis = settings.returnTimeoutMinutes.toLong() * 60_000L

            // Most recent foreground package in the last 10s. Without usage access this returns
            // nothing (queryEvents is empty) — we keep the last known package and never crash.
            val foreground = currentForeground(usage, now) ?: lastForeground
            if (foreground != null) lastForeground = foreground

            when {
                foreground == null -> {
                    // No signal yet (no usage access, or nothing resumed in the window) — do nothing.
                }
                foreground == packageName -> {
                    // We're home. Reset the away clock.
                    awaySince = null
                }
                isExempt(foreground, applicationContext) -> {
                    // Phone call, dialer, system UI, or the real default home: never fought.
                    // Simplest correct behavior — pause by clearing the clock so exempt time never
                    // accumulates toward a bounce.
                    awaySince = null
                }
                else -> {
                    // A real other app. Start the clock if it isn't running; bounce once it expires.
                    val start = awaySince ?: now.also { awaySince = it }
                    if (now - start >= timeoutMillis) {
                        fireReturn()
                        awaySince = null
                    }
                }
            }

            delay(POLL_INTERVAL_MS)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Re-assert foreground (e.g. restarted after being killed); the loop is already running.
        startForegroundNotification()
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    // Scan the recent usage-event stream for the latest ACTIVITY_RESUMED / MOVE_TO_FOREGROUND and
    // return its package. Null if usage access is missing or the window held no such event.
    private fun currentForeground(usage: UsageStatsManager?, now: Long): String? {
        usage ?: return null
        val events = try {
            usage.queryEvents(now - USAGE_WINDOW_MS, now)
        } catch (e: Exception) {
            Log.w(TAG, "queryEvents failed", e)
            return null
        }
        val event = UsageEvents.Event()
        var latestPkg: String? = null
        var latestTs = Long.MIN_VALUE
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val isForeground = event.eventType == UsageEvents.Event.ACTIVITY_RESUMED ||
                event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
            if (isForeground && event.timeStamp >= latestTs) {
                latestTs = event.timeStamp
                latestPkg = event.packageName
            }
        }
        return latestPkg
    }

    // The "don't bounce" set. NOTE: maps / navigation apps are NOT exempt by default — the user
    // asked for an enforced return from everything. To let specific apps run uninterrupted (e.g.
    // Google Maps while driving), add a user-configurable allowlist check right here.
    private fun isExempt(pkg: String, context: Context): Boolean {
        if (pkg == context.packageName) return true
        // Don't interrupt an active call.
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val mode = audio?.mode
        if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION) return true
        // System UI / framework package.
        if (pkg == "android" || pkg == "com.android.systemui") return true
        // The default dialer is never fought (placing/receiving a call).
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        try {
            if (pkg == telecom?.defaultDialerPackage) return true
        } catch (_: SecurityException) {
            // defaultDialerPackage can throw on some OEMs without phone state — treat as not-dialer.
        }
        // If the user has chosen a DIFFERENT app as their default home, don't fight it (only matters
        // when Daybook is NOT the home app). When Daybook is home, this resolves to us and the
        // first check already handled it.
        val home = currentDefaultHome(context)
        if (home != null && home != context.packageName && pkg == home) return true
        return false
    }

    private fun currentDefaultHome(context: Context): String? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = context.packageManager.resolveActivity(intent, 0)
        return resolved?.activityInfo?.packageName
    }

    // Bring Daybook to the front on the Today page. With SYSTEM_ALERT_WINDOW granted this
    // background activity-start is permitted; singleTask + REORDER_TO_FRONT reuses the existing
    // instance (onNewIntent fires) instead of stacking a new one.
    private fun fireReturn() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra(EXTRA_FORCE_TODAY, true)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "force-return startActivity failed", e)
        }
    }

    private fun startForegroundNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Launcher focus guard",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Daybook as your intentional home screen."
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Daybook is guarding your focus")
            .setContentText("You'll be returned here after your limit on any app.")
            .setSmallIcon(com.twolaugh.ex3cuusion.R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val EXTRA_FORCE_TODAY = "force_today"
        private const val TAG = "ReturnGuardService"
        private const val CHANNEL_ID = "daybook_launcher"
        private const val NOTIFICATION_ID = 4201
        private const val POLL_INTERVAL_MS = 1_500L
        private const val USAGE_WINDOW_MS = 10_000L

        fun start(context: Context) {
            val intent = Intent(context, ReturnGuardService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ReturnGuardService::class.java))
        }

        // Start the guard iff the feature is on AND its required permissions are present; otherwise
        // ensure it's stopped. Called from Settings (on toggle) and MainActivity (reactively).
        fun syncWithSettings(context: Context, settings: SettingsStore) {
            if (settings.launcherEnabled && LauncherPermissions.allReady(context)) {
                start(context)
            } else {
                stop(context)
            }
        }
    }
}
