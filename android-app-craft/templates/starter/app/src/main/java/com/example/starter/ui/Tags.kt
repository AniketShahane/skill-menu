package com.example.starter.ui

/**
 * Every test tag the UI exposes, in one place, so a test and the screen it drives cannot
 * drift apart on a string. Tag what a test must find by identity; find everything else by
 * its text or its content description, which is what TalkBack reads.
 */
object Tags {
    const val BottomBar = "bottom_bar"
    const val HomeList = "home_list"
    const val SettingsList = "settings_list"
    const val DetailPage = "detail_page"
    const val HeroNumber = "hero_number"
    const val EmptyState = "empty_state"

    fun item(id: String) = "item_$id"
}
