package com.suleiman.juzammapromax;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import androidx.core.app.NotificationCompat;
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
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Surface;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.util.Locale;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity implements TextToSpeech.OnInitListener, SensorEventListener {

    private WebView webView;
    private static final String APP_URL = "https://juz-amma-pro-max.vercel.app";
    private SharedPreferences prefs;
    private TextToSpeech nativeTts;
    private boolean nativeTtsReady = false;

    // ===== Native compass (fixes jittery/unstable WebView deviceorientation) =====
    // Real compass apps fuse accelerometer + gyroscope + magnetometer via the
    // Rotation Vector sensor, which is FAR more stable than the browser's
    // deviceorientation event inside a WebView. We read it natively here and
    // push clean, low-pass-filtered heading values into the web page.
    private SensorManager sensorManager;
    private Sensor rotationVectorSensor;
    private Sensor accelerometerSensor;
    private Sensor magnetometerSensor;
    private boolean hasRotationVectorSensor = false;
    private boolean compassActive = false;
    private final float[] rotationVectorReading = new float[5];
    private final float[] accelReading = new float[3];
    private final float[] magnetReading = new float[3];
    private boolean haveAccel = false;
    private boolean haveMagnet = false;
    private float smoothSin = 0f;
    private float smoothCos = 1f;
    private boolean smoothInit = false;
    private long lastCompassSendMs = 0L;
    private double userLat = 0;
    private double userLon = 0;
    private float magneticDeclination = 0f;
    private boolean haveDeclination = false;

    // All permissions to request at startup
    private final String[] ALL_PERMISSIONS = {
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.POST_NOTIFICATIONS
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
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE); // always hit network — avoids the app getting stuck on old cached builds
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);

        // Set mobile user agent so Google Qibla Finder (and other mobile-only sites)
        // serve the mobile experience instead of the desktop "go to mobile" message.
        String ua = settings.getUserAgentString();
        if (ua != null && ua.contains("Mobile")) {
            // Already mobile — keep as-is
        } else {
            // Force mobile UA by adding Mobile token
            settings.setUserAgentString(ua + " Mobile");
        }

        // Enable hardware acceleration
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);

        // JavaScript bridge for native alarm scheduling
        webView.addJavascriptInterface(new AzanBridge(), "AndroidBridge");

        // Native Android Text-to-Speech — used because the plain WebView does NOT
        // implement the Web Speech API (speechSynthesis), so JS-side TTS silently
        // fails inside this APK. This gives the web app a reliable native fallback.
        nativeTts = new TextToSpeech(this, this);

        // Geolocation support — grant for ALL origins including iframes
        // (Google Qibla Finder iframe at qiblafinder.withgoogle.com needs this)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                // Grant geolocation for the requesting origin AND remember it
                callback.invoke(origin, true, true);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                String host = request.getOrigin().getHost();
                if (host != null && (host.equals("juz-amma-pro-max.vercel.app") || host.endsWith(".vercel.app"))) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                } else {
                    runOnUiThread(request::deny);
                }
            }
        });

        // Handle URL loading inside the app
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Keep internal links inside WebView
                if (uri.getHost() != null && (uri.getHost().equals("juz-amma-pro-max.vercel.app") || uri.getHost().endsWith(".vercel.app"))) {
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

        // Init native compass sensors
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            magnetometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
            hasRotationVectorSensor = rotationVectorSensor != null;
        }
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

        // Stop any currently-playing Azan audio from the web UI
        @JavascriptInterface
        public void stopAzanPlayback() {
            Intent serviceIntent = new Intent(MainActivity.this, AzanAlarmService.class);
            stopService(serviceIntent);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(1001);
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
        public void showTestNotification() {
            runOnUiThread(() -> {
                try {
                    NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, "azan_channel")
                        .setSmallIcon(android.R.drawable.ic_popup_reminder)
                        .setContentTitle("🕌 Naba Quran — Test")
                        .setContentText("✅ Notifications are working! Azan alarms and Daily Ayah reminders will reach you.")
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    nm.notify(9911, builder.build());
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Notification test failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void showDailyAyahNotification(String body) {
            runOnUiThread(() -> {
                try {
                    NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, "azan_channel")
                        .setSmallIcon(android.R.drawable.ic_popup_reminder)
                        .setContentTitle("📖 Daily Ayah & Dhikr")
                        .setContentText(body)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true);
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    nm.notify(9912, builder.build());
                } catch (Exception e) { /* ignore */ }
            });
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

        // ===== Native Text-to-Speech (fixes audio not working in APK) =====
        // The web app calls AndroidBridge.speak(text, lang) instead of the
        // browser's speechSynthesis API, which plain WebView doesn't support.
        @JavascriptInterface
        public boolean isNativeTtsAvailable() {
            return nativeTtsReady;
        }

        @JavascriptInterface
        public void speak(final String text, final String lang) {
            speakWithRate(text, lang, 0.85f);
        }

        @JavascriptInterface
        public void speakWithRate(final String text, final String lang, final float rate) {
            if (nativeTts == null) return;
            runOnUiThread(() -> {
                if (!nativeTtsReady) {
                    notifyTtsDone();
                    return;
                }
                Locale locale = Locale.US;
                try {
                    if (lang != null && lang.startsWith("ar")) {
                        Locale arLocale = new Locale("ar");
                        int avail = nativeTts.isLanguageAvailable(arLocale);
                        if (avail == TextToSpeech.LANG_AVAILABLE
                            || avail == TextToSpeech.LANG_COUNTRY_AVAILABLE
                            || avail == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE) {
                            locale = arLocale;
                        }
                    }
                } catch (Exception e) { /* fall back to default locale */ }
                nativeTts.setLanguage(locale);
                nativeTts.setSpeechRate(rate > 0 ? rate : 0.85f);
                String utteranceId = "jamz_tts_" + System.currentTimeMillis();
                nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (nativeTts != null) nativeTts.stop();
            });
        }

        // ===== Native compass bridge (called from Qibla page JS) =====
        @JavascriptInterface
        public boolean isNativeCompassAvailable() {
            return sensorManager != null && (hasRotationVectorSensor || (accelerometerSensor != null && magnetometerSensor != null));
        }

        @JavascriptInterface
        public void startNativeCompass() {
            runOnUiThread(() -> {
                compassActive = true;
                smoothInit = false;
                registerCompassListeners();
            });
        }

        @JavascriptInterface
        public void stopNativeCompass() {
            runOnUiThread(() -> {
                compassActive = false;
                unregisterCompassListeners();
            });
        }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        // Fallback: load in WebView
                        webView.loadUrl(url);
                    }
                }
            });
        }

        @JavascriptInterface
        public void setCompassLocation(final double lat, final double lon) {
            runOnUiThread(() -> {
                userLat = lat;
                userLon = lon;
                try {
                    GeomagneticField field = new GeomagneticField(
                        (float) lat, (float) lon, 0f, System.currentTimeMillis());
                    magneticDeclination = field.getDeclination();
                    haveDeclination = true;
                } catch (Exception e) {
                    haveDeclination = false;
                }
            });
        }
    }

    private void registerCompassListeners() {
        if (sensorManager == null) return;
        if (hasRotationVectorSensor) {
            sensorManager.registerListener(this, rotationVectorSensor, SensorManager.SENSOR_DELAY_GAME);
        } else {
            if (accelerometerSensor != null) {
                sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME);
            }
            if (magnetometerSensor != null) {
                sensorManager.registerListener(this, magnetometerSensor, SensorManager.SENSOR_DELAY_GAME);
            }
        }
    }

    private void unregisterCompassListeners() {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        haveAccel = false;
        haveMagnet = false;
    }

    // Applies the WebView's/device's current rotation so the heading is
    // correct whether the phone is held in portrait (locked orientation here,
    // but keeps this robust if that ever changes).
    private int getDeviceRotationDegrees() {
        int rotation = Surface.ROTATION_0;
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (wm != null) {
            rotation = wm.getDefaultDisplay().getRotation();
        }
        switch (rotation) {
            case Surface.ROTATION_90: return 90;
            case Surface.ROTATION_180: return 180;
            case Surface.ROTATION_270: return 270;
            default: return 0;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!compassActive) return;

        float azimuthDeg;

        if (event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR) {
            System.arraycopy(event.values, 0, rotationVectorReading, 0, event.values.length);
            float[] rotationMatrix = new float[9];
            SensorManager.getRotationMatrixFromVector(rotationMatrix, rotationVectorReading);

            // Remap for current device rotation (keeps heading correct if the
            // system ever rotates the screen)
            int rot = getDeviceRotationDegrees();
            float[] remapped = new float[9];
            if (rot == 90) {
                SensorManager.remapCoordinateSystem(rotationMatrix, SensorManager.AXIS_Y, SensorManager.AXIS_MINUS_X, remapped);
            } else if (rot == 180) {
                SensorManager.remapCoordinateSystem(rotationMatrix, SensorManager.AXIS_MINUS_X, SensorManager.AXIS_MINUS_Y, remapped);
            } else if (rot == 270) {
                SensorManager.remapCoordinateSystem(rotationMatrix, SensorManager.AXIS_MINUS_Y, SensorManager.AXIS_X, remapped);
            } else {
                remapped = rotationMatrix;
            }

            float[] orientation = new float[3];
            SensorManager.getOrientation(remapped, orientation);
            azimuthDeg = (float) Math.toDegrees(orientation[0]);
        } else if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, accelReading, 0, event.values.length);
            haveAccel = true;
            azimuthDeg = computeAzimuthFromAccelMag();
            if (Float.isNaN(azimuthDeg)) return;
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, magnetReading, 0, event.values.length);
            haveMagnet = true;
            azimuthDeg = computeAzimuthFromAccelMag();
            if (Float.isNaN(azimuthDeg)) return;
        } else {
            return;
        }

        azimuthDeg = (azimuthDeg + 360f) % 360f;

        // Apply magnetic declination to get TRUE north heading (matches how
        // professional Qibla/compass apps display direction)
        if (haveDeclination) {
            azimuthDeg = (azimuthDeg + magneticDeclination + 360f) % 360f;
        }

        // Smooth using sin/cos low-pass filter to avoid 0/360 wraparound glitches
        // and eliminate the jitter the raw sensor / browser event produces.
        double rad = Math.toRadians(azimuthDeg);
        float sinVal = (float) Math.sin(rad);
        float cosVal = (float) Math.cos(rad);
        final float ALPHA = 0.35f; // 0.35 = responsive yet smooth; 0.12 was too laggy (compass kept drifting after stopping)
        if (!smoothInit) {
            smoothSin = sinVal;
            smoothCos = cosVal;
            smoothInit = true;
        } else {
            smoothSin += ALPHA * (sinVal - smoothSin);
            smoothCos += ALPHA * (cosVal - smoothCos);
        }
        float smoothedHeading = (float) Math.toDegrees(Math.atan2(smoothSin, smoothCos));
        if (smoothedHeading < 0) smoothedHeading += 360f;

        // Dead zone: if the raw heading hasn't moved meaningfully, skip the
        // smoothing update so the needle doesn't creep/drift on its own.
        float rawDeg = azimuthDeg;
        float smoothDeg = (float) Math.toDegrees(Math.atan2(smoothSin, smoothCos));
        if (smoothDeg < 0) smoothDeg += 360f;
        float dDiff = Math.abs(rawDeg - smoothDeg);
        if (dDiff > 180f) dDiff = 360f - dDiff;
        if (dDiff < 1.5f) {
            // Needle is stable — just send current smoothed value (no creep)
            long now = System.currentTimeMillis();
            if (now - lastCompassSendMs < 200) return; // throttle stable updates to 5fps
            lastCompassSendMs = now;
            final float stableHeading = smoothDeg;
            if (webView != null) {
                webView.post(() -> webView.evaluateJavascript(
                    "window.onNativeCompassHeading && window.onNativeCompassHeading(" + stableHeading + ");", null));
            }
            return;
        }

        // Throttle updates to ~20fps — plenty smooth, avoids flooding the WebView bridge
        long now = System.currentTimeMillis();
        if (now - lastCompassSendMs < 50) return;
        lastCompassSendMs = now;

        final float finalHeading = smoothedHeading;
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                "window.onNativeCompassHeading && window.onNativeCompassHeading(" + finalHeading + ");", null));
        }
    }

    private float computeAzimuthFromAccelMag() {
        if (!haveAccel || !haveMagnet) return Float.NaN;
        float[] rotationMatrix = new float[9];
        float[] orientation = new float[3];
        boolean success = SensorManager.getRotationMatrix(rotationMatrix, null, accelReading, magnetReading);
        if (!success) return Float.NaN;
        SensorManager.getOrientation(rotationMatrix, orientation);
        return (float) Math.toDegrees(orientation[0]);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Low accuracy triggers a "calibrate" hint on the web side
        if (accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE
            || accuracy == SensorManager.SENSOR_STATUS_ACCURACY_LOW) {
            if (webView != null && compassActive) {
                webView.post(() -> webView.evaluateJavascript(
                    "window.onNativeCompassNeedsCalibration && window.onNativeCompassNeedsCalibration();", null));
            }
        }
    }

    // Notifies the web page that the current native TTS utterance has finished,
    // so the JS-side queue (Dua Listen / Play All) can move to the next item.
    private void notifyTtsDone() {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.__nativeTtsDone && window.__nativeTtsDone();", null);
            }
        });
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && nativeTts != null) {
            nativeTtsReady = true;
            nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) { }

                @Override
                public void onDone(String utteranceId) {
                    notifyTtsDone();
                }

                @Override
                public void onError(String utteranceId) {
                    notifyTtsDone();
                }
            });
        } else {
            nativeTtsReady = false;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "azan_channel",
                "Azan Alarm",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Azan prayer time notifications — tap STOP to silence");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{300, 100, 300, 100, 300});
            channel.enableLights(true);
            channel.setShowBadge(true);
            channel.setSound(null, null);  // Sound comes from MediaPlayer, not the channel

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
        // But do stop the compass sensor listeners to save battery while backgrounded
        if (compassActive) {
            unregisterCompassListeners();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-attach compass sensors if the Qibla live compass was active before pause
        if (compassActive) {
            registerCompassListeners();
        }
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

    @Override
    protected void onDestroy() {
        if (nativeTts != null) {
            nativeTts.stop();
            nativeTts.shutdown();
        }
        unregisterCompassListeners();
        super.onDestroy();
    }
}
