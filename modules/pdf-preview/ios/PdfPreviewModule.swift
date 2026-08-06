import ExpoModulesCore
import PDFKit
import UIKit

/// Page images for a PDF that is still only on the device. The import screen
/// shows them so a page range can be checked against the book before the upload
/// and the AI parse are paid for. PDFKit draws one page at a time, so an 800
/// page curriculum costs the same per page as a short document.
public final class PdfPreviewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfPreview")

    AsyncFunction("getPageCount") { (uri: String) -> Int in
      return try Self.openDocument(uri).pageCount
    }

    AsyncFunction("renderPage") { (uri: String, page: Int, width: Double) -> String in
      let document = try Self.openDocument(uri)
      guard page >= 1, page <= document.pageCount, let pdfPage = document.page(at: page - 1) else {
        throw PageOutOfRangeException(page)
      }
      let destination = try Self.destination(for: uri, page: page, width: width)
      // Paging back and forth over the same spread is the normal way to find a
      // lesson, so a page already drawn at this width is served from disk.
      if FileManager.default.fileExists(atPath: destination.path) {
        return destination.absoluteString
      }

      let bounds = pdfPage.bounds(for: .cropBox)
      guard bounds.width > 0, bounds.height > 0 else {
        throw UnreadablePageException(page)
      }
      let scale = max(width, 1) / bounds.width
      let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
      let image = pdfPage.thumbnail(of: size, for: .cropBox)
      guard let data = image.jpegData(compressionQuality: 0.8) else {
        throw UnreadablePageException(page)
      }
      try data.write(to: destination, options: .atomic)
      return destination.absoluteString
    }

    // A curriculum PDF runs to tens of megabytes, well past what Supabase
    // storage accepts, and the importer only ever reads the chosen lesson. The
    // slice carries just those pages, so the upload is small whatever the book
    // weighs.
    AsyncFunction("extractPages") { (uri: String, fromPage: Int, toPage: Int) -> String in
      let document = try Self.openDocument(uri)
      guard fromPage >= 1, fromPage <= document.pageCount else {
        throw PageOutOfRangeException(fromPage)
      }
      let last = min(toPage, document.pageCount)
      guard last >= fromPage else {
        throw PageOutOfRangeException(toPage)
      }

      let slice = PDFDocument()
      var index = 0
      for pageNumber in fromPage...last {
        guard let page = document.page(at: pageNumber - 1)?.copy() as? PDFPage else {
          throw UnreadablePageException(pageNumber)
        }
        slice.insert(page, at: index)
        index += 1
      }

      let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
        "pdf-slice", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let destination = directory.appendingPathComponent(
        "\(Self.fingerprint(uri))-\(fromPage)-\(last).pdf")
      // A retry after a failed upload must not read a half written slice.
      if FileManager.default.fileExists(atPath: destination.path) {
        try FileManager.default.removeItem(at: destination)
      }
      guard slice.write(to: destination) else {
        throw UnreadablePageException(fromPage)
      }
      return destination.absoluteString
    }
  }

  private static func openDocument(_ uri: String) throws -> PDFDocument {
    guard let url = URL(string: uri), url.isFileURL else {
      throw UnreadablePdfException()
    }
    guard let document = PDFDocument(url: url), document.pageCount > 0 else {
      throw UnreadablePdfException()
    }
    return document
  }

  private static func destination(for uri: String, page: Int, width: Double) throws -> URL {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "pdf-preview", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let name = "\(fingerprint(uri))-\(page)@\(Int(width.rounded())).jpg"
    return directory.appendingPathComponent(name)
  }

  /// FNV-1a over the source URI. Swift's own `hashValue` is seeded per process,
  /// which would miss the cache after every relaunch.
  private static func fingerprint(_ value: String) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in Array(value.utf8) {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01b3
    }
    return String(hash, radix: 36)
  }
}

internal final class UnreadablePdfException: Exception, @unchecked Sendable {
  override var reason: String {
    "The PDF could not be opened."
  }
}

internal final class PageOutOfRangeException: GenericException<Int>, @unchecked Sendable {
  override var reason: String {
    "Page \(param) is not in this PDF."
  }
}

internal final class UnreadablePageException: GenericException<Int>, @unchecked Sendable {
  override var reason: String {
    "Page \(param) could not be drawn."
  }
}
