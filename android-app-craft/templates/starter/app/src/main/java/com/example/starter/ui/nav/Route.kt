package com.example.starter.ui.nav

/**
 * Every destination in the app. Pure Kotlin, so NavMotion's rules over it run on the plain JVM.
 *
 * [key] is a route's identity: it keys AnimatedContent, the page's RevealSession and the shared
 * element namespace. Two routes with the same key are the same page.
 */
sealed interface Route {
    val key: String

    /** A top-level destination in the bottom bar. [tabs] is the bar's order, left to right. */
    sealed interface Tab : Route

    data object Home : Tab {
        override val key: String get() = "tab:home"
    }

    data object Settings : Tab {
        override val key: String get() = "tab:settings"
    }

    /** One item's page, opened from its card. */
    data class Detail(val id: String) : Route {
        override val key: String get() = "detail:$id"
    }

    companion object {
        /** The bar's order. A tab switch slides in this order; back from any other tab goes to the first. */
        val tabs: List<Tab> get() = listOf(Home, Settings)

        fun encode(route: Route): String = when (route) {
            Home -> "home"
            Settings -> "settings"
            is Detail -> "detail|${route.id}"
        }

        fun decode(text: String): Route? = when {
            text == "home" -> Home
            text == "settings" -> Settings
            text.startsWith("detail|") -> Detail(text.substringAfter('|'))
            else -> null
        }
    }
}
