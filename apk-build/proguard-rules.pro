-keep class com.suleiman.juzammapromax.** { *; }
-dontwarn android.webkit.**
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
