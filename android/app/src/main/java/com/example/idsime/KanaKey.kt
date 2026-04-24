package com.example.idsime

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

/**
 * A single 12-key flick key.
 *
 * Direction layout: center tap → [center], flick left/up/right/down → flicks[0..3].
 * While pressed we overlay a cross-shaped hint (center + 4 directions) that tracks
 * the user's finger so they can see which kana will be committed on release.
 */
class KanaKey(context: Context) : View(context) {

    var center: String = ""
    // indices: 0=left, 1=up, 2=right, 3=down
    var flicks: Array<String?> = arrayOfNulls(4)
    var onPick: ((String) -> Unit)? = null

    private val density = resources.displayMetrics.density
    private val flickThreshold = 24f * density

    // Prefer the bundled IPAmj Mincho so kana/kanji glyphs look the same
    // across devices. Falls back to DEFAULT_BOLD if the font fails to load.
    private val cjkFont: android.graphics.Typeface =
        ImeFonts.cjk(context) ?: android.graphics.Typeface.DEFAULT_BOLD

    private val paintCenter = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#E6E6E6")
        textAlign = Paint.Align.CENTER
        textSize = 22f * density
        typeface = cjkFont
    }
    private val paintFlick = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#8A8F99")
        textAlign = Paint.Align.CENTER
        textSize = 11f * density
        typeface = cjkFont
    }
    private val paintHintBg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#3A4150")
    }
    private val paintHintBgActive = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#7AB7FF")
    }
    private val paintHintText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#E6E6E6")
        textAlign = Paint.Align.CENTER
        textSize = 20f * density
        typeface = cjkFont
    }
    private val paintHintTextActive = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#0F1115")
        textAlign = Paint.Align.CENTER
        textSize = 22f * density
        typeface = cjkFont
    }

    private var startX = 0f
    private var startY = 0f
    private var pressed = false
    private var direction = -1 // -1=center, 0=left 1=up 2=right 3=down

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat(); val h = height.toFloat()
        val cx = w / 2f; val cy = h / 2f

        // Key background
        canvas.drawColor(Color.parseColor(if (pressed) "#4A5367" else "#262A33"))

        if (!pressed) {
            // Resting state: center big, 4 flicks hinted at edges
            drawCentered(canvas, center, cx, cy, paintCenter)
            val pad = 8f * density
            flicks[0]?.let { drawCentered(canvas, it, pad + paintFlick.textSize / 2, cy, paintFlick) }
            flicks[1]?.let { drawCentered(canvas, it, cx, pad + paintFlick.textSize * 0.6f, paintFlick) }
            flicks[2]?.let { drawCentered(canvas, it, w - pad - paintFlick.textSize / 2, cy, paintFlick) }
            flicks[3]?.let { drawCentered(canvas, it, cx, h - pad - paintFlick.textSize * 0.2f, paintFlick) }
        } else {
            // Pressed state: draw a 5-cell cross hint, highlighting the current direction.
            val cellW = minOf(w, h) / 3f
            val cells = listOf(
                // (label, cx, cy, dirIndex)
                Triple(center, cx to cy, -1),
                Triple(flicks[0] ?: "", (cx - cellW) to cy, 0),
                Triple(flicks[1] ?: "", cx to (cy - cellW), 1),
                Triple(flicks[2] ?: "", (cx + cellW) to cy, 2),
                Triple(flicks[3] ?: "", cx to (cy + cellW), 3),
            )
            for ((label, pos, dirIdx) in cells) {
                if (label.isEmpty()) continue
                val active = direction == dirIdx
                val rect = RectF(
                    pos.first - cellW / 2 + 2,
                    pos.second - cellW / 2 + 2,
                    pos.first + cellW / 2 - 2,
                    pos.second + cellW / 2 - 2
                )
                val r = 6f * density
                canvas.drawRoundRect(rect, r, r, if (active) paintHintBgActive else paintHintBg)
                drawCentered(canvas, label, pos.first, pos.second,
                    if (active) paintHintTextActive else paintHintText)
            }
        }
    }

    private fun drawCentered(canvas: Canvas, text: String, x: Float, y: Float, paint: Paint) {
        val offset = (paint.descent() + paint.ascent()) / 2
        canvas.drawText(text, x, y - offset, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                startX = event.x; startY = event.y
                pressed = true
                direction = -1
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                direction = directionOf(event.x - startX, event.y - startY)
                invalidate()
            }
            MotionEvent.ACTION_UP -> {
                val dir = directionOf(event.x - startX, event.y - startY)
                val label = if (dir == -1) center else flicks[dir]
                pressed = false
                direction = -1
                invalidate()
                if (!label.isNullOrEmpty()) onPick?.invoke(label)
            }
            MotionEvent.ACTION_CANCEL -> {
                pressed = false
                direction = -1
                invalidate()
            }
        }
        return true
    }

    private fun directionOf(dx: Float, dy: Float): Int {
        val adx = abs(dx); val ady = abs(dy)
        if (adx < flickThreshold && ady < flickThreshold) return -1
        return if (adx > ady) { if (dx < 0) 0 else 2 } else { if (dy < 0) 1 else 3 }
    }
}
