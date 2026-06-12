import AppKit
import Foundation
import Vision

func recognizeText(from imageURL: URL) -> String {
    guard let image = NSImage(contentsOf: imageURL) else { return "" }
    var rect = CGRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { return "" }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.02

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
    } catch {
        return ""
    }

    let observations = request.results ?? []
    let lines = observations.compactMap { observation in
        observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines)
    }.filter { !$0.isEmpty }

    return lines.joined(separator: "\n")
}

let arguments = Array(CommandLine.arguments.dropFirst())
let output = arguments.map { path in
    recognizeText(from: URL(fileURLWithPath: path))
}.filter { !$0.isEmpty }

FileHandle.standardOutput.write(output.joined(separator: "\n\n").data(using: .utf8) ?? Data())
