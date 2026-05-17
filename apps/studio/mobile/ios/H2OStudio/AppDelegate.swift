internal import Expo
import React
import ReactAppDependencyProvider

private enum ShareExtensionHandoff {
  static let appGroupIdentifier = "group.com.anonymous.studio-mobile"
  static let pendingShareURLKey = "pendingChatGPTShareURL"
  static let linkingNotificationName = "RCTOpenURLNotification"
}

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var didDispatchPendingSharedLink = false

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let adjustedLaunchOptions = adjustedLaunchOptionsForIncomingURL(launchOptions) ?? synthesizedLaunchOptionsForPendingShare()
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: adjustedLaunchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: adjustedLaunchOptions)
  }

  public override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    dispatchPendingSharedLinkIfNeeded()
  }

  public override func applicationDidEnterBackground(_ application: UIApplication) {
    super.applicationDidEnterBackground(application)
    didDispatchPendingSharedLink = false
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    let adjustedURL = adjustedIncomingURL(url)
    return super.application(app, open: adjustedURL, options: options) || RCTLinkingManager.application(app, open: adjustedURL, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  private func adjustedLaunchOptionsForIncomingURL(
    _ launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    guard
      var adjustedLaunchOptions = launchOptions,
      let incomingURL = launchOptions?[.url] as? URL
    else {
      return launchOptions
    }

    adjustedLaunchOptions[.url] = adjustedIncomingURL(incomingURL)
    return adjustedLaunchOptions
  }

  private func adjustedIncomingURL(_ url: URL) -> URL {
    guard isImportChatGPTLinkURL(url), !hasIncomingShareURLQuery(url) else {
      return url
    }
    guard let pendingShareURL = consumePendingShareURL() else {
      return url
    }
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return url
    }

    var queryItems = components.queryItems ?? []
    queryItems.removeAll { $0.name == "url" }
    queryItems.append(URLQueryItem(name: "url", value: pendingShareURL))
    components.queryItems = queryItems
    return components.url ?? url
  }

  private func isImportChatGPTLinkURL(_ url: URL) -> Bool {
    let host = url.host ?? ""
    let trimmedPath = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let route = [host, trimmedPath].filter { !$0.isEmpty }.joined(separator: "/")
    return route == "import-chatgpt-link"
  }

  private func hasIncomingShareURLQuery(_ url: URL) -> Bool {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      return false
    }
    return components.queryItems?.contains(where: {
      $0.name == "url" && !($0.value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }) ?? false
  }

  private func consumePendingShareURL() -> String? {
    guard let fileURL = pendingShareFileURL() else {
      return nil
    }

    do {
      let pendingShareURL = try String(contentsOf: fileURL, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines)
      guard !pendingShareURL.isEmpty else {
        try? FileManager.default.removeItem(at: fileURL)
        return nil
      }

      try? FileManager.default.removeItem(at: fileURL)
      return pendingShareURL
    } catch {
      return nil
    }
  }

  private func pendingShareFileURL() -> URL? {
    guard let containerURL = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: ShareExtensionHandoff.appGroupIdentifier
    ) else {
      return nil
    }
    return containerURL.appendingPathComponent("\(ShareExtensionHandoff.pendingShareURLKey).txt")
  }

  private func synthesizedLaunchOptionsForPendingShare() -> [UIApplication.LaunchOptionsKey: Any]? {
    guard let pendingShareURL = consumePendingShareURL(),
          let importURL = buildImportChatGPTLinkURL(for: pendingShareURL) else {
      return nil
    }
    didDispatchPendingSharedLink = true
    return [.url: importURL]
  }

  private func buildImportChatGPTLinkURL(for pendingShareURL: String) -> URL? {
    guard var components = URLComponents(string: "studiomobile:///import-chatgpt-link") else {
      return nil
    }
    components.queryItems = [
      URLQueryItem(name: "source", value: "share-extension"),
      URLQueryItem(name: "url", value: pendingShareURL),
    ]
    return components.url
  }

  private func dispatchPendingSharedLinkIfNeeded() {
    guard !didDispatchPendingSharedLink else { return }
    guard let pendingShareURL = consumePendingShareURL(),
          let importURL = buildImportChatGPTLinkURL(for: pendingShareURL) else {
      return
    }

    didDispatchPendingSharedLink = true
    NotificationCenter.default.post(
      name: Notification.Name(ShareExtensionHandoff.linkingNotificationName),
      object: Self.self,
      userInfo: ["url": importURL.absoluteString]
    )
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
