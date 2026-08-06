package com.suleiman.juzammapromax;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String APP_URL = "https://juz-amma-pro-max.vercel.app";
    private SharedPreferences prefs;

    // All permissions to request at startup
    private final String[] ALL_PERMISSIONS = {
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.WRITE_CONTACTS,
        Manifest.permission.READ_CALENDAR,
        Manifest.permission.WRITE_CALENDAR,
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_SMS,
        Manifest.permission.CALL_PHONE,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.POST_NOTIFICATIONS,
        Manifest.permission.READ_MEDIA_IMAGES,
        Manifest.permission.READ_MEDIA_VIDEO,
        Manifest.permission.READ_MEDIA_AUDIO,
        Manifest.permission.BODY_SENSORS,
        Manifest.permission.ACTIVITY_RECOGNITION,
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        prefs = getSharedPreferences("JuzAmmaPrefs", MODE_PRIVATE);

        // Create notification channel for Azan
        createNotificationChannel();

        // Request all permissions
        requestAllPermissions();

        // Request battery optimization exemption
        requestBatteryOptimizationExemption();

        // Set up WebView
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        // Enable hardware acceleration
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

        // JavaScript bridge for native alarm scheduling
        webView.addJavascriptInterface(new AzanBridge(), "AndroidBridge");

        // Geolocation support
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        // Handle URL loading inside the app
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Keep internal links inside WebView
                if (uri.getHost() != null && (uri.getHost().contains("vercel.app") || uri.getHost().contains("juz-amma"))) {
                    return false;
                }
                // Open external links in browser
                Intent i = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(i);
                return true;
            }
        });

        // Load the app
        webView.loadUrl(APP_URL);
    }

    // JavaScript bridge — callable from web code as AndroidBridge.methodName()
    private class AzanBridge {

        @JavascriptInterface
        public void scheduleAlarm(String prayerName, String timeStr, int hour, int minute) {
            // Schedule exact alarm using AlarmManager
            Intent intent = new Intent(MainActivity.this, AzanAlarmReceiver.class);
            intent.putExtra("prayer_name", prayerName);
            intent.putExtra("time_str", timeStr);

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                MainActivity.this,
                prayerName.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

            // Set the alarm time for today (or tomorrow if already passed)
            java.util.Calendar calendar = java.util.Calendar.getInstance();
            calendar.set(java.util.Calendar.HOUR_OF_DAY, hour);
            calendar.set(java.util.Calendar.MINUTE, minute);
            calendar.set(java.util.Calendar.SECOND, 0);
            if (calendar.getTimeInMillis() < System.currentTimeMillis()) {
                calendar.add(java.util.Calendar.DAY_OF_YEAR, 1);
            }

            // Use exact alarm (requires SCHEDULE_EXACT_ALARM on Android 12+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        calendar.getTimeInMillis(),
                        pendingIntent
                    );
                }
            } else {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    calendar.getTimeInMillis(),
                    pendingIntent
                );
            }

            // Save alarm to SharedPreferences for restoration after reboot
            prefs.edit()
                .putString("alarm_" + prayerName, timeStr)
                .putInt("alarm_" + prayerName + "_h", hour)
                .putInt("alarm_" + prayerName + "_m", minute)
                .putBoolean("azan_enabled", true)
                .apply();
        }

        @JavascriptInterface
        public void cancelAlarm(String prayerName) {
            Intent intent = new Intent(MainActivity.this, AzanAlarmReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                MainActivity.this,
                prayerName.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            alarmManager.cancel(pendingIntent);
            prefs.edit().remove("alarm_" + prayerName).apply();
        }

        @JavascriptInterface
        public void cancelAllAlarms() {
            String[] prayers = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
            for (String p : prayers) cancelAlarm(p);
            prefs.edit().putBoolean("azan_enabled", false).apply();
        }

        @JavascriptInterface
        public boolean canScheduleExactAlarms() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                return am.canScheduleExactAlarms();
            }
            return true;
        }

        @JavascriptInterface
        public void requestExactAlarmPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:" + getPackageName())));
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String getSavedAlarms() {
            String[] prayers = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
            StringBuilder sb = new StringBuilder("{");
            for (int i = 0; i < prayers.length; i++) {
                if (i > 0) sb.append(",");
                sb.append("\"").append(prayers[i]).append("\":\"")
                  .append(prefs.getString("alarm_" + prayers[i], "")).append("\"");
            }
            sb.append(",\"azanEnabled\":").append(prefs.getBoolean("azan_enabled", false));
            sb.append("}");
            return sb.toString();
        }

        @JavascriptInterface
        public void vibrate(long[] pattern) {
            android.os.Vibrator v = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                v.vibrate(pattern, -1);
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "azan_channel",
                "Azan Alarm",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Azan prayer time notifications");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{500, 200, 500, 200, 500});
            channel.enableLights(true);
            channel.setShowBadge(true);

            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }

    private void requestAllPermissions() {
        List<String> toRequest = new ArrayList<>();
        for (String perm : ALL_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(perm);
            }
        }
        if (!toRequest.isEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toArray(new String[0]), 100);
        }
    }

    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:" + getPackageName())));
                } catch (Exception e) {
                    // Some devices may not support this
                }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Don't pause the WebView — allows background audio/JS to keep running
        // For PWA wrapper, we keep it active
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Restore alarms from SharedPreferences
        if (prefs.getBoolean("azan_enabled", false)) {
            String[] prayers = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
            for (String p : prayers) {
                int h = prefs.getInt("alarm_" + p + "_h", -1);
                int m = prefs.getInt("alarm_" + p + "_m", -1);
                if (h >= 0 && m >= 0) {
                    Intent intent = new Intent(this, AzanAlarmReceiver.class);
                    intent.putExtra("prayer_name", p);
                    PendingIntent pi = PendingIntent.getBroadcast(this, p.hashCode(), intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                    java.util.Calendar cal = java.util.Calendar.getInstance();
                    cal.set(java.util.Calendar.HOUR_OF_DAY, h);
                    cal.set(java.util.Calendar.MINUTE, m);
                    cal.set(java.util.Calendar.SECOND, 0);
                    if (cal.getTimeInMillis() < System.currentTimeMillis()) {
                        cal.add(java.util.Calendar.DAY_OF_YEAR, 1);
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                    } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
                    }
                }
            }
        }
    }
}
