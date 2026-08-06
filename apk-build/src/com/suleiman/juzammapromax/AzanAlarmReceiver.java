package com.suleiman.juzammapromax;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

public class AzanAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String prayerName = intent.getStringExtra("prayer_name");
        if (prayerName == null) prayerName = "Prayer";

        Log.d("AzanAlarm", "Alarm fired for: " + prayerName);

        // Wake up the device
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "JuzAmma::AzanWakeLock"
        );
        wakeLock.acquire(60_000); // 1 minute

        // Start the foreground service to play Azan audio
        Intent serviceIntent = new Intent(context, AzanAlarmService.class);
        serviceIntent.putExtra("prayer_name", prayerName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        if (wakeLock.isHeld()) wakeLock.release();
    }
}
