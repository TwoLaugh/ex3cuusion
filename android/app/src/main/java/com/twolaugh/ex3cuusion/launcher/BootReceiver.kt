package com.twolaugh.ex3cuusion.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.twolaugh.ex3cuusion.ui.settings.SettingsStore

// Launcher mode: after a reboot, bring the guard back up if the feature is still on and its
// permissions survived. Inert otherwise (the common case — Launcher mode is off by default).
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val settings = SettingsStore(context.applicationContext)
        if (settings.launcherEnabled && LauncherPermissions.allReady(context)) {
            ReturnGuardService.start(context.applicationContext)
        }
    }
}
