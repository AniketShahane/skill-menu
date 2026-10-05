pluginManagement {
    repositories {
        // Scoped so a plugin id cannot be answered by the wrong repository
        // (flick:settings.gradle.kts:1-13).
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Every repository is declared here; a module that adds its own fails the build.
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Starter"

include(":app")

// The baseline-profile producer. One com.android.test module names exactly one
// targetProjectPath, so a second app module needs a second producer. Nothing on the
// `assemble*` path depends on it (flick:settings.gradle.kts:28-31).
include(":baselineprofile")
