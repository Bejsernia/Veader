import ExpoModulesCore
import PDFKit
import UIKit

public class VeaderDocumentReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocumentReader")

    AsyncFunction("getPdfInfo") { (uri: String, promise: Promise) in
      do {
        let document = try openDocument(uri)
        promise.resolve(["pageCount": document.pageCount])
      } catch {
        promise.reject("PDF_INFO_FAILED", error.localizedDescription, error)
      }
    }

    AsyncFunction("renderPdfPage") { (uri: String, pageIndex: Int, targetWidth: Int, promise: Promise) in
      do {
        let document = try openDocument(uri)
        guard let page = document.page(at: pageIndex) else {
          throw NSError(domain: "VeaderDocumentReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "PDF 页面索引无效"])
        }
        let bounds = page.bounds(for: .mediaBox)
        let width = max(1, CGFloat(targetWidth))
        let scale = width / max(1, bounds.width)
        let size = CGSize(width: width, height: max(1, bounds.height * scale))
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
          UIColor.white.setFill()
          context.fill(CGRect(origin: .zero, size: size))
          context.cgContext.saveGState()
          context.cgContext.translateBy(x: 0, y: size.height)
          context.cgContext.scaleBy(x: scale, y: -scale)
          page.draw(with: .mediaBox, to: context.cgContext)
          context.cgContext.restoreGState()
        }
        guard let data = image.pngData() else {
          throw NSError(domain: "VeaderDocumentReader", code: 2, userInfo: [NSLocalizedDescriptionKey: "PDF 页面渲染失败"])
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("veader-pdf-pages", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let target = root.appendingPathComponent("\(stableKey(uri))-(pageIndex)-(Int(width)).png")
        try data.write(to: target, options: .atomic)
        promise.resolve(target.absoluteString)
      } catch {
        promise.reject("PDF_RENDER_FAILED", error.localizedDescription, error)
      }
    }
  }
}

private func openDocument(_ value: String) throws -> PDFDocument {
  guard let url = URL(string: value) else {
    throw NSError(domain: "VeaderDocumentReader", code: 3, userInfo: [NSLocalizedDescriptionKey: "PDF 路径无效"])
  }
  let accessed = url.startAccessingSecurityScopedResource()
  defer { if accessed { url.stopAccessingSecurityScopedResource() } }
  guard let document = PDFDocument(url: url) else {
    throw NSError(domain: "VeaderDocumentReader", code: 4, userInfo: [NSLocalizedDescriptionKey: "无法打开 PDF 文件"])
  }
  return document
}

private func stableKey(_ value: String) -> String {
  value.utf8.reduce(into: 5381) { hash, byte in hash = ((hash << 5) &+ hash) &+ Int(byte) }
    .description
}

