import UIKit
import UniformTypeIdentifiers

private enum ShareExtensionHandoff {
  static let appGroupIdentifier = "group.com.anonymous.studio-mobile"
  static let pendingShareURLKey = "pendingChatGPTShareURL"
}

final class ShareViewController: UIViewController {
  private let activityIndicator = UIActivityIndicatorView(style: .medium)
  private let statusLabel = UILabel()
  private var hasStartedForward = false
  private var completionWorkItem: DispatchWorkItem?

  override func viewDidLoad() {
    super.viewDidLoad()

    view.backgroundColor = .systemBackground

    activityIndicator.translatesAutoresizingMaskIntoConstraints = false
    activityIndicator.startAnimating()

    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.text = "Opening H2O Studio…"
    statusLabel.font = .preferredFont(forTextStyle: .body)
    statusLabel.textColor = .secondaryLabel
    statusLabel.numberOfLines = 0
    statusLabel.textAlignment = .center

    view.addSubview(activityIndicator)
    view.addSubview(statusLabel)

    NSLayoutConstraint.activate([
      activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -18),
      statusLabel.topAnchor.constraint(equalTo: activityIndicator.bottomAnchor, constant: 16),
      statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !hasStartedForward else { return }
    hasStartedForward = true
    forwardSharedLinkToHostApp()
  }

  private func forwardSharedLinkToHostApp() {
    extractSharedValue { [weak self] candidate in
      DispatchQueue.main.async {
        guard let self else { return }
        guard
          let candidate = candidate?.trimmingCharacters(in: .whitespacesAndNewlines),
          !candidate.isEmpty,
          let deepLink = self.makeHostAppURL(for: candidate)
        else {
          self.finishWithError("Couldn't hand off the shared link.")
          return
        }

        _ = self.storePendingSharedLink(candidate)
        self.extensionContext?.open(deepLink) { success in
          DispatchQueue.main.async {
            if success {
              self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            } else {
              self.finishQueuedImport()
            }
          }
        }
      }
    }
  }

  private func extractSharedValue(completion: @escaping (String?) -> Void) {
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    let providers = items.flatMap { $0.attachments ?? [] }
    loadCandidate(from: providers, index: 0, completion: completion)
  }

  private func loadCandidate(
    from providers: [NSItemProvider],
    index: Int,
    completion: @escaping (String?) -> Void
  ) {
    guard index < providers.count else {
      completion(nil)
      return
    }

    loadCandidate(from: providers[index]) { [weak self] value in
      guard let self else { return }
      if let value {
        completion(value)
      } else {
        self.loadCandidate(from: providers, index: index + 1, completion: completion)
      }
    }
  }

  private func loadCandidate(from provider: NSItemProvider, completion: @escaping (String?) -> Void) {
    let identifiers = [
      UTType.url.identifier,
      UTType.plainText.identifier,
      UTType.text.identifier,
    ]
    loadCandidate(from: provider, identifiers: identifiers[...], completion: completion)
  }

  private func loadCandidate(
    from provider: NSItemProvider,
    identifiers: ArraySlice<String>,
    completion: @escaping (String?) -> Void
  ) {
    guard let identifier = identifiers.first else {
      completion(nil)
      return
    }

    guard provider.hasItemConformingToTypeIdentifier(identifier) else {
      loadCandidate(from: provider, identifiers: identifiers.dropFirst(), completion: completion)
      return
    }

    provider.loadItem(forTypeIdentifier: identifier, options: nil) { [weak self] item, _ in
      guard let self else { return }
      if let candidate = self.extractString(from: item) {
        completion(candidate)
      } else {
        self.loadCandidate(from: provider, identifiers: identifiers.dropFirst(), completion: completion)
      }
    }
  }

  private func extractString(from item: NSSecureCoding?) -> String? {
    switch item {
    case let url as URL:
      return url.absoluteString
    case let nsurl as NSURL:
      return nsurl.absoluteString
    case let text as String:
      return firstURL(in: text) ?? text.trimmingCharacters(in: .whitespacesAndNewlines)
    case let data as Data:
      guard let text = String(data: data, encoding: .utf8) else { return nil }
      return firstURL(in: text) ?? text.trimmingCharacters(in: .whitespacesAndNewlines)
    default:
      return nil
    }
  }

  private func firstURL(in text: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
      return trimmed
    }

    guard let match = trimmed.range(of: #"https?://\S+"#, options: .regularExpression) else {
      return nil
    }
    return String(trimmed[match])
  }

  private func makeHostAppURL(for value: String) -> URL? {
    guard var components = URLComponents(string: "studiomobile:///import-chatgpt-link") else {
      return nil
    }
    components.queryItems = [
      URLQueryItem(name: "source", value: "share-extension"),
      URLQueryItem(name: "url", value: value),
    ]
    return components.url
  }

  private func pendingShareFileURL() -> URL? {
    guard let containerURL = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: ShareExtensionHandoff.appGroupIdentifier
    ) else {
      return nil
    }
    return containerURL.appendingPathComponent("\(ShareExtensionHandoff.pendingShareURLKey).txt")
  }

  private func storePendingSharedLink(_ value: String) -> Bool {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let fileURL = pendingShareFileURL() else {
      return false
    }

    do {
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try trimmed.write(to: fileURL, atomically: true, encoding: .utf8)
      let stored = try String(contentsOf: fileURL, encoding: .utf8)
      return stored.trimmingCharacters(in: .whitespacesAndNewlines) == trimmed
    } catch {
      return false
    }
  }

  private func finishWithError(_ message: String) {
    completionWorkItem?.cancel()
    activityIndicator.stopAnimating()
    statusLabel.text = message
  }

  private func finishQueuedImport() {
    completionWorkItem?.cancel()
    activityIndicator.stopAnimating()
    statusLabel.text = "Link saved. Open H2O Studio to import."

    let workItem = DispatchWorkItem { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    completionWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: workItem)
  }
}
