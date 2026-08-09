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
