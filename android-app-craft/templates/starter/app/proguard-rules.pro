# R8 rules for the app. The release build runs R8 in full mode, so anything reached by name
# rather than by a static reference has to be named here.
#
# Bias: keep too much rather than too little. A release APK a few hundred kilobytes larger is
# not a defect; one that crashes on the first screen that uses reflection is
# (flick:sender/proguard-rules.pro:1-6).

# Readable failure diagnostics. Stack traces keep file and line; exception class names survive
# so a log line or an in-app diagnostics screen that shows `e.javaClass.simpleName` still says
# something (flick:sender/proguard-rules.pro:8-13).
-keepnames class * extends java.lang.Throwable
-keepattributes SourceFile,LineNumberTable,Signature,Exceptions,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# --- Name-based code: pin every class the app compares or loads by its name -----------------
# R8 renames silently, so `cause.javaClass.name == "..."` and Class.forName("...") keep compiling
# and quietly stop matching. Flick pins the one Media3 exception its failure classifier compares
# by name; renaming it "reclassifies every container rejection as MALFORMED_MEDIA"
# (flick:receiver/proguard-rules.pro:15-19). Add one line per such class:
#-keepnames class androidx.media3.exoplayer.source.UnrecognizedInputFormatException

# --- Library blocks: uncomment the ones this app actually depends on ------------------------
# Each exists because the library finds classes through reflection or service lookups R8 cannot
# follow. Most AndroidX and Compose artifacts ship their own consumer rules and need nothing here.

# Ktor 3 (CIO server/client, websockets): engines, plugin keys and coroutine internals are
# resolved through type tokens and service lookups (flick:sender/proguard-rules.pro:15-23).
#-keep class io.ktor.** { *; }
#-keep class kotlinx.coroutines.** { *; }
#-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
#-dontwarn io.ktor.**
#-dontwarn kotlinx.coroutines.**
#-dontwarn kotlinx.io.**

# slf4j (Ktor's logging backend), found through META-INF/services, never by reference.
#-keep class org.slf4j.** { *; }
#-dontwarn org.slf4j.**

# kotlinx-serialization: keeps generated serializers for @Serializable types in this package.
#-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
#-keepclassmembers class com.example.starter.** { *** Companion; }
#-keepclasseswithmembers class com.example.starter.** { kotlinx.serialization.KSerializer serializer(...); }
#-keep,includedescriptorclasses class com.example.starter.**$$serializer { *; }
#-dontwarn kotlinx.serialization.**

# ML Kit (bundled model): the runtime instantiates its scanner classes reflectively.
#-keep class com.google.mlkit.** { *; }
#-keep class com.google.android.gms.internal.mlkit_** { *; }
#-keep class com.google.android.odml.** { *; }
#-dontwarn com.google.mlkit.**
#-dontwarn com.google.android.gms.**

# JNI: native code reaches Kotlin classes by name (Dash 0.9.1 kept its speech engine's package
# for this reason, dash@3b9c234). Name the package and keep @Keep members.
#-keep class com.vendor.native.** { *; }

# --- -dontwarn policy: narrow, by name -----------------------------------------------------
# A -dontwarn silences R8's "missing class" error. Name only classes that genuinely cannot exist
# on Android (JVM-only and annotation-only references pulled in transitively). Never widen to a
# package that IS on the classpath: Flick lists Media3 siblings one by one because the wide form
# "also covers media3-common and media3-session, which ARE on this classpath, so a genuinely
# missing class ... would be silenced" (flick:sender/proguard-rules.pro:43-51).
#-dontwarn java.lang.ClassValue
#-dontwarn javax.annotation.**
#-dontwarn org.checkerframework.**
#-dontwarn com.google.errorprone.annotations.**
#-dontwarn com.google.j2objc.annotations.**
#-dontwarn org.conscrypt.**
#-dontwarn org.bouncycastle.**
#-dontwarn org.openjsse.**
