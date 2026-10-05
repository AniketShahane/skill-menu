package com.example.starter.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue

/**
 * A small explicit back stack: one tab at the bottom, pushed pages above it.
 *
 * Every entry carries a serial, handed out when the entry is added and never reused. A page's
 * remembered UI state (scroll position, a selected bar) is saved under [saveKey], which pairs the
 * route with that serial: going back to an entry finds the state it left, while opening the same
 * route again (a tab tap, the same item a second time) gets a new serial and starts from the top
 * (dash:ui/navigation/DashNavigation.kt:143-293; dash docs/upgrade-0.9.4/README.md:49-58).
 *
 * The navigator also remembers what the last navigation came from ([previous]) and which way it
 * went ([direction]), because the page that is now live cannot say what it is animating against.
 */
@Stable
class Navigator private constructor(initial: List<Route>, initialSerials: List<Int>) {

    /** Starts on [start]; a non-tab start gets the first tab beneath it, so back has somewhere to go. */
    constructor(start: Route = Route.Home) : this(
        if (start is Route.Tab) listOf(start) else listOf(Route.tabs.first(), start),
        emptyList(),
    )

    private val entries = mutableStateListOf<Route>()
    private val serials = mutableStateListOf<Int>()
    private var nextSerial = 0

    /** The newest serial per route key; a page animating out after its entry is gone keeps its key. */
    private val latestSerial = mutableStateMapOf<String, Int>()

    /** +1 after a push, -1 after a pop, otherwise the signed tab distance of the last tab switch. */
    var direction by mutableIntStateOf(0)
        private set

    /** The entry the last navigation came from: the other half of the transition now running. */
    var previous: Route? by mutableStateOf(null)
        private set

    /**
     * Whether the last navigation still has a card at the far end to fly to. False only for
     * [popToRoot] with `morphable = false` — leaving the page of an item just deleted — whose pop
     * slides, because pieces flying home to a card that is not there vanish in place.
     */
    var morphable by mutableStateOf(true)
        private set

    init {
        val routes = initial.ifEmpty { listOf(Route.tabs.first()) }
        val restored = if (initialSerials.size == routes.size) initialSerials else routes.indices.toList()
        nextSerial = restored.max() + 1
        routes.forEachIndexed { index, route -> add(route, restored[index]) }
    }

    val stack: List<Route> get() = entries
    val current: Route get() = entries.last()
    val tab: Route.Tab get() = entries.first() as? Route.Tab ?: Route.tabs.first()
    val depth: Int get() = entries.size
    val onTab: Boolean get() = entries.size == 1
    val canGoBack: Boolean get() = entries.size > 1 || tab != Route.tabs.first()

    /** The key [route]'s saved UI state lives under: its newest entry, or the entry it just left. */
    fun saveKey(route: Route): String = "${route.key}#${latestSerial[route.key] ?: 0}"

    /** The save keys of every entry on the stack; state under any other key is stale. */
    val saveKeys: List<String> get() = entries.mapIndexed { index, route -> "${route.key}#${serials[index]}" }

    /** A tab switches tabs; anything else is pushed. Pushing the page already on top does nothing. */
    fun go(route: Route) {
        if (route is Route.Tab) {
            selectTab(route)
            return
        }
        if (current.key == route.key) return
        leave(from = current)
        direction = 1
        addNew(route)
    }

    fun back(): Boolean = when {
        entries.size > 1 -> pop()
        tab != Route.tabs.first() -> {
            selectTab(Route.tabs.first())
            true
        }
        else -> false
    }

    /**
     * Shows [tab] with nothing above it. Choosing the tab already shown with nothing above it
     * restarts that page from the top with no transition (same key, new serial).
     */
    fun selectTab(tab: Route.Tab) {
        val delta = Route.tabs.indexOf(tab).compareTo(Route.tabs.indexOf(this.tab))
        if (delta == 0 && entries.size == 1) {
            refreshTop()
            return
        }
        leave(from = current)
        direction = if (delta == 0) -1 else delta
        while (entries.isNotEmpty()) removeTop()
        addNew(tab)
    }

    /** Back to the tab at the bottom. Pass `morphable = false` when the page being left has no card to return to. */
    fun popToRoot(morphable: Boolean = true) {
        if (entries.size <= 1) return
        leave(from = current, morphable = morphable)
        direction = -1
        while (entries.size > 1) removeTop()
    }

    private fun pop(): Boolean {
        if (entries.size <= 1) return false
        leave(from = current)
        direction = -1
        removeTop()
        return true
    }

    /** Records what the next transition animates against, before the stack stops saying so. */
    private fun leave(from: Route?, morphable: Boolean = true) {
        previous = from
        this.morphable = morphable
    }

    private fun refreshTop() {
        val route = current
        removeTop()
        addNew(route)
    }

    private fun add(route: Route, serial: Int) {
        entries.add(route)
        serials.add(serial)
        latestSerial[route.key] = serial
    }

    private fun addNew(route: Route) = add(route, nextSerial++)

    private fun removeTop() {
        entries.removeAt(entries.lastIndex)
        serials.removeAt(serials.lastIndex)
    }

    /**
     * Each entry as "serial@route". The serials travel with the stack so that after process death
     * every restored page finds its saved state under the same key, and no key can collide with
     * one a different page used before.
     */
    fun saved(): List<String> = entries.mapIndexed { index, route -> "${serials[index]}@${Route.encode(route)}" }

    companion object {
        fun restore(saved: List<String>): Navigator {
            val restored = saved.mapNotNull { text ->
                val serial = text.substringBefore('@', "").toIntOrNull()
                val route = Route.decode(if (serial == null) text else text.substringAfter('@')) ?: return@mapNotNull null
                route to serial
            }
            val routes = restored.map { it.first }
            val serials = restored.map { it.second }
            val valid = routes.isNotEmpty() && routes.first() is Route.Tab
            return Navigator(
                if (valid) routes else emptyList(),
                if (valid && serials.all { it != null }) serials.filterNotNull() else emptyList(),
            )
        }
    }
}

/** The app's navigator, surviving rotation and process death. */
@Composable
fun rememberNavigator(): Navigator = rememberSaveable(
    saver = listSaver(save = { it.saved() }, restore = { Navigator.restore(it) }),
) { Navigator() }
