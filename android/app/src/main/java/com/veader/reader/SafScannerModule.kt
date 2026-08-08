package com.veader.reader

import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.*

class SafScannerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SafScanner"

  @ReactMethod
  fun scan(rootUri: String, promise: Promise) {
    try {
      val root = DocumentFile.fromTreeUri(reactApplicationContext, Uri.parse(rootUri)) ?: throw Exception("无法打开已授权目录")
      val series = Arguments.createArray()
      root.listFiles().filter { it.isDirectory }.forEach { folder ->
        val chapters = Arguments.createArray()
        collectBooks(folder, chapters)
        if (chapters.size() > 0) {
          val item = Arguments.createMap(); item.putString("name", folder.name ?: "未命名作品"); item.putString("uri", folder.uri.toString()); item.putArray("chapters", chapters); series.pushMap(item)
        }
      }
      promise.resolve(series)
    } catch (error: Exception) { promise.reject("SAF_SCAN_FAILED", error.message, error) }
  }

  private fun collectBooks(folder: DocumentFile, result: WritableArray) {
    folder.listFiles().forEach { file ->
      if (file.isDirectory) collectBooks(file, result)
      else if ((file.name ?: "").lowercase().let { it.endsWith(".epub") || it.endsWith(".pdf") || it.endsWith(".mobi") }) {
        val item = Arguments.createMap(); item.putString("name", file.name); item.putString("uri", file.uri.toString()); result.pushMap(item)
      }
    }
  }
}
