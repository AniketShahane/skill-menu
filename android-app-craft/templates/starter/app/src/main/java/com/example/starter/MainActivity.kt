package com.example.starter

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.core.view.WindowCompat
import com.example.starter.ui.StarterApp
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.ThemeStore
import com.example.starter.ui.theme.startFontWarmup

/**
 * The one activity. It owns the window contract and nothing else: the palette, the bar icons
 * and the window plate are kept in step by the outermost [AppTheme]; screens pad for their own
 * insets.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Before decor creation: early Android 15 otherwise restores stale insets on a reused
        // window and ignores later calls once edge-to-edge is enforced
        // (dash:app/src/main/java/com/dash/run/MainActivity.kt:21-24).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        super.onCreate(savedInstanceState)

        // Both scrims transparent: the default derives a near-opaque band from the system's night
        // mode, which arrives white under a Dark choice on a light phone. Icon contrast is
        // AppTheme's job, from the resolved palette (flick:sender/.../MainActivity.kt, edge-to-edge).
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        // Otherwise the platform paints its own translucent band behind the navigation bar,
        // across the floating bar and whatever scrolls under it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }

        // Started before setContent and off the main thread, so it races the first composition
        // instead of joining it; losing the race costs nothing (flick:receiver/.../MainActivity.kt:46-53).
        startFontWarmup(applicationContext)

        // Read synchronously, before setContent: the first frame is already a palette, and a read
        // deferred to a background thread would paint the system's answer and then flip to the
        // user's. One short string from a one-key prefs file.
        val store = ThemeStore(this)
        val preference = mutableStateOf(store.load())

        setContent {
            AppTheme(preference.value) {
                StarterApp(
                    preference = preference.value,
                    onPreference = { chosen ->
                        preference.value = chosen
                        store.save(chosen)
                    },
                )
            }
        }
    }
}
