package com.example.starter.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.example.starter.R
import com.example.starter.ui.components.BarTab
import com.example.starter.ui.components.GlassBar
import com.example.starter.ui.components.rememberAppHaptics
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.orSnap
import com.example.starter.ui.motion.rememberReducedMotion
import com.example.starter.ui.nav.AppNavHost
import com.example.starter.ui.nav.LocalBackdrop
import com.example.starter.ui.nav.NavMotion
import com.example.starter.ui.nav.Route
import com.example.starter.ui.nav.rememberNavigator
import com.example.starter.ui.screens.DetailScreen
import com.example.starter.ui.screens.HomeScreen
import com.example.starter.ui.screens.SettingsScreen
import com.example.starter.ui.theme.AppIcons
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.ThemePreference
import dev.chrisbanes.haze.rememberHazeState

/**
 * A tab's label and glyph. The bar is built from Route.tabs, the one list of tabs, and this
 * `when` has no else: a new Route.Tab does not compile until it has a label and an icon here
 * (checklist: references/navigation-and-shared-elements.md, "Adding a tab or a page").
 */
@Composable
private fun tabLabel(tab: Route.Tab): String = when (tab) {
    Route.Home -> stringResource(R.string.tab_home)
    Route.Settings -> stringResource(R.string.tab_settings)
}

private fun tabIcon(tab: Route.Tab): ImageVector = when (tab) {
    Route.Home -> AppIcons.Home
    Route.Settings -> AppIcons.Settings
}

/** The last tab shown, so the bar keeps its selection while it slides away under a pushed page. */
private class LastTab(var tab: Route.Tab = Route.tabs.first())

/**
 * The shell. No Scaffold: a Box with the page host filling it and the glass bar as a
 * BottomCenter sibling drawn over the pages (both apps; dash:ui/navigation/DashNavigation.kt:378,502).
 * Pages scroll under the bar and reserve `barClearance()` themselves. Window insets are applied
 * by each page, never here, so every page decides what reaches under the system bars.
 *
 * The shell owns the one backdrop the bar blurs and provides it as [LocalBackdrop] to both the
 * page host and the bar. The page host must mark its page layer with `hazeSource` on this state
 * (`LocalBackdrop.current`), once, at the route boundary; a second source would draw the pages
 * into the blur twice.
 */
@Composable
fun StarterApp(preference: ThemePreference, onPreference: (ThemePreference) -> Unit) {
    val navigator = rememberNavigator()
    val haptics = rememberAppHaptics()
    val reduceMotion = rememberReducedMotion()
    val backdrop = rememberHazeState()
    val lastTab = remember { LastTab() }
    val current = navigator.current
    if (current is Route.Tab) lastTab.tab = current
    // Read here, where a route change recomposes, and captured by value below.
    val tabRoutes = Route.tabs
    val selected = tabRoutes.indexOf(lastTab.tab).coerceAtLeast(0)
    val labels = tabRoutes.map { tabLabel(it) }
    // Remembered on the labels (compared by value), so the bar gets the same list every route change.
    val tabs = remember(labels) { tabRoutes.mapIndexed { index, tab -> BarTab(labels[index], tabIcon(tab)) } }

    CompositionLocalProvider(LocalBackdrop provides backdrop, LocalReducedMotion provides reduceMotion) {
        Box(Modifier.fillMaxSize().background(AppTheme.colors.canvas)) {
            AppNavHost(navigator, Modifier.fillMaxSize()) { route ->
                when (route) {
                    Route.Home -> HomeScreen(onOpen = { id -> navigator.go(Route.Detail(id)) })
                    Route.Settings -> SettingsScreen(preference, onPreference)
                    is Route.Detail -> DetailScreen(route.id, onBack = { navigator.back() })
                }
            }
            // The bar belongs to the tab pages: a pushed page takes the whole screen, and the
            // bar leaves and returns on the push and pop clocks (dash:DashNavigation.kt:502-514).
            AnimatedVisibility(
                visible = current is Route.Tab,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically(orSnap(reduceMotion, tween(NavMotion.POP_MILLIS, easing = Easings.Arrive))) { it } +
                    fadeIn(orSnap(reduceMotion, tween(200))),
                exit = slideOutVertically(orSnap(reduceMotion, tween(NavMotion.PUSH_MILLIS * 2 / 3, easing = Easings.Arrive))) { it } +
                    fadeOut(orSnap(reduceMotion, tween(160))),
            ) {
                GlassBar(
                    tabs = tabs,
                    selected = selected,
                    onSelect = { index ->
                        // The shell decides whether a tap moved at all; a re-tap is silent (flick:FlickApp.kt:565-570).
                        if (index != selected) {
                            haptics.tabChange()
                            navigator.selectTab(tabRoutes[index])
                        }
                    },
                )
            }
        }
    }
}
