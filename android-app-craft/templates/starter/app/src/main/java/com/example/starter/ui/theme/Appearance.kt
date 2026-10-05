package com.example.starter.ui.theme

import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.Context
import android.os.Build

/**
 * What the user asked the app to look like. [SYSTEM] is the default because following the
 * platform is what someone who has never opened the setting already expects.
 *
 * [stored] is the on-disk spelling, deliberately not derived from the entry name: renaming an
 * entry is a refactor, and it must not silently reset the choice on every phone that made it
 * (flick: sender/.../Appearance.kt:14-17; Dash stored `Appearance.name` and is exposed to
 * exactly that, dash: ui/Theme.kt:33-38).
 */
enum class ThemePreference(val stored: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    /**
     * The whole resolution rule, free of Compose and of a Context so it is decidable anywhere.
     * [systemInDark] is consulted for [SYSTEM] alone: an explicit choice is an override.
     */
    fun resolvesDark(systemInDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemInDark
        LIGHT -> false
        DARK -> true
    }

    companion object {
        /**
         * A value this build does not recognise (a corrupt file, or one written by a later
         * version with an entry this one lacks) resolves to [SYSTEM]. An appearance
         * preference is never worth failing to launch over.
         */
        fun fromStored(raw: String?): ThemePreference =
            ThemePreference.entries.firstOrNull { it.stored == raw } ?: SYSTEM
    }
}

/**
 * Where the appearance choice lives. It lives in two places, and this class writes both:
 * a one-key SharedPreferences file, and (API 31+) the platform's per-app night mode, which is
 * the only thing that can reach the cold-start plate and the splash, because both are read
 * before this process exists.
 *
 * Read [load] synchronously before the first composition (MainActivity does). The first frame
 * is already a palette, and a load deferred off the main thread would paint the system's
 * answer and then flip to the user's. It is one short string.
 *
 * MANIFEST REQUIREMENT: MainActivity must list `uiMode` in `android:configChanges`. Setting
 * the per-app night mode is a configuration change; without it the activity is recreated on
 * the tap that changed the theme, restarting every transition in flight
 * (flick: sender/.../MainActivity.kt:190-193).
 */
class ThemeStore(context: Context) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /**
     * The stored choice, or [ThemePreference.SYSTEM]. Also re-asserts the platform night mode,
     * because the file can arrive without it: a prefs file restored from a backup lands on a
     * phone the platform override has never been told about. A no-op when nothing changed.
     */
    fun load(): ThemePreference {
        val preference = ThemePreference.fromStored(prefs.getString(KEY, null))
        applyApplicationNightMode(app, preference)
        return preference
    }

    /**
     * `commit` rather than `apply`: the write is one short string, and it has to be on disk
     * before the process can be killed. A preference that loses the tap that set it is worse
     * than no preference (flick: sender/.../Appearance.kt:64-69). Lint's ApplySharedPref
     * warning is suppressed for that reason, not by accident.
     */
    @SuppressLint("ApplySharedPref")
    fun save(preference: ThemePreference) {
        prefs.edit().putString(KEY, preference.stored).commit()
        applyApplicationNightMode(app, preference)
    }

    private companion object {
        const val FILE = "appearance"
        const val KEY = "theme"
    }
}

/**
 * Hands the choice to the platform's per-app night mode, so the system resolves this app's
 * `-night` resources from it: the window plate and the API 31+ splash. It persists per package
 * and governs every launch after the one it was set on.
 *
 * `MODE_NIGHT_AUTO` is the value that stores NO override, which is what "Match system" has to
 * mean. An app that left `MODE_NIGHT_NO` behind would ignore the phone's night mode forever.
 *
 * Below API 31 there is no per-app night mode short of AppCompat, which this app does not use.
 * There the plate keeps following the phone, and AppTheme's window repaint is the earliest
 * frame the preference owns (flick: sender/.../MainActivity.kt:167-205).
 */
internal fun applyApplicationNightMode(context: Context, preference: ThemePreference) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val modes = context.getSystemService(UiModeManager::class.java) ?: return
    // Called on every launch, unguarded, as Flick ships it. `modes.nightMode` is not a safe
    // guard: it is documented as the device's configured mode, not this app's override.
    modes.setApplicationNightMode(
        when (preference) {
            ThemePreference.SYSTEM -> UiModeManager.MODE_NIGHT_AUTO
            ThemePreference.LIGHT -> UiModeManager.MODE_NIGHT_NO
            ThemePreference.DARK -> UiModeManager.MODE_NIGHT_YES
        },
    )
}
