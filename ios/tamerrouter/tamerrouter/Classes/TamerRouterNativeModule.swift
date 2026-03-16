import Foundation
import UIKit
import Lynx

@objcMembers
public final class TamerRouterNativeModule: NSObject, LynxModule {

    public static var name: String { "TamerRouterNativeModule" }

    public static var methodLookup: [String: String] {
        [
            "setTransitionConfig": NSStringFromSelector(#selector(setTransitionConfig(_:direction:mode:))),
            "setTransitionOptions": NSStringFromSelector(#selector(setTransitionOptions(_:))),
            "setHistoryState": NSStringFromSelector(#selector(setHistoryState(_:))),
            "consumeHistoryState": NSStringFromSelector(#selector(consumeHistoryState(_:))),
            "preparePop": NSStringFromSelector(#selector(preparePop(_:))),
            "preparePush": NSStringFromSelector(#selector(preparePush(_:optionsJson:))),
            "prepareReplace": NSStringFromSelector(#selector(prepareReplace(_:optionsJson:))),
            "requestPush": NSStringFromSelector(#selector(requestPush(_:optionsJson:callback:))),
            "requestReplace": NSStringFromSelector(#selector(requestReplace(_:optionsJson:callback:))),
            "requestPop": NSStringFromSelector(#selector(requestPop(_:callback:))),
            "didHandleBack": NSStringFromSelector(#selector(didHandleBack(_:))),
            "push": NSStringFromSelector(#selector(push)),
            "pop": NSStringFromSelector(#selector(pop)),
            "replace": NSStringFromSelector(#selector(replace)),
        ]
    }

    public static weak var instance: TamerRouterNativeModule?

    private static var transitionEnabled: Bool = true
    private static var slideFromRight: Bool = true
    private static var scrollMode: Bool = false
    private static var historyState: String = #"{"entries":["/"],"index":0}"#

    private weak var lynxContext: LynxContext?
    private var snapshotOverlay: UIView?
    private var overrideFromRight: Bool?
    private var overrideScrollMode: Bool?
    private var pendingBackCallback: ((Bool) -> Void)?

    public init(param: Any) {
        super.init()
        lynxContext = param as? LynxContext
        Self.instance = self
    }

    public override init() {
        super.init()
        Self.instance = self
    }

    // MARK: - Lynx Methods

    @objc func setTransitionConfig(_ enabled: NSNumber?, direction: String?, mode: String?) {
        if let enabled = enabled { TamerRouterNativeModule.transitionEnabled = enabled.boolValue }
        if let direction = direction { TamerRouterNativeModule.slideFromRight = direction != "left" }
        if let mode = mode { TamerRouterNativeModule.scrollMode = mode == "scroll" }
    }

    @objc func setTransitionOptions(_ optionsJson: String?) {
        applyOptionsOverride(optionsJson)
    }

    @objc func setHistoryState(_ stateJson: String) {
        guard !stateJson.isEmpty else { return }
        TamerRouterNativeModule.historyState = stateJson
    }

    @objc func consumeHistoryState(_ callback: @escaping (String) -> Void) {
        callback(TamerRouterNativeModule.historyState)
    }

    @objc func preparePop(_ optionsJson: String?) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            emitBack()
            return
        }
        DispatchQueue.main.async {
            let scrollMode = self.overrideScrollMode ?? TamerRouterNativeModule.scrollMode
            guard let snapshot = self.captureView(view), let parent = view.superview else {
                self.emitBack()
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: scrollMode ? parent.subviews.firstIndex(of: view)! + 1 : parent.subviews.firstIndex(of: view)!)
            self.snapshotOverlay = overlay
            self.emitBack()
        }
    }

    @objc func preparePush(_ route: String, optionsJson: String?) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            emitNavigate(route)
            return
        }
        DispatchQueue.main.async {
            let scrollMode = self.overrideScrollMode ?? TamerRouterNativeModule.scrollMode
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                self.emitNavigate(route)
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: scrollMode ? viewIndex + 1 : viewIndex)
            self.snapshotOverlay = overlay
            self.emitNavigate(route)
        }
    }

    @objc func prepareReplace(_ route: String, optionsJson: String?) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            emitReplace(route)
            return
        }
        DispatchQueue.main.async {
            let scrollMode = self.overrideScrollMode ?? TamerRouterNativeModule.scrollMode
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                self.emitReplace(route)
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: scrollMode ? viewIndex + 1 : viewIndex)
            self.snapshotOverlay = overlay
            self.emitReplace(route)
        }
    }

    @objc func requestPush(_ route: String, optionsJson: String?, callback: @escaping (String) -> Void) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            callback("{}")
            return
        }
        DispatchQueue.main.async {
            let scrollMode = self.overrideScrollMode ?? TamerRouterNativeModule.scrollMode
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                callback("{}")
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: scrollMode ? viewIndex + 1 : viewIndex)
            self.snapshotOverlay = overlay
            callback("{}")
        }
    }

    @objc func requestReplace(_ route: String, optionsJson: String?, callback: @escaping (String) -> Void) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            callback("{}")
            return
        }
        DispatchQueue.main.async {
            let scrollMode = self.overrideScrollMode ?? TamerRouterNativeModule.scrollMode
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                callback("{}")
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: scrollMode ? viewIndex + 1 : viewIndex)
            self.snapshotOverlay = overlay
            callback("{}")
        }
    }

