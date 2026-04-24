import Foundation
import UIKit
import Lynx

/// Host wiring only: `tamer-router:back` + `didHandleBack`, and JS history persistence.
/// One back event in flight until JS calls `didHandleBack` (React Native BackHandler–style).
/// Stack visuals are owned by `nav-screen` (`tamer-navigation`), not this module.
@objcMembers
public final class TamerRouterNativeModule: NSObject, LynxModule {

    public static var name: String { "TamerRouterNativeModule" }

    public static var methodLookup: [String: String] {
        [
            "registerBackButtonListener": NSStringFromSelector(#selector(registerBackButtonListener(_:))),
            "setHistoryState": NSStringFromSelector(#selector(setHistoryState(_:))),
            "consumeHistoryState": NSStringFromSelector(#selector(consumeHistoryState(_:))),
            "didHandleBack": NSStringFromSelector(#selector(didHandleBack(_:))),
        ]
    }

    public static weak var instance: TamerRouterNativeModule?

    private static var historyState: String = #"{"entries":["/"],"index":0}"#
    private static var hostSessionId: String = UUID().uuidString
    private static var historyStateSessionId: String = hostSessionId

    @objc public static func attachHostView(_ view: UIView?) {
        if view !== hostView, view != nil {
            hostSessionId = UUID().uuidString
            historyStateSessionId = hostSessionId
            historyState = #"{"entries":["/"],"index":0}"#
        }
        hostView = view
    }

    private static weak var hostView: UIView?

    private weak var lynxContext: LynxContext?
    private var backButtonListener: (() -> Void)?
    private var pendingBackCallback: ((Bool) -> Void)?
    private var backTimeoutWorkItem: DispatchWorkItem?

    public init(param: Any) {
        super.init()
        lynxContext = param as? LynxContext
        Self.instance = self
    }

    public override init() {
        super.init()
        Self.instance = self
    }

    @objc func registerBackButtonListener(_ callback: @escaping () -> Void) {
        backButtonListener = callback
    }

    @objc func setHistoryState(_ stateJson: String) {
        guard !stateJson.isEmpty else { return }
        TamerRouterNativeModule.historyState = stateJson
        TamerRouterNativeModule.historyStateSessionId = TamerRouterNativeModule.hostSessionId
    }

    @objc func consumeHistoryState(_ callback: @escaping (String) -> Void) {
        callback(TamerRouterNativeModule.createHistoryEnvelope())
    }

    @objc func didHandleBack(_ consumed: Bool) {
        backTimeoutWorkItem?.cancel()
        backTimeoutWorkItem = nil
        let cb = pendingBackCallback
        pendingBackCallback = nil
        DispatchQueue.main.async { cb?(consumed) }
    }

    public static func requestBack(callback: @escaping (Bool) -> Void) {
        guard let mod = instance else { callback(false); return }
        mod.sendBackEvent(callback: callback)
    }

    func sendBackEvent(callback: @escaping (Bool) -> Void) {
        guard lynxContext != nil else {
            callback(false)
            return
        }
        if pendingBackCallback != nil {
            callback(true)
            return
        }
        pendingBackCallback = callback
        emitBack()
        scheduleBackTimeout()
    }

    private func scheduleBackTimeout() {
        backTimeoutWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.backTimeoutWorkItem = nil
            if let cb = self.pendingBackCallback {
                self.pendingBackCallback = nil
                cb(false)
            }
        }
        backTimeoutWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
    }

    private static func createHistoryEnvelope() -> String {
        let fallbackState: Any = ["entries": ["/"], "index": 0]
        let parsedState = (try? JSONSerialization.jsonObject(with: Data(historyState.utf8))) ?? fallbackState
        let envelope: [String: Any] = [
            "hostSessionId": hostSessionId,
            "historySessionId": historyStateSessionId,
            "state": parsedState,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: envelope),
              let json = String(data: data, encoding: .utf8) else {
            return #"{"hostSessionId":"","historySessionId":"","state":{"entries":["/"],"index":0}}"#
        }
        return json
    }

    private func emitBack() {
        if let listener = backButtonListener {
            DispatchQueue.main.async {
                listener()
            }
            return
        }
        guard let ctx = lynxContext else { return }
        emitEvent(ctx, name: "tamer-router:back", payload: "{}")
    }

    private func emitEvent(_ ctx: LynxContext, name: String, payload: String) {
        DispatchQueue.main.async {
            ctx.sendGlobalEvent(name, withParams: [["payload": payload]])
        }
    }
}
