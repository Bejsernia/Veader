package com.veader.reader

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SystemBars"

  @ReactMethod
  fun setNavigationBarAppearance(backgroundColor: String, lightIcons: Boolean) {
    val color = try {
      Color.parseColor(backgroundColor)
    } catch (_: IllegalArgumentException) {
      return
    }
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      WindowCompat.setDecorFitsSystemWindows(window, true)
      window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
      window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
      window.navigationBarColor = color
      window.decorView.background = ColorDrawable(color)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        window.navigationBarDividerColor = color
        window.isNavigationBarContrastEnforced = false
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.insetsController?.setSystemBarsAppearance(
          if (lightIcons) WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,
          WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        )
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        var flags = window.decorView.systemUiVisibility
        flags = if (lightIcons) {
          flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        } else {
          flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
        }
        window.decorView.systemUiVisibility = flags
      }
      WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightNavigationBars = lightIcons
    }
  }
}