    @objc func requestPop(_ optionsJson: String?, callback: @escaping (String) -> Void) {
        applyOptionsOverride(optionsJson)
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            callback("{}")
            return
        }
        DispatchQueue.main.async {
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                callback("{}")
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: viewIndex)
            self.snapshotOverlay = overlay
            callback("{}")
        }
    }

    @objc func didHandleBack(_ consumed: Bool) {
        let cb = pendingBackCallback
        pendingBackCallback = nil
        DispatchQueue.main.async { cb?(consumed) }
    }

    @objc func push() {
        let overlay = snapshotOverlay
        snapshotOverlay = nil
        let (fromRight, scrollMode) = consumeOverride()
        DispatchQueue.main.async {
            guard TamerRouterNativeModule.transitionEnabled else {
                overlay?.removeFromSuperview()
                return
            }
            if let overlay = overlay {
                self.animatePushWithOverlay(overlay, fromRight: fromRight, scrollMode: scrollMode)
            } else if let view = self.lynxContext?.getLynxView() {
                self.animateHostView(view, fromRight: fromRight)
            }
        }
    }

    @objc func pop() {
        let overlay = snapshotOverlay
        snapshotOverlay = nil
        let (fromRight, scrollMode) = consumeOverride()
        DispatchQueue.main.async {
            guard TamerRouterNativeModule.transitionEnabled else {
                overlay?.removeFromSuperview()
                return
            }
            if let overlay = overlay {
                self.animatePopWithOverlay(overlay, fromRight: fromRight, scrollMode: scrollMode)
            } else if let view = self.lynxContext?.getLynxView() {
                self.animateHostView(view, fromRight: !fromRight)
            }
        }
    }

    @objc func replace() {
        let overlay = snapshotOverlay
        snapshotOverlay = nil
        let (fromRight, scrollMode) = consumeOverride()
        DispatchQueue.main.async {
            guard TamerRouterNativeModule.transitionEnabled else {
                overlay?.removeFromSuperview()
                return
            }
            if let overlay = overlay {
                self.animatePushWithOverlay(overlay, fromRight: fromRight, scrollMode: scrollMode)
            } else if let view = self.lynxContext?.getLynxView() {
                self.animateHostView(view, fromRight: fromRight)
            }
        }
    }

    // MARK: - Back Event (called from host view controller for swipe-back / hardware back)

    public static func requestBack(callback: @escaping (Bool) -> Void) {
        guard let mod = instance else { callback(false); return }
        mod.sendBackEvent(callback: callback)
    }

    func sendBackEvent(callback: @escaping (Bool) -> Void) {
        pendingBackCallback = callback
        guard TamerRouterNativeModule.transitionEnabled, let view = lynxContext?.getLynxView() else {
            emitBack()
            scheduleBackTimeout()
            return
        }
        DispatchQueue.main.async {
            guard let snapshot = self.captureView(view), let parent = view.superview,
                  let viewIndex = parent.subviews.firstIndex(of: view) else {
                self.emitBack()
                self.scheduleBackTimeout()
                return
            }
            let overlay = UIImageView(image: snapshot)
            overlay.frame = view.frame
            parent.insertSubview(overlay, at: viewIndex)
            self.snapshotOverlay = overlay
            self.emitBack()
            self.scheduleBackTimeout()
        }
    }

    private func scheduleBackTimeout() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self else { return }
            if let cb = self.pendingBackCallback {
                self.pendingBackCallback = nil
                cb(false)
            }
        }
    }

    // MARK: - Private Helpers

    private func applyOptionsOverride(_ optionsJson: String?) {
        overrideFromRight = nil
        overrideScrollMode = nil
        guard let json = optionsJson, !json.isEmpty,
              let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let dir = dict["direction"] as? String { overrideFromRight = dir != "left" }
        if let mode = dict["mode"] as? String { overrideScrollMode = mode == "scroll" }
    }

    private func consumeOverride() -> (Bool, Bool) {
        let fromRight = overrideFromRight ?? TamerRouterNativeModule.slideFromRight
        let scroll = overrideScrollMode ?? TamerRouterNativeModule.scrollMode
        overrideFromRight = nil
        overrideScrollMode = nil
        return (fromRight, scroll)
    }

    private func captureView(_ view: UIView) -> UIImage? {
        let size = view.bounds.size
        guard size.width > 0, size.height > 0 else { return nil }
        return UIGraphicsImageRenderer(size: size).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
        }
    }

    private func animatePushWithOverlay(_ overlay: UIView, fromRight: Bool, scrollMode: Bool) {
        guard let view = lynxContext?.getLynxView() else { overlay.removeFromSuperview(); return }
        let width = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width
        view.transform = CGAffineTransform(translationX: fromRight ? width : -width, y: 0)
        UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseInOut) {
            view.transform = .identity
            if scrollMode {
                overlay.transform = CGAffineTransform(translationX: fromRight ? -width : width, y: 0)
            }
        } completion: { _ in overlay.removeFromSuperview() }
    }

    private func animatePopWithOverlay(_ overlay: UIView, fromRight: Bool, scrollMode: Bool) {
        guard let view = lynxContext?.getLynxView() else { overlay.removeFromSuperview(); return }
        let width = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width
        view.transform = CGAffineTransform(translationX: fromRight ? -width : width, y: 0)
        UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseInOut) {
            view.transform = .identity
            overlay.transform = CGAffineTransform(translationX: fromRight ? width : -width, y: 0)
        } completion: { _ in overlay.removeFromSuperview() }
    }

    private func animateHostView(_ view: UIView, fromRight: Bool) {
        let width = view.bounds.width > 0 ? view.bounds.width : UIScreen.main.bounds.width
        view.transform = CGAffineTransform(translationX: fromRight ? width : -width, y: 0)
        view.alpha = 0.92
        UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseInOut) {
            view.transform = .identity
            view.alpha = 1.0
        }
    }

    private func emitNavigate(_ route: String) {
        guard let ctx = lynxContext else { return }
        let escaped = route.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        emitEvent(ctx, name: "tamer-router:navigate", payload: "{\"route\":\"\(escaped)\",\"action\":\"push\"}")
    }

    private func emitReplace(_ route: String) {
        guard let ctx = lynxContext else { return }
        let escaped = route.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        emitEvent(ctx, name: "tamer-router:navigate", payload: "{\"route\":\"\(escaped)\",\"action\":\"replace\"}")
    }

    private func emitBack() {
        guard let ctx = lynxContext else { return }
        emitEvent(ctx, name: "tamer-router:back", payload: "{}")
    }

    private func emitEvent(_ ctx: LynxContext, name: String, payload: String) {
        DispatchQueue.main.async {
            ctx.sendGlobalEvent(name, withParams: [["payload": payload]])
        }
    }
}
