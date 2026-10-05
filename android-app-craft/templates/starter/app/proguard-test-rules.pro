# Rules for the instrumentation APK when it is built against the minified release app
# (-PappTestRelease=true). Test-only annotation processors reference compiler classes that never
# exist on a device (dash:app/proguard-test-rules.pro).
-dontwarn javax.lang.model.element.Modifier
