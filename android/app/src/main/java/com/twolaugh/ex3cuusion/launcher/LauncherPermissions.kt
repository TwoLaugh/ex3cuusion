package com.twolaugh.ex3cuusion.launcher

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings

// Launcher mode: pure helpers around the special-access permissions the guard needs. None of these
// grant anything — they only REPORT current state and BUILD the deep-link intents the Settings
// screen fires so the user grants them in system settings.
object LauncherPermissions {

    // Usage access (a special-access op, not a runtime permission): without it
    // UsageStatsManager.queryEvents returns nothing and the guard can't see the foreground app.
    fun hasUsageAccess(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    // "Display over other apps" — what lets the guard's background activity-start (the force-return)
    // actually bring Daybook to the front from an FGS while another app is on screen.
    fun hasOverlay(context: Context): Boolean = Settings.canDrawOverlays(context)

    fun usageAccessIntent(): Intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)

    fun overlayIntent(context: Context): Intent =
        Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
        )

    // Where the user picks / relinquishes the default home app.
    fun homeSettingsIntent(): Intent = Intent(Settings.ACTION_HOME_SETTINGS)

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun batteryExemptionIntent(context: Context): Intent =
        Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${context.packageName}")
        )

    // The two permissions the guard truly cannot run without: see the foreground app (usage) and
    // pull Daybook forward (overlay). MainActivity/BootReceiver only start the service when both
    // are present.
    fun allReady(context: Context): Boolean = hasUsageAccess(context) && hasOverlay(context)
}
