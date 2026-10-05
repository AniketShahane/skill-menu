package com.flick.sender.ui.theme

import android.content.Context
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * What the user asked Flick to look like on this phone. [SYSTEM] is the default because
 * following the platform is what someone who has never opened the row already expects.
 *
 * [stored] is the on-disk spelling, deliberately not derived from the entry name: renaming
 * an entry is a refactor, and it must not silently reset the choice on every phone that
 * made it.
 */
enum class ThemePreference(val stored: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    /**
     * The whole resolution rule, kept free of Compose and of a Context so it is decidable
     * anywhere. [systemInDark] is consulted for [SYSTEM] alone — an explicit choice is an
     * override, so the platform's night mode must not reach it.
     */
    fun resolvesDark(systemInDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemInDark
        LIGHT -> false
        DARK -> true
    }

    companion object {
        /**
         * A value this build does not recognise — a corrupt file, or one written by a
         * later version carrying an entry this one lacks — resolves to [SYSTEM]. An
         * appearance preference is never worth failing to launch over.
         */
        fun fromStored(raw: String?): ThemePreference =
            ThemePreference.entries.firstOrNull { it.stored == raw } ?: SYSTEM
    }
}

/**
 * The choice [FlickTheme] resolves against. Static, because a change to it repaints every
 * surface in the tree — which is exactly what a palette swap is, so there is nothing to
 * spare by tracking readers individually.
 *
 * The default is [ThemePreference.SYSTEM] so a tree that provides nothing — an
 * instrumentation harness pinning a palette, a preview — behaves as the app did before
 * the preference existed, including inside [FlickCinematicTheme], which reads this too.
 *
 * What that read does NOT decide is whether those screens are dark. Now Playing, the
 * connecting overlay and the quality sheet are dark by design and not by preference, and
 * their surfaces are the same navy either way. It picks the brand ASSIGNMENT only, because
 * the action colour has to be one colour at any instant across the whole app: those screens
 * draw `primary`, so pinning them to one assignment would give a user a gold CTA on every
 * other screen and a blue one inside a sheet.
 */
val LocalThemePreference = staticCompositionLocalOf { ThemePreference.SYSTEM }

/**
 * Appearance persistence, alongside `PairingStore` and `SubtitleFolderStore` and written
 * the same way. `commit` rather than `apply`: the write is one short string into a
 * one-key file, and the choice has to be on disk before the process can be killed —
 * a preference that loses the tap that set it is worse than no preference.
 */
class ThemeStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("flick_appearance", Context.MODE_PRIVATE)

    fun preference(): ThemePreference = ThemePreference.fromStored(prefs.getString(THEME, null))

    fun save(preference: ThemePreference): Boolean =
        prefs.edit().putString(THEME, preference.stored).commit()

    private companion object { const val THEME = "theme" }
}

/**
 * The live choice, held as snapshot state so a tap in Settings lands on the next frame
 * rather than through an activity recreate — a recreate would restart every route
 * transition the shell is holding, in the middle of a cast.
 *
 * [initial] is read before the first composition, in `MainActivity.onCreate`: the opening
 * frame is already a palette, and a load deferred off the main thread would paint the
 * system's answer and then flip to the user's.
 */
@Stable
class AppearanceController(
    initial: ThemePreference,
    private val persist: (ThemePreference) -> Unit,
) {

    var preference: ThemePreference by mutableStateOf(initial)
        private set

    fun select(choice: ThemePreference) {
        // Re-selecting the segment that is already lit is not a write: it would rewrite
        // the same value on every stray tap of a control the user is reading, not using.
        if (choice == preference) return
        preference = choice
        persist(choice)
    }
}
