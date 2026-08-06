package com.suleiman.juzammapromax;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AzanNotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if ("ACTION_STOP_AZAN".equals(action)) {
            Intent serviceIntent = new Intent(context, AzanAlarmService.class);
            context.stopService(serviceIntent);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(1001);
        }
    }
}
