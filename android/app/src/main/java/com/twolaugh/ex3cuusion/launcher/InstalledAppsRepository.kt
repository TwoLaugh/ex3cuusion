package com.twolaugh.ex3cuusion.launcher

import android.content.Context
import android.content.Intent
import android.graphics.drawable.Drawable

// Launcher mode: discovers the launchable apps on the device for the "Apps" tab, and builds the
// launch intents. Loading is heavy (icon + label decode for hundreds of apps), so the result is
// process-cached behind a lock — re-entering the Apps tab is then instant.
data class LaunchableApp(
    val packageName: String,
    val label: String,
    val icon: Drawable
)

object InstalledAppsRepository {

    // Process-level cache so re-selecting the Apps tab doesn't re-scan the whole device.
    private val lock = Any()
    @Volatile private var cached: List<LaunchableApp>? = null

    // The full launchable-app list, sorted by label (case-insensitive), our own package excluded
    // and packages deduped. Cached after the first successful load; pass forceReload to rebuild
    // (e.g. an app was installed while the tab was open).
    fun loadApps(context: Context, forceReload: Boolean = false): List<LaunchableApp> {
        if (!forceReload) cached?.let { return it }
        synchronized(lock) {
            if (!forceReload) cached?.let { return it }
            val pm = context.packageManager
            val mainLauncher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val ours = context.packageName
            val seen = HashSet<String>()
            val apps = pm.queryIntentActivities(mainLauncher, 0)
                .asSequence()
                .mapNotNull { it.activityInfo }
                .filter { it.packageName != ours }
                .filter { seen.add(it.packageName) } // dedupe by package
                .map { info ->
                    LaunchableApp(
                        packageName = info.packageName,
                        label = info.loadLabel(pm).toString(),
                        icon = info.loadIcon(pm)
                    )
                }
                .sortedBy { it.label.lowercase() }
                .toList()
            cached = apps
            return apps
        }
    }

    // The system launch intent for a package, flagged NEW_TASK so it can start from any context.
    // Null if the package has no launcher entry (was uninstalled, or is a non-launchable system pkg).
    fun launchIntentFor(context: Context, packageName: String): Intent? =
        context.packageManager.getLaunchIntentForPackage(packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
