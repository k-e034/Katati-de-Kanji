package com.example.idsime

import android.inputmethodservice.InputMethodService
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ImeService : InputMethodService() {

    private lateinit var composingView: TextView
    private lateinit var candidateStrip: RecyclerView
    private lateinit var keyGrid: LinearLayout
    private lateinit var candidateAdapter: CandidateAdapter

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var composing = StringBuilder()
    // Candidate UX rules:
    //  - non-empty results for any current prefix of the composing text
    //    replace older ones as long as they're at least as specific
    //  - an empty result IS allowed to clear the strip, but ONLY when it
    //    corresponds to the user's fully-typed current composing (q == cur).
    //    Intermediate in-flight searches that happen to return zero while
    //    the user keeps typing do NOT clobber valid earlier candidates.
    //  - on backspace past the applied query, we reset so a fresh (shorter)
    //    search can take over.
    private var appliedQueryText = ""

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(R.layout.keyboard, null) as View
        composingView = root.findViewById(R.id.composingView)
        candidateStrip = root.findViewById(R.id.candidateStrip)
        keyGrid = root.findViewById(R.id.keyGrid)

        // Device-independent CJK rendering for user-composed text.
        ImeFonts.cjk()?.let { composingView.typeface = it }

        candidateAdapter = CandidateAdapter { ucs -> commitCandidate(ucs) }
        candidateStrip.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        candidateStrip.adapter = candidateAdapter

        buildKeyGrid()
        renderComposing()
        return root
    }

    override fun onStartInput(attribute: android.view.inputmethod.EditorInfo?, restarting: Boolean) {
        super.onStartInput(attribute, restarting)
        composing.clear()
        appliedQueryText = ""
        if (::composingView.isInitialized) renderComposing()
        if (::candidateAdapter.isInitialized) candidateAdapter.submit(emptyList())
    }

    override fun onFinishInput() {
        super.onFinishInput()
        currentInputConnection?.finishComposingText()
        composing.clear()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    // ---- 12-key flick grid ----
    //
    // Layout:
    //   [あ] [か] [さ] [⌫]
    //   [た] [な] [は] [␣]
    //   [ま] [や] [ら] [⏎]
    //   [小] [わ] [、] [✕]
    //
    // Each kana key supports tap (center) + flick left/up/right/down.

    private data class FlickDef(
        val center: String,
        // left, up, right, down (null = no flick in that direction)
        val left: String? = null, val up: String? = null, val right: String? = null, val down: String? = null,
    )

    private val kanaDefs = listOf(
        // Row 1
        listOf(
            FlickDef("あ", left = "い", up = "う", right = "え", down = "お"),
            FlickDef("か", left = "き", up = "く", right = "け", down = "こ"),
            FlickDef("さ", left = "し", up = "す", right = "せ", down = "そ"),
        ),
        // Row 2
        listOf(
            FlickDef("た", left = "ち", up = "つ", right = "て", down = "と"),
            FlickDef("な", left = "に", up = "ぬ", right = "ね", down = "の"),
            FlickDef("は", left = "ひ", up = "ふ", right = "へ", down = "ほ"),
        ),
        // Row 3
        listOf(
            FlickDef("ま", left = "み", up = "む", right = "め", down = "も"),
            FlickDef("や", up = "ゆ", down = "よ"),
            FlickDef("ら", left = "り", up = "る", right = "れ", down = "ろ"),
        ),
        // Row 4 — last cell is punctuation
        listOf(
            // First cell: 小゛゜ cycle key, handled specially (not a flick)
            FlickDef("小゛゜"),
            FlickDef("わ", left = "を", up = "ん", right = "ー"),
            FlickDef("、", left = "？", up = "。", right = "！", down = "…"),
        ),
    )

    private fun buildKeyGrid() {
        keyGrid.removeAllViews()
        keyGrid.orientation = LinearLayout.VERTICAL
        val controlLabels = listOf("⌫", "␣", "⏎", "✕")
        val controlActions = listOf(::onBackspace, ::onSpace, ::onEnter, ::onClear)
        for ((rowIdx, row) in kanaDefs.withIndex()) {
            val rowLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
                )
            }
            for (def in row) {
                if (def.center == "小゛゜") {
                    rowLayout.addView(makeControlKey("小゛゜") { cycleLastKana() }, rowWeight())
                } else {
                    rowLayout.addView(makeKanaKey(def), rowWeight())
                }
            }
            rowLayout.addView(makeControlKey(controlLabels[rowIdx]) { controlActions[rowIdx]() }, rowWeight())
            keyGrid.addView(rowLayout)
        }
    }

    private fun rowWeight(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).also {
            it.setMargins(dp(2), dp(2), dp(2), dp(2))
        }

    private fun makeKanaKey(def: FlickDef): View {
        return KanaKey(this).apply {
            center = def.center
            flicks = arrayOf(def.left, def.up, def.right, def.down)
            onPick = { label ->
                composing.append(label)
                onComposingChanged()
            }
        }
    }

    private fun makeControlKey(label: String, onClick: () -> Unit): View {
        return TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            setBackgroundResource(R.color.ime_key_bg_special)
            setTextColor(resources.getColor(R.color.ime_fg, theme))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            ImeFonts.cjk()?.let { typeface = it }
            setOnClickListener { onClick() }
        }
    }

    // ---- Key handlers ----

    private fun onBackspace() {
        if (composing.isNotEmpty()) {
            composing.deleteCharAt(composing.length - 1)
            onComposingChanged()
        } else {
            currentInputConnection?.deleteSurroundingText(1, 0)
        }
    }

    private fun onClear() {
        composing.clear()
        onComposingChanged()
    }

    private fun onSpace() {
        val ic = currentInputConnection ?: return
        if (composing.isEmpty()) {
            ic.commitText(" ", 1)
            return
        }
        val top = candidateAdapter.top()
        if (top != null) commitCandidate(top)
        else {
            ic.commitText(composing.toString(), 1)
            composing.clear()
            onComposingChanged()
        }
    }

    private fun onEnter() {
        val ic = currentInputConnection ?: return
        if (composing.isNotEmpty()) {
            ic.commitText(composing.toString(), 1)
            composing.clear()
            onComposingChanged()
        } else {
            ic.commitText("\n", 1)
        }
    }

    // Cycle the last input char through its base/dakuten/handakuten/small variants.
    private fun cycleLastKana() {
        if (composing.isEmpty()) return
        val last = composing.last()
        val next = CYCLE_NEXT[last] ?: return
        composing.setCharAt(composing.length - 1, next)
        onComposingChanged()
    }

    // ---- Composing / candidate ----

    private fun onComposingChanged() {
        renderComposing()
        scheduleSearch()
    }

    private fun renderComposing() {
        composingView.text = if (composing.isEmpty()) "" else composing.toString()
    }

    private fun scheduleSearch() {
        val q = composing.toString()
        if (q.isEmpty()) {
            appliedQueryText = ""
            candidateAdapter.submit(emptyList())
            return
        }
        // If user deleted back past what we last applied (or started fresh),
        // invalidate the applied prefix so a shorter search can take over.
        if (!q.startsWith(appliedQueryText)) {
            appliedQueryText = ""
        }
        scope.launch {
            val results = withContext(Dispatchers.IO) {
                try {
                    IdsSearch.get(applicationContext).search(q).results
                } catch (t: Throwable) {
                    Log.e("ImeService", "search failed for '$q'", t)
                    emptyList()
                }
            }
            val cur = composing.toString()
            when {
                !cur.startsWith(q) -> {
                    // The user has backspaced or switched away from this query;
                    // the result is no longer relevant.
                    Log.i("ImeService", "stale '$q' cur='$cur'")
                }
                results.isNotEmpty() && q.length >= appliedQueryText.length -> {
                    // A more-specific (or same-length) match: show it.
                    appliedQueryText = q
                    Log.i("ImeService", "candidates for '$q': ${results.size} -> ${results.take(10)}")
                    candidateAdapter.submit(results)
                }
                results.isEmpty() && q == cur -> {
                    // The user's fully-typed current input has no match. Clear
                    // the strip so they see "no match" instead of stale earlier
                    // candidates. (Intermediate empty queries where q != cur
                    // fall through to skip below.)
                    appliedQueryText = q
                    Log.i("ImeService", "no match for current '$q' -> clearing strip")
                    candidateAdapter.submit(emptyList())
                }
                else -> {
                    Log.i(
                        "ImeService",
                        "skip '$q' results=${results.size} applied='$appliedQueryText' cur='$cur'",
                    )
                }
            }
        }
    }

    private fun commitCandidate(ucs: String) {
        Log.i("ImeService", "commitCandidate '$ucs'")
        val ic = currentInputConnection
        if (ic == null) {
            Log.w("ImeService", "currentInputConnection is null")
            return
        }
        ic.commitText(ucs, 1)
        composing.clear()
        onComposingChanged()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        // Each cycle walks: base → variant → variant → ... → base.
        private val CYCLES = listOf(
            listOf('あ', 'ぁ'), listOf('い', 'ぃ'), listOf('う', 'ぅ', 'ゔ'),
            listOf('え', 'ぇ'), listOf('お', 'ぉ'),
            listOf('か', 'が'), listOf('き', 'ぎ'), listOf('く', 'ぐ'),
            listOf('け', 'げ'), listOf('こ', 'ご'),
            listOf('さ', 'ざ'), listOf('し', 'じ'), listOf('す', 'ず'),
            listOf('せ', 'ぜ'), listOf('そ', 'ぞ'),
            listOf('た', 'だ'), listOf('ち', 'ぢ'), listOf('つ', 'っ', 'づ'),
            listOf('て', 'で'), listOf('と', 'ど'),
            listOf('は', 'ば', 'ぱ'), listOf('ひ', 'び', 'ぴ'), listOf('ふ', 'ぶ', 'ぷ'),
            listOf('へ', 'べ', 'ぺ'), listOf('ほ', 'ぼ', 'ぽ'),
            listOf('や', 'ゃ'), listOf('ゆ', 'ゅ'), listOf('よ', 'ょ'),
            listOf('わ', 'ゎ'),
        )
        private val CYCLE_NEXT: Map<Char, Char> = buildMap {
            for (c in CYCLES) for (i in c.indices) put(c[i], c[(i + 1) % c.size])
        }
    }
}
