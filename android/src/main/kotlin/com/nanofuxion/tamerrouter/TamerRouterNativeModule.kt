package com.nanofuxion.tamerrouter

import android.content.Context
import org.json.JSONObject
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.LynxView
import com.lynx.tasm.behavior.LynxContext

class TamerRouterNativeModule(context: Context) : LynxModule(context) {

    init {
        instance = this
    }

    companion object {
        private const val TAG = "TamerRouterNative"
        private const val BACK_TIMEOUT_MS = 200L

        @Volatile
        var instance: TamerRouterNativeModule? = null
            private set

        @Volatile
        private var hostView: View? = null

        @Volatile
        private var transitionEnabled: Boolean = true

        @Volatile
        private var slideFromRight: Boolean = true

        @Volatile
        private var scrollMode: Boolean = false

        @Volatile
        private var overrideFromRight: Boolean? = null

        @Volatile
        private var overrideScrollMode: Boolean? = null

        @Volatile
        private var historyStateJson: String = """{"entries":["/"],"index":0}"""

        fun attachHostView(view: View?) {
            hostView = view
        }

        fun requestBack(callback: (consumed: Boolean) -> Unit) {
            val mod = instance
            if (mod == null) {
                callback(false)
                return
            }
            mod.sendBackEvent(callback)
        }
    }

    @Volatile
    private var pendingBackCallback: ((Boolean) -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    @LynxMethod
    fun setTransitionConfig(enabled: Boolean?, direction: String?, mode: String?) {
        if (enabled != null) Companion.transitionEnabled = enabled
        if (direction != null) Companion.slideFromRight = direction != "left"
        if (mode != null) Companion.scrollMode = mode == "scroll"
    }

    @LynxMethod
    fun setTransitionOptions(optionsJson: String?) {
        applyOptionsOverride(optionsJson)
    }

    @LynxMethod
    fun setHistoryState(stateJson: String?) {
        if (!stateJson.isNullOrBlank()) {
            Companion.historyStateJson = stateJson
        }
    }

    @LynxMethod
    fun consumeHistoryState(callback: com.lynx.react.bridge.Callback) {
        callback.invoke(Companion.historyStateJson)
    }

    private fun sendBackEvent(callback: (Boolean) -> Unit) {
        val lynxContext = getLynxContext()
        if (lynxContext == null) {
            callback(false)
            return
        }
        pendingBackCallback = callback
        emitBack()
        scheduleBackTimeout()
    }

    private fun scheduleBackTimeout() {
        mainHandler.postDelayed({
            val cb = pendingBackCallback
            if (cb != null) {
                pendingBackCallback = null
                cb(false)
            }
        }, BACK_TIMEOUT_MS)
    }

    @LynxMethod
    fun didHandleBack(consumed: Boolean) {
        val cb = pendingBackCallback
        pendingBackCallback = null
        if (cb != null) {
            mainHandler.post { cb(consumed) }
        } else {
            Log.w(TAG, "didHandleBack($consumed) with no pending callback")
        }
    }

    private fun applyOptionsOverride(optionsJson: String?) {
        if (optionsJson.isNullOrBlank()) return
        overrideFromRight = null
        overrideScrollMode = null
        try {
            val json = JSONObject(optionsJson)
            if (json.has("direction")) overrideFromRight = json.getString("direction") != "left"
            if (json.has("mode")) overrideScrollMode = json.getString("mode") == "scroll"
        } catch (_: Exception) {}
    }

    private fun consumeOverride(): Pair<Boolean, Boolean> {
        val fromRight = overrideFromRight ?: Companion.slideFromRight
        val scrollMode = overrideScrollMode ?: Companion.scrollMode
        overrideFromRight = null
        overrideScrollMode = null
        return Pair(fromRight, scrollMode)
    }

    @LynxMethod
    fun preparePop(optionsJson: String? = null) {
        applyOptionsOverride(optionsJson)
        emitBack()
    }

    @LynxMethod
    fun preparePush(route: String, optionsJson: String? = null) {
        applyOptionsOverride(optionsJson)
        emitNavigate(route)
    }

    @LynxMethod
    fun prepareReplace(route: String, optionsJson: String? = null) {
        applyOptionsOverride(optionsJson)
        emitReplace(route)
    }

    @LynxMethod
    fun requestPush(route: String, optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        mainHandler.post { callback.invoke() }
    }

    @LynxMethod
    fun requestReplace(route: String, optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        mainHandler.post { callback.invoke() }
    }

    @LynxMethod
    fun requestPop(optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        mainHandler.post { callback.invoke() }
    }

    private fun getLynxContext(): LynxContext? {
        val view = hostView ?: return null
        return (view as? LynxView)?.lynxContext
    }

    private fun emitNavigate(route: String) {
        val lynxContext = getLynxContext() ?: return
        emitAction(lynxContext, route, "push")
    }

    private fun emitReplace(route: String) {
        val lynxContext = getLynxContext() ?: return
        emitAction(lynxContext, route, "replace")
    }

    private fun emitAction(lynxContext: LynxContext, route: String, action: String) {
        val escaped = route.replace("\\", "\\\\").replace("\"", "\\\"")
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap().apply { putString("payload", """{"route":"$escaped","action":"$action"}""") })
        lynxContext.sendGlobalEvent(NAVIGATE_EVENT, params)
    }

    private fun emitBack() {
        val lynxContext = getLynxContext() ?: return
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap().apply { putString("payload", "{}") })
        lynxContext.sendGlobalEvent(BACK_EVENT, params)
    }

    @LynxMethod
    fun push() {
        val (fromRight, _) = consumeOverride()
        mainHandler.post {
            if (Companion.transitionEnabled) animateHostView(fromRight = fromRight)
        }
    }

    @LynxMethod
    fun pop() {
        val (fromRight, _) = consumeOverride()
        mainHandler.post {
            if (Companion.transitionEnabled) animateHostView(fromRight = !fromRight)
        }
    }

    @LynxMethod
    fun replace() {
        val (fromRight, _) = consumeOverride()
        mainHandler.post {
            if (Companion.transitionEnabled) animateHostView(fromRight = fromRight)
        }
    }

    private fun animateHostView(fromRight: Boolean) {
        val view = hostView ?: return
        view.post {
            val distance = (view.width.takeIf { it > 0 } ?: 120).toFloat()
            val start = if (fromRight) distance else -distance
            view.translationX = start
            view.alpha = 0.92f
            view.animate()
                .translationX(0f)
                .alpha(1f)
                .setDuration(220L)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }
    }
}

const val BACK_EVENT = "tamer-router:back"
const val NAVIGATE_EVENT = "tamer-router:navigate"
