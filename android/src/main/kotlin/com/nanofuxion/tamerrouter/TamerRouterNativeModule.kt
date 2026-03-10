package com.nanofuxion.tamerrouter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
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
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
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

    private fun sendBackEvent(callback: (Boolean) -> Unit) {
        val lynxContext = mContext as? LynxContext
        if (lynxContext == null) {
            callback(false)
            return
        }
        pendingBackCallback = callback
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

    @LynxMethod
    fun preparePop() {
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
            parent.addView(overlay, parent.indexOfChild(view))
            snapshotOverlay = overlay
            emitBack()
        }
    }

    @LynxMethod
    fun preparePush(route: String) {
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
            parent.addView(overlay, index)
            snapshotOverlay = overlay
            emitNavigate(route)
        }
    }

    @LynxMethod
    fun prepareReplace(route: String) {
        val view = hostView ?: return
        view.post {
            emitReplace(route)
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

    private fun emitNavigate(route: String) {
        val lynxContext = mContext as? LynxContext ?: return
        emitAction(lynxContext, route, "push")
    }

    private fun emitReplace(route: String) {
        val lynxContext = mContext as? LynxContext ?: return
        emitAction(lynxContext, route, "replace")
    }

    private fun emitAction(lynxContext: LynxContext, route: String, action: String) {
        val escaped = route.replace("\\", "\\\\").replace("\"", "\\\"")
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap().apply { putString("payload", """{"route":"$escaped","action":"$action"}""") })
        lynxContext.sendGlobalEvent(NAVIGATE_EVENT, params)
    }

    private fun emitBack() {
        val lynxContext = mContext as? LynxContext ?: return
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap().apply { putString("payload", "{}") })
        lynxContext.sendGlobalEvent(BACK_EVENT, params)
    }

    @LynxMethod
    fun push() {
        val overlay = snapshotOverlay
        snapshotOverlay = null
        mainHandler.post {
            if (overlay != null) animatePushWithOverlay(overlay)
            else animateHostView(fromRight = true)
        }
    }

    @LynxMethod
    fun pop() {
        val overlay = snapshotOverlay
        snapshotOverlay = null
        mainHandler.post {
            if (overlay != null) animatePopWithOverlay(overlay)
            else animateHostView(fromRight = false)
        }
    }

    @LynxMethod
    fun replace() {
        snapshotOverlay = null
        mainHandler.post {
            animateHostView(fromRight = true)
        }
    }

    private fun animatePushWithOverlay(overlay: ImageView) {
        val view = hostView ?: return
        val width = view.width.takeIf { it > 0 } ?: 120
        view.translationX = width.toFloat()
        view.alpha = 1f
        view.animate()
            .translationX(0f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { (overlay.parent as? ViewGroup)?.removeView(overlay) }
            .start()
    }

    private fun animatePopWithOverlay(overlay: ImageView) {
        val view = hostView ?: return
        val width = view.width.takeIf { it > 0 } ?: 120
        overlay.animate()
            .translationX(width.toFloat())
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { (overlay.parent as? ViewGroup)?.removeView(overlay) }
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
