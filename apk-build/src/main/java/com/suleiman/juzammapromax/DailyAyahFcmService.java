package com.suleiman.juzammapromax;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Daily Ayah FCM push service.
 *
 * Receives Firebase Cloud Messaging pushes (sent by the app's Vercel cron
 * at 07:00 daily) and shows them as Android notifications. Also registers /
 * refreshes this device's FCM token with the app's token registry so the
 * server knows where to send.
 */
public class DailyAyahFcmService extends FirebaseMessagingService {

    private static final String TAG = "DailyAyahFCM";
    private static final String CHANNEL_ID = "daily_ayah";
    private static final String REGISTER_URL =
        "https://superagent-7ce6afb1.base44.app/functions/fcmRegisterToken";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "FCM message received from: " + remoteMessage.getFrom());

        RemoteMessage.Notification n = remoteMessage.getNotification();
        String title = (n != null && n.getTitle() != null) ? n.getTitle() : "🌙 Ayah of the Day";
        String body = (n != null && n.getBody() != null) ? n.getBody() : "Open the app for today's ayah";

        showNotification(title, body);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "FCM token refreshed, re-registering");
        registerToken(token);
    }

    public static void registerToken(final String token) {
        if (token == null || token.isEmpty()) return;
        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(REGISTER_URL).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(15000);
                String payload = "{\"token\":\"" + token + "\",\"deviceNote\":\"Naba Quran APK\"}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                }
                int code = conn.getResponseCode();
                Log.d(TAG, "Token registered, server response: " + code);
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Token registration failed: " + e.getMessage());
            }
        }, "fcm-token-register").start();
    }

    private void showNotification(String title, String body) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Daily Ayah", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Daily ayah notification");
            nm.createNotificationChannel(channel);
        }

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 2001, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder nb = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(2001, nb.build());
    }
}
