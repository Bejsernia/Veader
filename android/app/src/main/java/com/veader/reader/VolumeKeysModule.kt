package com.veader.reader

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

object VolumeKeyPagingController {
  @Volatile
  var enabled: Boolean = false
}

class VolumeKeysModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "VolumeKeys"

  @ReactMethod
  fun setPageTurningEnabled(enabled: Boolean) {
    VolumeKeyPagingController.enabled = enabled
  }
}
