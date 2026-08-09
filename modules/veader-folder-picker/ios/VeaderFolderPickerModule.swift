import ExpoModulesCore
import UniformTypeIdentifiers
import UIKit

public class VeaderFolderPickerModule: Module {
  private var pickerDelegate: FolderPickerDelegate?

  public func definition() -> ModuleDefinition {
    Name("VeaderFolderPicker")
    AsyncFunction("pickFolder") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let controller = self.topViewController() else {
          promise.reject("FOLDER_PICKER_UNAVAILABLE", "无法打开系统文件夹选择器")
          return
        }
        let delegate = FolderPickerDelegate { [weak self] result in
          self?.pickerDelegate = nil
          promise.resolve(result)
        }
        self.pickerDelegate = delegate
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
        picker.delegate = delegate
        picker.allowsMultipleSelection = false
        controller.present(picker, animated: true)
      }
    }

    AsyncFunction("refreshFolder") { (directoryUri: String, promise: Promise) in
      guard let bookmark = UserDefaults.standard.data(forKey: "veader.folder.bookmark.\(directoryUri)") else {
        promise.resolve(nil)
        return
      }
      do {
        var stale = false
        let folder = try URL(resolvingBookmarkData: bookmark, options: [.withoutUI, .withoutMounting], relativeTo: nil, bookmarkDataIsStale: &stale)
        let accessed = folder.startAccessingSecurityScopedResource()
        let result = enumerateFolder(folder)
        if accessed { activeSecurityScopedFolders.append(folder) }
        if stale, let refreshed = try? folder.bookmarkData(options: .suitableForBookmarkFile, includingResourceValuesForKeys: nil, relativeTo: nil) {
          UserDefaults.standard.set(refreshed, forKey: "veader.folder.bookmark.\(directoryUri)")
        }
        promise.resolve(result)
      } catch {
        promise.reject("FOLDER_REFRESH_FAILED", error.localizedDescription, error)
      }
    }
  }

  private func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    var controller = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
    while let presented = controller?.presentedViewController { controller = presented }
    return controller
  }
}

private var activeSecurityScopedFolders: [URL] = []

private final class FolderPickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let completion: ([String: Any]?) -> Void
  init(completion: @escaping ([String: Any]?) -> Void) { self.completion = completion }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let folder = urls.first else { completion(nil); return }
    let accessed = folder.startAccessingSecurityScopedResource()
    if let bookmark = try? folder.bookmarkData(options: .suitableForBookmarkFile, includingResourceValuesForKeys: nil, relativeTo: nil) {
      UserDefaults.standard.set(bookmark, forKey: "veader.folder.bookmark.\(folder.absoluteString)")
    }
    var files: [[String: Any]] = []
    if let enumerator = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles]) {
      for case let file as URL in enumerator {
        let values = try? file.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
        guard values?.isDirectory != true, let ext = file.pathExtension.lowercased() as String?, ["epub", "mobi", "pdf"].contains(ext) else { continue }
        let relativePath = file.path.replacingOccurrences(of: folder.path + "/", with: "")
        files.append(["name": file.lastPathComponent, "path": relativePath, "uri": file.absoluteString, "size": values?.fileSize ?? 0])
      }
    }
    if accessed { activeSecurityScopedFolders.append(folder) }
    completion(["directoryUri": folder.absoluteString, "files": files])
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { completion(nil) }
}

private func enumerateFolder(_ folder: URL) -> [String: Any] {
  var files: [[String: Any]] = []
  if let enumerator = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles]) {
    for case let file as URL in enumerator {
      let values = try? file.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
      guard values?.isDirectory != true, ["epub", "mobi", "pdf"].contains(file.pathExtension.lowercased()) else { continue }
      let relativePath = file.path.replacingOccurrences(of: folder.path + "/", with: "")
      files.append(["name": file.lastPathComponent, "path": relativePath, "uri": file.absoluteString, "size": values?.fileSize ?? 0])
    }
  }
  return ["directoryUri": folder.absoluteString, "files": files]
}
