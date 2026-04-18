package com.nanofuxion.tamerrouter

import android.content.Context
import android.util.Log
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Host wiring: back button callback registration and JS history persistence.
 * JS registers a callback via [registerBackButtonListener] that native invokes when hardware back is pressed.
 * The activity calls [invokeBackButtonCallback] when back is pressed.
 */
class TamerRouterNativeModule(context: Context) : LynxModule(context) {

    init {
        instance = this
        if (context is LynxContext) {
            Companion.lynxContext = context
        }
    }

    companion object {
        private const val TAG = "TamerRouterNative"

        @Volatile
        var instance: TamerRouterNativeModule? = null
            private set

        @Volatile
        private var lynxContext: LynxContext? = null

        @Volatile
        private var historyStateJson: String = """{"entries":["/"],"index":0}"""

        @Volatile
        private var hostSessionId: String = createSessionId()

        @Volatile
        private var historyStateSessionId: String = hostSessionId

        private fun createSessionId(): String {
            return "${System.currentTimeMillis().toString(36)}-${java.util.UUID.randomUUID().toString().take(8)}"
        }

        /**
         * Attachment point for the LynxView (for future reference or extensions).
         * Not exposed as @LynxMethod to avoid parameter type issues.
         */
        fun attachHostView(view: Any?) {
            // Placeholder for potential future use
        }

        /**
         * Called when hardware back is pressed.
         * Emits a global event and invokes the registered JS callback.
         */
        fun requestBack(fallback: ((Boolean) -> Unit)? = null) {
            Log.d(TAG, "requestBack called, lynxContext=${if (lynxContext != null) "SET" else "NULL"}")
            // Emit global event for JS listeners
            val params = JavaOnlyArray()
            if (lynxContext != null) {
                Log.d(TAG, "Emitting backButtonPressed event")
                lynxContext?.sendGlobalEvent("backButtonPressed", params)
            } else {
                Log.w(TAG, "lynxContext is null, cannot emit event")
            }

            // Also invoke direct callback if registered
            instance?.invokeBackCallback()
        }

    }

    @Volatile
    private var backButtonCallback: (Callback)? = null

    /**
     * Registers a JS callback to be invoked when hardware back is pressed.
     */
    @LynxMethod
    fun registerBackButtonListener(callback: Callback) {
        Log.d(TAG, "Registering back button listener, callback=${if (callback != null) "SET" else "NULL"}")
        backButtonCallback = callback
        Log.d(TAG, "Back button callback stored: ${if (backButtonCallback != null) "SUCCESS" else "FAILED"}")
    }

    /**
     * Called by the activity when hardware back is pressed.
     * Invokes the registered callback if available.
     */
    fun invokeBackCallback() {
        Log.d(TAG, "invokeBackCallback called, backButtonCallback=${if (backButtonCallback != null) "SET" else "NULL"}")
        if (backButtonCallback != null) {
            Log.d(TAG, "Invoking back button callback")
            backButtonCallback?.invoke()
        } else {
            Log.w(TAG, "No back button callback registered!")
        }
    }

    @LynxMethod
    fun setHistoryState(stateJson: String?) {
        if (!stateJson.isNullOrBlank()) {
            Companion.historyStateJson = stateJson
            Companion.historyStateSessionId = Companion.hostSessionId
        }
    }

    @LynxMethod
    fun consumeHistoryState(callback: Callback) {
        callback.invoke(createHistoryEnvelopeJson())
    }

    private fun createHistoryEnvelopeJson(): String {
        return try {
            val stateValue = JSONTokener(Companion.historyStateJson).nextValue()
            JSONObject()
                .put("hostSessionId", Companion.hostSessionId)
                .put("historySessionId", Companion.historyStateSessionId)
                .put("state", stateValue)
                .toString()
        } catch (_: Exception) {
            JSONObject()
                .put("hostSessionId", Companion.hostSessionId)
                .put("historySessionId", Companion.historyStateSessionId)
                .put("state", JSONObject("""{"entries":["/"],"index":0}"""))
                .toString()
        }
    }
}
