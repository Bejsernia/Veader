package com.veader.reader

import android.net.Uri
import com.facebook.react.bridge.*
import com.hierynomus.msdtyp.AccessMask
import com.hierynomus.msfscc.FileAttributes
import com.hierynomus.mssmb2.SMB2CreateDisposition
import com.hierynomus.mssmb2.SMB2CreateOptions
import com.hierynomus.mssmb2.SMB2ShareAccess
import com.hierynomus.smbj.SMBClient
import com.hierynomus.smbj.auth.AuthenticationContext
import com.hierynomus.smbj.share.DiskShare
import com.hierynomus.smbj.share.File as SmbFile
import org.apache.commons.net.ftp.FTPClient
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.util.EnumSet
import java.security.KeyStore
import android.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

/** FTP and SMB2/3 are implemented here; JavaScript only receives plain entries. */
class RemoteSourceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RemoteSource"

  @ReactMethod
  fun saveCredentials(key: String, username: String, password: String, promise: Promise) {
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey())
      val payload = cipher.iv + cipher.doFinal("$username\u0000$password".toByteArray(Charsets.UTF_8))
      context.getSharedPreferences("remote_credentials", 0).edit().putString(digest(key), Base64.encodeToString(payload, Base64.NO_WRAP)).apply()
      promise.resolve(true)
    } catch (error: Exception) { promise.reject("REMOTE_CREDENTIALS_FAILED", error.message, error) }
  }

  @ReactMethod
  fun deleteCredentials(key: String, promise: Promise) {
    context.getSharedPreferences("remote_credentials", 0).edit().remove(digest(key)).apply(); promise.resolve(true)
  }

  @ReactMethod
  fun scan(type: String, endpoint: String, username: String?, password: String?, promise: Promise) {
    try {
      val credentials = resolveCredentials(endpoint, username.orEmpty(), password.orEmpty())
      val entries = if (type.equals("ftp", true)) scanFtp(endpoint, credentials.first, credentials.second) else scanSmb(endpoint, credentials.first, credentials.second)
      val result = Arguments.createArray()
      entries.forEach { entry ->
        val map = Arguments.createMap(); map.putString("name", entry.name); map.putString("path", entry.path); map.putDouble("size", entry.size.toDouble()); map.putBoolean("directory", entry.directory); result.pushMap(map)
      }
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("REMOTE_SCAN_FAILED", error.message, error) }
  }

  @ReactMethod
  fun download(type: String, endpoint: String, remotePath: String, username: String?, password: String?, targetUri: String, promise: Promise) {
    try {
      val credentials = resolveCredentials(endpoint, username.orEmpty(), password.orEmpty())
      val target = File(Uri.parse(targetUri).path ?: throw IllegalArgumentException("无效的缓存路径"))
      target.parentFile?.mkdirs()
      if (type.equals("ftp", true)) downloadFtp(endpoint, remotePath, credentials.first, credentials.second, target)
      else downloadSmb(endpoint, remotePath, credentials.first, credentials.second, target)
      promise.resolve(target.toURI().toString())
    } catch (error: Exception) { promise.reject("REMOTE_DOWNLOAD_FAILED", error.message, error) }
  }

  private data class Entry(val name: String, val path: String, val size: Long, val directory: Boolean)

  private fun resolveCredentials(endpoint: String, username: String, password: String): Pair<String, String> {
    if (username.isNotBlank() || password.isNotBlank()) return username to password
    val stored = context.getSharedPreferences("remote_credentials", 0).getString(digest(endpoint), null) ?: return "" to ""
    return try {
      val payload = Base64.decode(stored, Base64.DEFAULT); val iv = payload.copyOfRange(0, 12); val encrypted = payload.copyOfRange(12, payload.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
      val values = String(cipher.doFinal(encrypted), Charsets.UTF_8).split('\u0000', limit = 2)
      (values.getOrNull(0).orEmpty()) to (values.getOrNull(1).orEmpty())
    } catch (_: Exception) { "" to "" }
  }

  private fun secretKey(): SecretKey {
    val alias = "veader_remote_credentials"
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!store.containsAlias(alias)) {
      val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
      generator.generateKey()
    }
    return (store.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
  }

  private fun digest(value: String): String = java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

  private fun scanFtp(endpoint: String, username: String, password: String): List<Entry> {
    val uri = URI(endpoint); val client = FTPClient(); val result = mutableListOf<Entry>()
    client.connect(uri.host, if (uri.port > 0) uri.port else 21)
    if (!client.login(username.ifBlank { "anonymous" }, password.ifBlank { "anonymous@" })) throw IllegalArgumentException("FTP 登录失败")
    client.enterLocalPassiveMode(); client.setFileType(org.apache.commons.net.ftp.FTP.BINARY_FILE_TYPE)
    scanFtpDirectory(client, normalize(uri.path), result, 0)
    client.logout(); client.disconnect(); return result
  }

  private fun scanFtpDirectory(client: FTPClient, path: String, result: MutableList<Entry>, depth: Int) {
    if (depth > 12) return
    client.listFiles(path).forEach { file ->
      if (file.name == "." || file.name == "..") return@forEach
      val child = join(path, file.name)
      if (file.isDirectory) scanFtpDirectory(client, child, result, depth + 1)
      else if (isBook(file.name)) result.add(Entry(file.name, child, file.size, false))
    }
  }

  private fun downloadFtp(endpoint: String, remotePath: String, username: String, password: String, target: File) {
    val uri = URI(endpoint); val client = FTPClient()
    client.connect(uri.host, if (uri.port > 0) uri.port else 21)
    if (!client.login(username.ifBlank { "anonymous" }, password.ifBlank { "anonymous@" })) throw IllegalArgumentException("FTP 登录失败")
    client.enterLocalPassiveMode(); client.setFileType(org.apache.commons.net.ftp.FTP.BINARY_FILE_TYPE)
    target.outputStream().use { output -> if (!client.retrieveFile(remotePath, output)) throw IllegalArgumentException("FTP 文件下载失败") }
    client.logout(); client.disconnect()
  }

  private fun scanSmb(endpoint: String, username: String, password: String): List<Entry> {
    val target = parseSmb(endpoint); val client = SMBClient(); val result = mutableListOf<Entry>(); val connection = client.connect(target.host)
    val session = connection.authenticate(AuthenticationContext(username, password.toCharArray(), "")); val share = session.connectShare(target.share) as DiskShare
    try { scanSmbDirectory(share, target.path, result, 0) } finally { share.close(); session.close(); connection.close(); client.close() }
    return result
  }

  private fun scanSmbDirectory(share: DiskShare, path: String, result: MutableList<Entry>, depth: Int) {
    if (depth > 12) return
    share.list(path).forEach { item ->
      val name = item.fileName
      if (name == "." || name == "..") return@forEach
      val child = join(path, name)
      val directory = (item.fileAttributes and FileAttributes.FILE_ATTRIBUTE_DIRECTORY.value) != 0L
      if (directory) scanSmbDirectory(share, child, result, depth + 1)
      else if (isBook(name)) result.add(Entry(name, child, item.endOfFile, false))
    }
  }

  private fun downloadSmb(endpoint: String, remotePath: String, username: String, password: String, target: File) {
    val parsed = parseSmb(endpoint); val client = SMBClient(); val connection = client.connect(parsed.host)
    val session = connection.authenticate(AuthenticationContext(username, password.toCharArray(), "")); val share = session.connectShare(parsed.share) as DiskShare
    try {
      val file: SmbFile = share.openFile(remotePath, EnumSet.of(AccessMask.GENERIC_READ), EnumSet.of(FileAttributes.FILE_ATTRIBUTE_NORMAL), SMB2ShareAccess.ALL, SMB2CreateDisposition.FILE_OPEN, EnumSet.of(SMB2CreateOptions.FILE_NON_DIRECTORY_FILE))
      file.inputStream.use { input -> target.outputStream().use { output -> input.copyTo(output) } }; file.close()
    } finally { share.close(); session.close(); connection.close(); client.close() }
  }

  private data class SmbTarget(val host: String, val share: String, val path: String)
  private fun parseSmb(endpoint: String): SmbTarget {
    val uri = Uri.parse(endpoint); val segments = uri.pathSegments.filter(String::isNotBlank)
    if (uri.host.isNullOrBlank() || segments.isEmpty()) throw IllegalArgumentException("SMB 地址应为 smb://服务器/共享名/目录")
    return SmbTarget(uri.host!!, segments.first(), segments.drop(1).joinToString("/"))
  }

  private fun normalize(path: String) = path.replace('\\', '/').trim('/').let { if (it.isEmpty()) "/" else "/$it" }
  private fun join(base: String, name: String) = if (base == "/" || base.isEmpty()) "/$name" else "$base/${name.trimStart('/')}"
  private fun isBook(name: String) = name.lowercase().endsWith(".epub") || name.lowercase().endsWith(".mobi") || name.lowercase().endsWith(".pdf")
}
