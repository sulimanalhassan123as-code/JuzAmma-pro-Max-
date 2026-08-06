package com.suleiman.juzammapromax;

import android.app.Notification;
import android.app.NotificationManager;
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

        // Create foreground notification (required for Android 8+)
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🕌 Azan — " + prayerName + " Prayer")
            .setContentText("Hayya ala al-Salah — Come to Prayer")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(new long[]{500, 200, 500, 200, 500})
            .setOngoing(true)
            .build();

        startForeground(NOTIF_ID, notification);

        // Get selected Azan voice
        SharedPreferences prefs = getSharedPreferences("JuzAmmaPrefs", MODE_PRIVATE);
        String selectedAzan = prefs.getString("selected_azan", "makkah");
        String url = AZAN_URLS.get(selectedAzan);
        if (url == null) url = AZAN_URLS.get("makkah");

        // Play Azan audio
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioStreamType(AudioManager.STREAM_ALARM);
            mediaPlayer.setDataSource(url);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            );
            mediaPlayer.setLooping(false);
            mediaPlayer.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setOnCompletionListener(mp -> {
                mp.release();
                mediaPlayer = null;
                stopForeground(true);
                stopSelf();
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                mp.release();
                mediaPlayer = null;
                stopForeground(true);
                stopSelf();
                return true;
            });
            mediaPlayer.prepareAsync();
            mediaPlayer.setOnPreparedListener(MediaPlayer::start);
        } catch (Exception e) {
            e.printStackTrace();
            stopForeground(true);
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
