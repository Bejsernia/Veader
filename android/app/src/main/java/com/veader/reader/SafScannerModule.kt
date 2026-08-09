package com.veader.reader

import android.net.Uri
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.*
import java.io.ByteArrayInputStream
import java.io.FileInputStream
import java.io.InputStream
import java.net.URLDecoder
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Document

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

  @ReactMethod
  fun scanEpub(uri: String, promise: Promise) {
    try {
      val scan = scanEpubStream(uri)
      val result = Arguments.createMap()
      result.putString("title", scan.title)
      result.putString("author", scan.author)
      result.putString("direction", scan.direction)
      val pages = Arguments.createArray()
      scan.pages.forEach { pages.pushString(it) }
      result.putArray("pages", pages)
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("EPUB_SCAN_FAILED", error.message, error) }
  }

  @ReactMethod
  fun extractEpubEntry(uri: String, entryName: String, promise: Promise) {
    try {
      var bytes: ByteArray? = null
      openInput(uri).use { input ->
        ZipInputStream(input).use { zip ->
          while (true) {
            val entry = zip.nextEntry ?: break
            if (!entry.isDirectory && normalizePath(entry.name) == normalizePath(entryName)) {
              bytes = zip.readBytes()
              break
            }
          }
        }
      }
      if (bytes == null) throw Exception("EPUB 页面不存在")
      promise.resolve(Base64.encodeToString(bytes!!, Base64.NO_WRAP))
    } catch (error: Exception) { promise.reject("EPUB_ENTRY_FAILED", error.message, error) }
  }

  private data class EpubScan(val title: String, val author: String, val direction: String, val pages: List<String>)

  private fun scanEpubStream(uri: String): EpubScan {
    val names = mutableSetOf<String>()
    val xmlEntries = mutableMapOf<String, ByteArray>()
    openInput(uri).use { input ->
      ZipInputStream(input).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val name = normalizePath(entry.name)
          names.add(name)
          val lower = name.lowercase()
          if (!entry.isDirectory && (lower.endsWith(".xml") || lower.endsWith(".opf") || lower.endsWith(".xhtml") || lower.endsWith(".html") || lower.endsWith(".htm"))) {
            xmlEntries[name] = zip.readBytes()
          }
        }
      }
    }
    val container = xmlEntries["META-INF/container.xml"] ?: throw Exception("EPUB 缺少 container.xml")
    val containerDoc = parseXml(container) ?: throw Exception("EPUB container.xml 无法解析")
    val opfPath = elements(containerDoc, "rootfile").firstOrNull()?.getAttribute("full-path")?.let(::normalizePath)
      ?: throw Exception("EPUB 缺少 OPF 路径")
    val opf = parseXml(xmlEntries[opfPath] ?: throw Exception("EPUB 缺少 OPF 文件")) ?: throw Exception("EPUB OPF 无法解析")
    val manifest = elements(opf, "item").associate { it.getAttribute("id") to it.getAttribute("href") }
    val spine = elements(opf, "itemref").map { it.getAttribute("idref") }
    val basePath = opfPath.substringBeforeLast('/', "")
    val pages = mutableListOf<String>()
    spine.forEach { idref ->
      val href = manifest[idref] ?: return@forEach
      val chapterPath = resolvePath(basePath, href)
      val chapter = xmlEntries[chapterPath]?.toString(Charsets.UTF_8) ?: return@forEach
      val source = Regex("""<(?:img|image)[^>]+(?:src|href)\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(chapter)?.groupValues?.getOrNull(1) ?: return@forEach
      val imagePath = resolvePath(chapterPath.substringBeforeLast('/', ""), source.substringBefore('#').substringBefore('?'))
      if (imagePath in names) pages.add(imagePath)
    }
    if (pages.isEmpty()) throw Exception("EPUB 中没有找到漫画页面")
    val metadata = elements(opf, "metadata").firstOrNull()
    val title = metadata?.let { elements(it, "title").firstOrNull()?.textContent?.trim() }.orEmpty()
    val author = metadata?.let { elements(it, "creator").map { creator -> creator.textContent.trim() }.filter(String::isNotEmpty).distinct().joinToString("、") }.orEmpty()
    val direction = metadata?.let { elements(it, "meta").firstOrNull { meta -> meta.getAttribute("name") == "primary-writing-mode" }?.getAttribute("content") }.orEmpty().let { if (it.endsWith("-rl")) "rtl" else "ltr" }
    return EpubScan(title, author, direction, pages)
  }

  private fun parseXml(bytes: ByteArray): Document? = try {
    DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
  } catch (_: Exception) { null }

  private fun elements(document: Document, name: String): List<org.w3c.dom.Element> {
    val namespaced = document.getElementsByTagNameNS("*", name)
    if (namespaced.length > 0) return (0 until namespaced.length).mapNotNull { namespaced.item(it) as? org.w3c.dom.Element }
    val plain = document.getElementsByTagName(name)
    return (0 until plain.length).mapNotNull { plain.item(it) as? org.w3c.dom.Element }
  }

  private fun elements(parent: org.w3c.dom.Element, name: String): List<org.w3c.dom.Element> {
    val namespaced = parent.getElementsByTagNameNS("*", name)
    if (namespaced.length > 0) return (0 until namespaced.length).mapNotNull { namespaced.item(it) as? org.w3c.dom.Element }
    val plain = parent.getElementsByTagName(name)
    return (0 until plain.length).mapNotNull { plain.item(it) as? org.w3c.dom.Element }
  }

  private fun openInput(uri: String): InputStream {
    val parsed = Uri.parse(uri)
    return if (parsed.scheme == "file") FileInputStream(parsed.path ?: throw Exception("无效文件路径"))
    else reactApplicationContext.contentResolver.openInputStream(parsed) ?: throw Exception("无法读取 EPUB")
  }

  private fun resolvePath(base: String, reference: String): String {
    val decoded = try { URLDecoder.decode(reference, "UTF-8") } catch (_: Exception) { reference }
    return normalizePath(if (base.isEmpty()) decoded else "$base/$decoded")
  }

  private fun normalizePath(value: String): String {
    val parts = mutableListOf<String>()
    value.replace('\\', '/').split('/').forEach { part ->
      when {
        part.isEmpty() || part == "." -> Unit
        part == ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.lastIndex)
        else -> parts.add(part)
      }
    }
    return parts.joinToString("/")
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
