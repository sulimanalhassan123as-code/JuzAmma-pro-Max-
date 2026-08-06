package com.suleiman.juzammapromax;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.Calendar;

public class AzanBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!action.equals(Intent.ACTION_BOOT_COMPLETED) &&
            !action.equals("android.intent.action.QUICKBOOT_POWERON") &&
            !action.equals(Intent.ACTION_LOCKED_BOOT_COMPLETED)) {
            return;
        }

        // Restore all saved alarms after device reboot
        SharedPreferences prefs = context.getSharedPreferences("JuzAmmaPrefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("azan_enabled", false)) return;

        String[] prayers = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        for (String p : prayers) {
            int h = prefs.getInt("alarm_" + p + "_h", -1);
            int m = prefs.getInt("alarm_" + p + "_m", -1);
            if (h < 0 || m < 0) continue;

            Intent alarmIntent = new Intent(context, AzanAlarmReceiver.class);
            alarmIntent.putExtra("prayer_name", p);
            PendingIntent pi = PendingIntent.getBroadcast(context, p.hashCode(), alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, h);
            cal.set(Calendar.MINUTE, m);
            cal.set(Calendar.SECOND, 0);
            if (cal.getTimeInMillis() < System.currentTimeMillis()) {
                cal.add(Calendar.DAY_OF_YEAR, 1);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
            } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
            }
        }
    }
}
