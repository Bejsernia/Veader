package com.veader.reader

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import android.os.ParcelFileDescriptor
import android.graphics.pdf.PdfRenderer

/** Native, bounded page operations. Original books always stay at their granted URI. */
class DocumentReaderModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "DocumentReader"

  @ReactMethod
  fun getPdfInfo(uri: String, promise: Promise) {
    try {
      openPdf(uri).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          val result = Arguments.createMap()
          result.putInt("pageCount", renderer.pageCount)
          promise.resolve(result)
        }
      }
    } catch (error: Exception) { promise.reject("PDF_INFO_FAILED", error.message, error) }
  }

  @ReactMethod
  fun renderPdfPage(uri: String, pageIndex: Int, targetWidth: Int, promise: Promise) {
    try {
      val cacheDir = File(context.cacheDir, "pdf-pages")
      if (!cacheDir.exists()) cacheDir.mkdirs()
      val safeWidth = targetWidth.coerceIn(480, 2048)
      val output = File(cacheDir, "${digest(uri + pageIndex + safeWidth)}.png")
      if (output.exists() && output.length() > 0) {
        promise.resolve(output.toURI().toString())
        return
      }
      openPdf(uri).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          if (pageIndex !in 0 until renderer.pageCount) throw IllegalArgumentException("PDF 页码不存在")
          renderer.openPage(pageIndex).use { page ->
            val ratio = page.height.toFloat() / page.width.toFloat()
            val width = safeWidth
            val height = (width * ratio).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            FileOutputStream(output).use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream) }
            bitmap.recycle()
          }
        }
      }
      promise.resolve(output.toURI().toString())
    } catch (error: Exception) { promise.reject("PDF_RENDER_FAILED", error.message, error) }
  }

  @ReactMethod
  fun cropImage(uri: String, promise: Promise) {
    try {
      val cacheDir = File(context.cacheDir, "cropped-pages")
      if (!cacheDir.exists()) cacheDir.mkdirs()
      val output = File(cacheDir, "${digest(uri)}.png")
      if (output.exists() && output.length() > 0) {
        promise.resolve(output.toURI().toString())
        return
      }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      openInput(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) { promise.resolve(uri); return }
      val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight) }
      val bitmap = openInput(uri).use { BitmapFactory.decodeStream(it, null, options) }
      if (bitmap == null) { promise.resolve(uri); return }
      val box = findContent(bitmap)
      if (box != null && (box.width() < bitmap.width * 0.97f || box.height() < bitmap.height * 0.97f)) {
        val cropped = Bitmap.createBitmap(bitmap, box?.left ?: 0, box?.top ?: 0, box?.width() ?: bitmap.width, box?.height() ?: bitmap.height)
        FileOutputStream(output).use { stream -> cropped.compress(Bitmap.CompressFormat.PNG, 100, stream) }
        cropped.recycle()
        bitmap.recycle()
        promise.resolve(output.toURI().toString())
      } else {
        bitmap.recycle()
        promise.resolve(uri)
      }
    } catch (error: Exception) { promise.reject("IMAGE_CROP_FAILED", error.message, error) }
  }

  private fun openPdf(uri: String): ParcelFileDescriptor {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == "file") ParcelFileDescriptor.open(File(parsed.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
    else context.contentResolver.openFileDescriptor(parsed, "r") ?: throw IllegalArgumentException("无法读取 PDF")
  }

  private fun openInput(uri: String): InputStream {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == "file") FileInputStream(parsed.path ?: throw IllegalArgumentException("无效文件路径"))
    else context.contentResolver.openInputStream(parsed) ?: throw IllegalArgumentException("无法读取图片")
  }

  private fun sampleSize(width: Int, height: Int): Int {
    var sample = 1
    while (width / sample > 1600 || height / sample > 1600) sample *= 2
    return sample
  }

  private fun findContent(bitmap: Bitmap): Rect? {
    val step = (maxOf(bitmap.width, bitmap.height) / 900).coerceAtLeast(1)
    var left = bitmap.width; var top = bitmap.height; var right = -1; var bottom = -1
    for (y in 0 until bitmap.height step step) {
      for (x in 0 until bitmap.width step step) {
        val pixel = bitmap.getPixel(x, y)
        val alpha = Color.alpha(pixel)
        val red = Color.red(pixel); val green = Color.green(pixel); val blue = Color.blue(pixel)
        if (alpha > 12 && (red < 246 || green < 246 || blue < 246)) {
          left = minOf(left, x); top = minOf(top, y); right = maxOf(right, x); bottom = maxOf(bottom, y)
        }
      }
    }
    if (right < left || bottom < top) return null
    val paddingX = (bitmap.width * 0.0125f).toInt(); val paddingY = (bitmap.height * 0.0125f).toInt()
    return Rect((left - paddingX).coerceAtLeast(0), (top - paddingY).coerceAtLeast(0), (right + paddingX + 1).coerceAtMost(bitmap.width), (bottom + paddingY + 1).coerceAtMost(bitmap.height))
  }

  private fun digest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
