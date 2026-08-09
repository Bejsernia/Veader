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
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
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

  /** Reads only the MOBI/PalmDB header and image record table. The book body is never
   * copied into a JS string or held in the heap. */
  @ReactMethod
  fun getMobiInfo(uri: String, promise: Promise) {
    try {
      withChannel(uri) { channel ->
        val index = readMobiIndex(channel)
        val result = Arguments.createMap()
        result.putString("title", index.title)
        result.putString("author", index.author)
        val pages = Arguments.createArray()
        index.imageRecords.forEach { pages.pushInt(it) }
        result.putArray("imageRecords", pages)
        result.putInt("pageCount", index.imageRecords.size)
        promise.resolve(result)
      }
    } catch (error: Exception) { promise.reject("MOBI_INFO_FAILED", error.message, error) }
  }

  @ReactMethod
  fun renderMobiPage(uri: String, recordIndex: Int, targetWidth: Int, promise: Promise) {
    try {
      withChannel(uri) { channel ->
        val index = readMobiIndex(channel)
        if (recordIndex !in index.imageRecords) throw IllegalArgumentException("MOBI 图片页不存在")
        val position = index.recordOffsets[recordIndex]
        val end = if (recordIndex + 1 < index.recordOffsets.size) index.recordOffsets[recordIndex + 1] else channel.size()
        val length = end - position
        if (position < 0 || length <= 0 || length > 32L * 1024L * 1024L) throw IllegalArgumentException("MOBI 图片记录无效")
        val bytes = readChannel(channel, position, length.toInt())
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalArgumentException("MOBI 图片无法解码")
        val safeWidth = targetWidth.coerceIn(480, 2048)
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, safeWidth) }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: throw IllegalArgumentException("MOBI 图片无法解码")
        val cacheDir = File(context.cacheDir, "mobi-pages-native")
        if (!cacheDir.exists()) cacheDir.mkdirs()
        val output = File(cacheDir, "${digest(uri + recordIndex + safeWidth)}.jpg")
        if (!output.exists() || output.length() == 0L) {
          FileOutputStream(output).use { stream -> bitmap.compress(Bitmap.CompressFormat.JPEG, 92, stream) }
        }
        bitmap.recycle()
        promise.resolve(output.toURI().toString())
      }
    } catch (error: Exception) { promise.reject("MOBI_RENDER_FAILED", error.message, error) }
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

  private data class MobiIndex(
    val recordOffsets: LongArray,
    val imageRecords: List<Int>,
    val title: String,
    val author: String,
  )

  private fun <T> withChannel(uri: String, block: (FileChannel) -> T): T {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == "file") return RandomAccessFile(parsed.path ?: throw IllegalArgumentException("无效文件路径"), "r").use { block(it.channel) }
    val descriptor = context.contentResolver.openFileDescriptor(parsed, "r") ?: throw IllegalArgumentException("无法随机读取文件")
    return try {
      FileInputStream(descriptor.fileDescriptor).use { block(it.channel) }
    } finally { descriptor.close() }
  }

  private fun readChannel(channel: FileChannel, position: Long, length: Int): ByteArray {
    val output = ByteArray(length)
    val buffer = ByteBuffer.wrap(output)
    channel.position(position)
    while (buffer.hasRemaining()) if (channel.read(buffer) < 0) throw IllegalArgumentException("文件读取不完整")
    return output
  }

  private fun readMobiIndex(channel: FileChannel): MobiIndex {
    val fileSize = channel.size()
    if (fileSize < 78) throw IllegalArgumentException("MOBI 文件过小")
    val header = readChannel(channel, 0, 78)
    val count = u16(header, 76)
    if (count <= 0 || 78L + count * 8L > fileSize) throw IllegalArgumentException("MOBI 记录表无效")
    val table = readChannel(channel, 78, count * 8)
    val offsets = LongArray(count)
    for (index in 0 until count) offsets[index] = u32(table, index * 8).toLong()
    val record0 = offsets[0]
    if (record0 < 0 || record0 + 16 > fileSize) throw IllegalArgumentException("MOBI 主记录无效")
    val palmHeader = readChannel(channel, record0, 16)
    val textRecordCount = u16(palmHeader, 8)
    val imageRecords = mutableListOf<Int>()
    for (index in (textRecordCount + 1) until count) {
      val position = offsets[index]
      if (position < 0 || position + 4 > fileSize) continue
      val signature = readChannel(channel, position, 4)
      if ((signature[0].toInt() and 0xff) == 0xff && (signature[1].toInt() and 0xff) == 0xd8 ||
        signature[0].toInt() == 0x89 && signature[1].toInt() == 0x50 && signature[2].toInt() == 0x4e && signature[3].toInt() == 0x47 ||
        signature[0].toInt() == 0x47 && signature[1].toInt() == 0x49 && signature[2].toInt() == 0x46) imageRecords.add(index)
    }
    if (imageRecords.isEmpty()) throw IllegalArgumentException("MOBI 中没有找到漫画图片")
    val metadata = readMobiMetadata(channel, record0, fileSize)
    return MobiIndex(offsets, imageRecords, metadata.first, metadata.second)
  }

  private fun readMobiMetadata(channel: FileChannel, record0: Long, fileSize: Long): Pair<String, String> {
    if (record0 + 120 > fileSize) return "" to ""
    val mobi = readChannel(channel, record0 + 16, 104)
    if (String(mobi, 0, 4, Charsets.US_ASCII) != "MOBI") return "" to ""
    var title = ""
    val titleOffset = u32(mobi, 84); val titleLength = u32(mobi, 88)
    if (titleLength > 0 && titleOffset + titleLength <= fileSize - record0) {
      title = decodeMobiText(readChannel(channel, record0 + titleOffset, titleLength))
    }
    val headerLength = u32(mobi, 4)
    val exth = record0 + 16 + headerLength
    var author = ""
    if (exth + 12 <= fileSize && String(readChannel(channel, exth, 4), Charsets.US_ASCII) == "EXTH") {
      val count = u32(readChannel(channel, exth + 8, 4), 0)
      var cursor = exth + 12
      repeat(count) {
        if (cursor + 8 > fileSize) return@repeat
        val recordHeader = readChannel(channel, cursor, 8)
        val type = u32(recordHeader, 0); val size = u32(recordHeader, 4)
        if (size < 8 || cursor + size > fileSize) return@repeat
        if (type == 100) author = decodeMobiText(readChannel(channel, cursor + 8, size - 8))
        if (type == 503 && title.isEmpty()) title = decodeMobiText(readChannel(channel, cursor + 8, size - 8))
        cursor += size
      }
    }
    return title to author
  }

  private fun decodeMobiText(bytes: ByteArray): String {
    val cleaned = bytes.toString(Charsets.UTF_8).replace("\u0000", "").trim()
    if (cleaned.isNotEmpty() && !cleaned.contains('\uFFFD')) return cleaned
    return bytes.toString(Charsets.UTF_16BE).replace("\u0000", "").trim()
  }

  private fun u16(bytes: ByteArray, offset: Int): Int = ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)
  private fun u32(bytes: ByteArray, offset: Int): Int = ((bytes[offset].toInt() and 0xff) shl 24) or ((bytes[offset + 1].toInt() and 0xff) shl 16) or ((bytes[offset + 2].toInt() and 0xff) shl 8) or (bytes[offset + 3].toInt() and 0xff)

  private fun sampleSize(width: Int, height: Int, targetWidth: Int = 1600): Int {
    var sample = 1
    while (width / sample > targetWidth || height / sample > targetWidth * 2) sample *= 2
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
