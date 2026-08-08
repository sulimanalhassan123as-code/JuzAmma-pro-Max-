package com.suleiman.juzammapromax;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import java.util.HashMap;
import java.util.Map;

public class AzanAlarmService extends Service {

    private MediaPlayer mediaPlayer;
    private AudioManager audioManager;
    private int originalVolume = -1;
    private static final int NOTIF_ID = 1001;
    private static final String CHANNEL_ID = "azan_channel";

    private static final Map<String, String> AZAN_URLS = new HashMap<>();
    static {
        AZAN_URLS.put("makkah", "https://praytimes.org/audio/sunni/Adhan-Makkah.mp3");
        AZAN_URLS.put("madinah", "https://praytimes.org/audio/sunni/Adhan-Madinah.mp3");
        AZAN_URLS.put("abdulbasit", "https://praytimes.org/audio/sunni/Abdul-Basit.mp3");
        AZAN_URLS.put("minshawi", "https://praytimes.org/audio/sunni/Minshawi.mp3");
        AZAN_URLS.put("egypt", "https://praytimes.org/audio/sunni/Adhan-Egypt.mp3");
        AZAN_URLS.put("yusufi", "https://praytimes.org/audio/sunni/Yusuf-Islam.mp3");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String prayerName = intent != null ? intent.getStringExtra("prayer_name") : "Prayer";

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // Build STOP action PendingIntent
        Intent stopIntent = new Intent(this, AzanNotificationActionReceiver.class);
        stopIntent.setAction("ACTION_STOP_AZAN");
        PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Create a tappable foreground notification with a big STOP button
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🕌 Azan — " + prayerName + " Prayer")
            .setContentText("Hayya ala al-Salah — Tap STOP to silence")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(false)  // allow dismissal
            .setContentIntent(stopPendingIntent)  // tap notification = stop
            .addAction(android.R.drawable.ic_media_pause, "STOP", stopPendingIntent)
            .setDeleteIntent(stopPendingIntent)  // swipe away = stop too
            .build();

        startForeground(NOTIF_ID, notification);

        // Get selected Azan voice
        SharedPreferences prefs = getSharedPreferences("JuzAmmaPrefs", MODE_PRIVATE);
        String selectedAzan = prefs.getString("selected_azan", "makkah");
        String url = AZAN_URLS.get(selectedAzan);
        if (url == null) url = AZAN_URLS.get("makkah");

        // Play Azan audio on MUSIC stream (respects volume keys, not aggressive)
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }
            mediaPlayer = new MediaPlayer();

            // Cap volume at 70% of current media volume — loud enough to hear, not deafening
            int maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int currentVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            int targetVol = Math.max(currentVol, (int)(maxVol * 0.7));
            // Don't boost above 80% even if current volume is max
            targetVol = Math.min(targetVol, (int)(maxVol * 0.8));
            // But at least 30% so it's audible
            targetVol = Math.max(targetVol, (int)(maxVol * 0.3));
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVol, 0);

            mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            mediaPlayer.setDataSource(url);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            );
            mediaPlayer.setLooping(false);
            mediaPlayer.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setOnCompletionListener(mp -> {
                stopAzan();
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                stopAzan();
                return true;
            });
            mediaPlayer.prepareAsync();
            mediaPlayer.setOnPreparedListener(MediaPlayer::start);
        } catch (Exception e) {
            stopAzan();
        }

        return START_NOT_STICKY;
    }

    private void stopAzan() {
        if (mediaPlayer != null) {
            try { mediaPlayer.stop(); } catch (Exception e) {}
            mediaPlayer.release();
            mediaPlayer = null;
        }
        stopForeground(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopAzan();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
