package com.nanofuxion.tamerrouter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import org.json.JSONObject
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
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

    @Volatile
    private var snapshotOverlay: ImageView? = null

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
        if (!Companion.transitionEnabled) {
            emitBack()
            scheduleBackTimeout()
            return
        }
        val view = hostView ?: run {
            emitBack()
            scheduleBackTimeout()
            return
        }
        view.post {
            val bitmap = captureView(view)
            if (bitmap == null) {
                emitBack()
                scheduleBackTimeout()
                return@post
            }
            val parent = view.parent as? ViewGroup
            if (parent == null) {
                bitmap.recycle()
                emitBack()
                scheduleBackTimeout()
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            parent.addView(overlay, parent.indexOfChild(view))
            snapshotOverlay = overlay
            emitBack()
            scheduleBackTimeout()
        }
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
        if (!Companion.transitionEnabled) {
            emitBack()
            return
        }
        val view = hostView ?: return
        view.post {
            val bitmap = captureView(view) ?: run {
                emitBack()
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                emitBack()
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            val index = parent.indexOfChild(view)
            val scrollMode = overrideScrollMode ?: Companion.scrollMode
            parent.addView(overlay, if (scrollMode) index + 1 else index)
            snapshotOverlay = overlay
            emitBack()
        }
    }

    @LynxMethod
    fun preparePush(route: String, optionsJson: String? = null) {
        applyOptionsOverride(optionsJson)
        if (!Companion.transitionEnabled) {
            emitNavigate(route)
            return
        }
        val view = hostView ?: return
        view.post {
            val bitmap = captureView(view) ?: run {
                emitNavigate(route)
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                emitNavigate(route)
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            val index = parent.indexOfChild(view)
            val scrollMode = overrideScrollMode ?: Companion.scrollMode
            parent.addView(overlay, if (scrollMode) index + 1 else index)
            snapshotOverlay = overlay
            emitNavigate(route)
        }
    }

    @LynxMethod
    fun prepareReplace(route: String, optionsJson: String? = null) {
        applyOptionsOverride(optionsJson)
        if (!Companion.transitionEnabled) {
            emitReplace(route)
            return
        }
        val view = hostView ?: return
        view.post {
            val bitmap = captureView(view) ?: run {
                emitReplace(route)
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                emitReplace(route)
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            val index = parent.indexOfChild(view)
            val scrollMode = overrideScrollMode ?: Companion.scrollMode
            parent.addView(overlay, if (scrollMode) index + 1 else index)
            snapshotOverlay = overlay
            emitReplace(route)
        }
    }

    @LynxMethod
    fun requestPush(route: String, optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        if (!Companion.transitionEnabled) {
            mainHandler.post { callback.invoke() }
            return
        }
        val view = hostView ?: run {
            mainHandler.post { callback.invoke() }
            return
        }
        view.post {
            val bitmap = captureView(view) ?: run {
                mainHandler.post { callback.invoke() }
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                mainHandler.post { callback.invoke() }
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            val index = parent.indexOfChild(view)
            val scrollMode = overrideScrollMode ?: Companion.scrollMode
            parent.addView(overlay, if (scrollMode) index + 1 else index)
            snapshotOverlay = overlay
            mainHandler.post { callback.invoke() }
        }
    }

    @LynxMethod
    fun requestReplace(route: String, optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        if (!Companion.transitionEnabled) {
            mainHandler.post { callback.invoke() }
            return
        }
        val view = hostView ?: run {
            mainHandler.post { callback.invoke() }
            return
        }
        view.post {
            val bitmap = captureView(view) ?: run {
                mainHandler.post { callback.invoke() }
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                mainHandler.post { callback.invoke() }
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            val index = parent.indexOfChild(view)
            val scrollMode = overrideScrollMode ?: Companion.scrollMode
            parent.addView(overlay, if (scrollMode) index + 1 else index)
            snapshotOverlay = overlay
            mainHandler.post { callback.invoke() }
        }
    }

    @LynxMethod
    fun requestPop(optionsJson: String?, callback: Callback) {
        applyOptionsOverride(optionsJson)
        if (!Companion.transitionEnabled) {
            mainHandler.post { callback.invoke() }
            return
        }
        val view = hostView ?: run {
            mainHandler.post { callback.invoke() }
            return
        }
        view.post {
            val bitmap = captureView(view) ?: run {
                mainHandler.post { callback.invoke() }
                return@post
            }
            val parent = view.parent as? ViewGroup ?: run {
                bitmap.recycle()
                mainHandler.post { callback.invoke() }
                return@post
            }
            val overlay = ImageView(view.context).apply {
                setImageBitmap(bitmap)
                layoutParams = FrameLayout.LayoutParams(view.width, view.height)
            }
            parent.addView(overlay, parent.indexOfChild(view))
            snapshotOverlay = overlay
            mainHandler.post { callback.invoke() }
        }
    }

    private fun captureView(view: View): Bitmap? {
        val w = view.width
        val h = view.height
        if (w <= 0 || h <= 0) return null
        return try {
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { bitmap ->
                val canvas = Canvas(bitmap)
                view.draw(canvas)
            }
        } catch (e: Exception) {
            Log.e(TAG, "captureView failed", e)
            null
        }
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
        val overlay = snapshotOverlay
        snapshotOverlay = null
        val (fromRight, scrollMode) = consumeOverride()
        mainHandler.post {
            if (!Companion.transitionEnabled) {
                (overlay?.parent as? ViewGroup)?.removeView(overlay)
                return@post
            }
            if (overlay != null) animatePushWithOverlay(overlay, fromRight, scrollMode)
            else animateHostView(fromRight = fromRight)
        }
    }

    @LynxMethod
    fun pop() {
        val overlay = snapshotOverlay
        snapshotOverlay = null
        val (fromRight, scrollMode) = consumeOverride()
        mainHandler.post {
            if (!Companion.transitionEnabled) {
                (overlay?.parent as? ViewGroup)?.removeView(overlay)
                return@post
            }
            if (overlay != null) animatePopWithOverlay(overlay, fromRight, scrollMode)
            else animateHostView(fromRight = !fromRight)
        }
    }

    @LynxMethod
    fun replace() {
        val overlay = snapshotOverlay
        snapshotOverlay = null
        val (fromRight, scrollMode) = consumeOverride()
        mainHandler.post {
            if (!Companion.transitionEnabled) {
                (overlay?.parent as? ViewGroup)?.removeView(overlay)
                return@post
            }
            if (overlay != null) animatePushWithOverlay(overlay, fromRight, scrollMode)
            else animateHostView(fromRight = fromRight)
        }
    }

    private fun animatePushWithOverlay(overlay: ImageView, fromRight: Boolean, scrollMode: Boolean) {
        val view = hostView ?: return
        val width = view.width.takeIf { it > 0 } ?: 120
        val distance = width.toFloat()
        val startX = if (fromRight) distance else -distance
        view.translationX = startX
        view.alpha = 1f
        if (scrollMode) {
            val overlayEndX = if (fromRight) -distance else distance
            overlay.animate()
                .translationX(overlayEndX)
                .setDuration(220L)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .start()
        }
        view.animate()
            .translationX(0f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { mainHandler.post { (overlay.parent as? ViewGroup)?.removeView(overlay) } }
            .start()
    }

    private fun animatePopWithOverlay(overlay: ImageView, fromRight: Boolean, scrollMode: Boolean) {
        val view = hostView ?: return
        val width = view.width.takeIf { it > 0 } ?: 120
        val distance = width.toFloat()
        val overlayEndX = if (fromRight) distance else -distance
        val viewStartX = if (fromRight) -distance else distance
        view.translationX = viewStartX
        view.alpha = 1f
        overlay.animate()
            .translationX(overlayEndX)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { mainHandler.post { (overlay.parent as? ViewGroup)?.removeView(overlay) } }
            .start()
        view.animate()
            .translationX(0f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
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
