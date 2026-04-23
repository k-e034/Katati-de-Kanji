package com.example.idsime

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * Port of src/search.mjs. Opens idsfind.db (copied from assets on first use)
 * and loads reading-index.json (pre-built from moji.db).
 *
 * Avoids the JSON-parameter CTE used in the web version because Android SQLite
 * on API 24 lacks the json1 extension. Instead we build the FTS pattern string
 * in Kotlin, calling SELECT IDS_tokens FROM idsfind WHERE UCS = ? per token to
 * mirror `ifnull(idsfind.IDS_tokens, tokens.token)`.
 */
class IdsSearch private constructor(ctx: Context) {

    private val db: SQLiteDatabase
    private val readings: Map<String, List<String>>
    private val joyoSet: Set<String>
    val readingCount: Int get() = readings.size

    init {
        val dbFile = ensureDatabaseCopied(ctx)
        Log.i(TAG, "db path=${dbFile.absolutePath} size=${dbFile.length()}")
        db = SQLiteDatabase.openDatabase(
            dbFile.absolutePath, null,
            SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS
        )
        // Sanity-check schema
        try {
            db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'", null).use { c ->
                val tables = ArrayList<String>()
                while (c.moveToNext()) tables.add(c.getString(0))
                Log.i(TAG, "tables=$tables")
            }
            db.rawQuery("SELECT sqlite_version()", null).use { c ->
                if (c.moveToFirst()) Log.i(TAG, "sqlite_version=${c.getString(0)}")
            }
            // Probe: does FTS match single-CJK-char tokens?
            db.rawQuery(
                "SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 3",
                arrayOf("九")
            ).use { c ->
                val hits = ArrayList<String>()
                while (c.moveToNext()) hits.add(c.getString(0))
                Log.i(TAG, "probe MATCH '九' -> ${hits.size} hits: $hits")
            }
            // Probe: a token with OL marker
            db.rawQuery(
                "SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 3",
                arrayOf("\"&ol-屮-1;\"")
            ).use { c ->
                val hits = ArrayList<String>()
                while (c.moveToNext()) hits.add(c.getString(0))
                Log.i(TAG, "probe MATCH '&ol-屮-1;' -> ${hits.size} hits")
            }
            // Probe: direct row lookup (no FTS)
            db.rawQuery("SELECT COUNT(*) FROM idsfind WHERE UCS = ?", arrayOf("九")).use { c ->
                if (c.moveToFirst()) Log.i(TAG, "direct idsfind rows for 九: ${c.getInt(0)}")
            }
            db.rawQuery("SELECT COUNT(*) FROM idsfind_ref", null).use { c ->
                if (c.moveToFirst()) Log.i(TAG, "idsfind_ref rows: ${c.getInt(0)}")
            }
            // FTS4-parser quirks on Android SQLite 3.28:
            //   - `AND` keyword is NOT recognized as an operator (treated as
            //     a literal token). Use whitespace (implicit AND) instead.
            //   - Per-phrase parentheses `("X") OR ("Y")` return 0 hits.
            //     Only wrap the whole OR group, not each phrase.
            // Probes below verify the shape used by buildPattern still works.
            for (p in listOf(
                "\"九\"",
                "(\"九\" OR \"久\")",
                // Real-world shape: OR group + implicit AND + phrase.
                "(\"⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火\" OR \"⿲ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火\") \"⿱ 夂 ⺀\"",
            )) {
                db.rawQuery(
                    "SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 3",
                    arrayOf(p)
                ).use { c ->
                    val hits = ArrayList<String>()
                    while (c.moveToNext()) hits.add(c.getString(0))
                    Log.i(TAG, "probe pattern=$p -> ${hits.size} hits: $hits")
                }
            }
        } catch (t: Throwable) { Log.e(TAG, "schema check failed", t) }
        val json = ctx.assets.open("reading-index.json").bufferedReader().use { it.readText() }
        val root = JSONObject(json)
        val r = root.getJSONObject("readings")
        val map = HashMap<String, List<String>>(r.length() * 2)
        val keys = r.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            val arr = r.getJSONArray(k)
            val list = ArrayList<String>(arr.length())
            for (i in 0 until arr.length()) list.add(arr.getString(i))
            map[k] = list
        }
        readings = map
        val joyo = root.getJSONArray("joyo")
        val js = HashSet<String>(joyo.length() * 2)
        for (i in 0 until joyo.length()) js.add(joyo.getString(i))
        joyoSet = js
    }

    private fun ensureDatabaseCopied(ctx: Context): File {
        val outFile = File(ctx.filesDir, "idsfind.db")
        if (!outFile.exists() || outFile.length() == 0L) {
            ctx.assets.open("idsfind.db").use { input ->
                outFile.outputStream().use { output -> input.copyTo(output) }
            }
        }
        return outFile
    }

    // ---- Tokenizer ----

    private data class Tok(
        var kind: String,      // "reading" | "kanji" | "position" | "particle"
        var length: Int,
        var value: String = "",
        var position: String? = null
    )

    data class Token(val kind: String, val value: String, val position: String?)

    data class Result(
        val tokens: List<String>,
        val candidates: List<List<String>>,
        val results: List<String>,
        val message: String? = null
    )

    fun search(input: String, candidatePerReading: Int = 8): Result {
        Log.i(TAG, "search input='$input'")
        val toks = segmentInput(input)
        Log.i(TAG, "tokens=${toks.map { "${it.kind}:${it.value}${if (it.position != null) "("+it.position+")" else ""}" }}")
        if (toks.isEmpty()) {
            return Result(emptyList(), emptyList(), emptyList(), "読みを認識できませんでした")
        }
        val display = toks.map { if (it.position != null) "${it.value}(${it.position})" else it.value }
        val plain = ArrayList<List<String>>(toks.size)
        val groups = ArrayList<List<List<String>>>(toks.size)
        for (t in toks) {
            val kanjis: List<String> = if (t.kind == "kanji") listOf(t.value)
                else (readings[t.value] ?: emptyList()).take(candidatePerReading)
            plain.add(kanjis)
            val alts = ArrayList<List<String>>()
            for (k in kanjis) for (pat in applyPosition(k, t.position)) alts.add(pat)
            groups.add(alts)
        }
        Log.i(TAG, "plain=$plain")
        if (groups.any { it.isEmpty() }) {
            return Result(display, plain, emptyList(), "候補なしの読みがあります")
        }
        val raw = try {
            findContainers(groups)
        } catch (t: Throwable) {
            Log.e(TAG, "findContainers failed", t)
            emptyList()
        }
        Log.i(TAG, "raw results: ${raw.size}")
        val ranked = rankResults(raw, plain)
        Log.i(TAG, "ranked top10: ${ranked.take(10)}")
        return Result(display, plain, ranked)
    }

    private fun segmentInput(input: String): List<Token> {
        val s = kataToHira(input.trim())
        val rawTokens = ArrayList<Tok>()
        var i = 0
        var lastCompleted = false
        while (i < s.length) {
            var best: Tok? = null
            val maxLen = minOf(s.length - i, MAX_MATCH_LEN)
            for (len in maxLen downTo 1) {
                val cand = s.substring(i, i + len)
                RADICAL_NAMES[cand]?.let {
                    best = Tok("kanji", len, it.kanji, it.position); return@let
                }
                if (best != null) break
                POSITION_WORDS[cand]?.let {
                    best = Tok("position", len, it); return@let
                }
                if (best != null) break
                if (len >= 2 && readings.containsKey(cand)) {
                    if (lastCompleted && PARTICLE_CHARS.contains(cand[0])) continue
                    best = Tok("reading", len, cand); break
                }
                if (len == 1) {
                    if (PARTICLE_CHARS.contains(cand[0])) { best = Tok("particle", 1); break }
                    if (readings.containsKey(cand)) { best = Tok("reading", 1, cand); break }
                }
            }
            val b = best
            if (b != null) {
                if (b.kind != "particle") { rawTokens.add(b); lastCompleted = true }
                else lastCompleted = false
                i += b.length
            } else {
                i += 1
                lastCompleted = false
            }
        }
        // Merge trailing position markers into preceding token.
        val out = ArrayList<Token>()
        for (t in rawTokens) {
            if (t.kind == "position") {
                if (out.isNotEmpty() && out.last().position == null) {
                    val prev = out.removeAt(out.size - 1)
                    out.add(Token(prev.kind, prev.value, t.value))
                }
            } else {
                out.add(Token(t.kind, t.value, t.position))
            }
        }
        return out
    }

    private fun applyPosition(kanji: String, position: String?): List<List<String>> {
        val patterns = position?.let { POSITION_IDCS[it] }
        if (patterns == null) return listOf(listOf(kanji))
        return patterns.map { p -> p.map { if (it == "%X%") kanji else it } }
    }

    // ---- FTS query ----

    private fun lookupIdsTokens(token: String): String? {
        db.rawQuery("SELECT IDS_tokens FROM idsfind WHERE UCS = ?", arrayOf(token)).use { c ->
            if (c.moveToFirst()) return c.getString(0)
        }
        return null
    }

    /**
     * Build FTS pattern for one alternative (sequence of tokens including ？ slots).
     *
     * On Android SQLite 3.28 FTS4, the `AND` keyword is NOT recognized as an
     * operator — it's treated as a literal token, so `"A" AND "B"` always
     * returns zero hits. We therefore use *implicit* AND (whitespace) between
     * phrases, which the parser does accept. `OR` and parenthesized OR groups
     * still work.
     *
     * The ？ placeholder (from position templates like ⿰ %X% ？) separates
     * required phrases; each ？ run becomes a phrase break (space + new
     * quoted phrase).
     *
     * Returns a bare phrase like "X" or a compound "X" "Y" (no outer parens).
     * Per-phrase parentheses inside OR groups are intentionally avoided —
     * FTS4 3.28 also chokes on `("X") OR ("Y")`.
     */
    private fun buildAltPattern(alt: List<String>): String {
        val expanded = alt.map { tok -> lookupIdsTokens(tok) ?: tok }
        var s = expanded.joinToString(" ")
        // Middle-slot ？ → phrase break (implicit AND between phrases).
        s = s.replace(" ？ ", "\" \"")
        // Leading ？ (at position 0) → drop it and its trailing space.
        s = s.replace("？ ", "")
        // Trailing ？ right after a phrase break → collapse the whole break.
        s = s.replace("\" \"？", "")
        // Trailing ？ at end of the flat string → drop.
        s = s.replace(" ？", "")
        return "\"$s\""
    }

    private fun buildPattern(groups: List<List<List<String>>>): String {
        val andParts = groups.map { alts ->
            val orParts = alts.map { alt -> buildAltPattern(alt) }
            if (orParts.size == 1) orParts[0] else "(${orParts.joinToString(" OR ")})"
        }
        // Implicit AND: whitespace-separate the top-level clauses.
        return andParts.joinToString(" ")
    }

    private fun findContainers(groups: List<List<List<String>>>): List<String> {
        if (groups.isEmpty()) return emptyList()
        val pattern = buildPattern(groups)
        Log.i(TAG, "FTS pattern=$pattern")
        val sql = """
            SELECT DISTINCT char AS UCS
            FROM idsfind_fts
            JOIN idsfind_ref USING (docid)
            WHERE IDS_tokens MATCH ?
            LIMIT 60
        """.trimIndent()
        val out = ArrayList<String>()
        db.rawQuery(sql, arrayOf(pattern)).use { c ->
            while (c.moveToNext()) {
                val u = c.getString(0)
                if (!u.startsWith("&")) out.add(u)
            }
        }
        return out
    }

    // ---- Ranking (match-bonus + commonness) ----

    private val olRegex = Regex("^&ol-(.+?)-\\d+;$")

    private fun matchBonus(ucs: String, plainGroups: List<List<String>>): Int {
        val rows = ArrayList<String>()
        db.rawQuery("SELECT IDS_tokens FROM idsfind WHERE UCS = ?", arrayOf(ucs)).use { c ->
            while (c.moveToNext()) rows.add(c.getString(0))
        }
        if (rows.isEmpty()) return 0
        // Requirements: map each distinct candidate-set → required multiplicity.
        data class Req(val set: Set<String>, val min: Int)
        val reqMap = HashMap<String, Req>()
        for (g in plainGroups) {
            val key = g.joinToString("|")
            val prev = reqMap[key]
            reqMap[key] = Req(g.toSet(), (prev?.min ?: 0) + 1)
        }
        var best = 0
        for (tokensStr in rows) {
            val toks = tokensStr.split(' ')
            var total = 0
            for (req in reqMap.values) {
                var cnt = 0
                for (t in toks) {
                    if (req.set.contains(t)) { cnt++; continue }
                    val m = olRegex.matchEntire(t)
                    if (m != null && req.set.contains(m.groupValues[1])) cnt++
                }
                total += minOf(cnt, req.min)
            }
            if (total > best) best = total
        }
        return best
    }

    private fun rankResults(ucsList: List<String>, plainGroups: List<List<String>>): List<String> {
        return ucsList
            .map { u ->
                val cp = u.codePointAt(0)
                val isBMP = cp <= 0xFFFF
                val isCJK = cp in 0x4E00..0x9FFF
                val inJoyo = joyoSet.contains(u)
                val bonus = matchBonus(u, plainGroups)
                val score = -bonus * 10_000_000L +
                    (if (inJoyo) 0 else 1_000_000) +
                    (if (isBMP) 0 else 500_000) +
                    (if (isCJK) 0 else 100_000) +
                    cp
                u to score
            }
            .sortedBy { it.second }
            .map { it.first }
    }

    companion object {
        private const val TAG = "IdsSearch"
        private const val MAX_MATCH_LEN = 8

        @Volatile private var instance: IdsSearch? = null
        fun get(ctx: Context): IdsSearch {
            return instance ?: synchronized(this) {
                instance ?: IdsSearch(ctx.applicationContext).also { instance = it }
            }
        }

        private fun kataToHira(s: String): String {
            val sb = StringBuilder(s.length)
            for (ch in s) {
                val c = ch.code
                if (c in 0x30A1..0x30F6) sb.append((c - 0x60).toChar())
                else sb.append(ch)
            }
            return sb.toString()
        }

        private val PARTICLE_CHARS = setOf('に', 'と', 'の', 'で', 'を', 'は', 'が')

        private data class Radical(val kanji: String, val position: String)

        private val RADICAL_NAMES = mapOf(
            "くさかんむり" to Radical("艸", "top"),
            "たけかんむり" to Radical("竹", "top"),
            "うかんむり"   to Radical("宀", "top"),
            "あめかんむり" to Radical("雨", "top"),
            "あなかんむり" to Radical("穴", "top"),
            "あみがしら"   to Radical("网", "top"),
            "なべぶた"     to Radical("亠", "top"),
            "はつがしら"   to Radical("癶", "top"),
            "ひとやね"     to Radical("人", "top"),
            "はちがしら"   to Radical("八", "top"),
            "さんずい"     to Radical("水", "left"),
            "にすい"       to Radical("冫", "left"),
            "にんべん"     to Radical("人", "left"),
            "ぎょうにんべん" to Radical("彳", "left"),
            "りっしんべん" to Radical("心", "left"),
            "てへん"       to Radical("手", "left"),
            "のぎへん"     to Radical("禾", "left"),
            "いとへん"     to Radical("糸", "left"),
            "うまへん"     to Radical("馬", "left"),
            "かねへん"     to Radical("金", "left"),
            "かいへん"     to Radical("貝", "left"),
            "ごんべん"     to Radical("言", "left"),
            "しめすへん"   to Radical("示", "left"),
            "けものへん"   to Radical("犬", "left"),
            "さかなへん"   to Radical("魚", "left"),
            "こざとへん"   to Radical("阜", "left"),
            "つちへん"     to Radical("土", "left"),
            "いしへん"     to Radical("石", "left"),
            "たまへん"     to Radical("玉", "left"),
            "ゆみへん"     to Radical("弓", "left"),
            "ころもへん"   to Radical("衣", "left"),
            "くちへん"     to Radical("口", "left"),
            "めへん"       to Radical("目", "left"),
            "みみへん"     to Radical("耳", "left"),
            "つきへん"     to Radical("月", "left"),
            "ひへん"       to Radical("日", "left"),
            "のごめへん"   to Radical("釆", "left"),
            "むしへん"     to Radical("虫", "left"),
            "とりへん"     to Radical("酉", "left"),
            "おおざと"     to Radical("邑", "right"),
            "ちから"       to Radical("力", "right"),
            "りっとう"     to Radical("刀", "right"),
            "おおがい"     to Radical("頁", "right"),
            "ふるとり"     to Radical("隹", "right"),
            "ほこづくり"   to Radical("殳", "right"),
            "おのづくり"   to Radical("斤", "right"),
            "しんにょう"   to Radical("辵", "wrapBL"),
            "しんにゅう"   to Radical("辵", "wrapBL"),
            "えんにょう"   to Radical("廴", "wrapBL"),
            "くにがまえ"   to Radical("囗", "enclose"),
            "もんがまえ"   to Radical("門", "enclose"),
            "はこがまえ"   to Radical("匚", "enclose"),
            "ぎょうがまえ" to Radical("行", "enclose"),
            "きがまえ"     to Radical("气", "wrapTL"),
            "まだれ"       to Radical("广", "wrapTL"),
            "やまいだれ"   to Radical("疒", "wrapTL"),
            "がんだれ"     to Radical("厂", "wrapTL"),
            "とだれ"       to Radical("戸", "wrapTL"),
        )

        private val POSITION_WORDS = mapOf(
            "へん" to "left", "つくり" to "right",
            "かんむり" to "top", "あし" to "bottom",
            "にょう" to "wrapBL", "たれ" to "wrapTL", "かまえ" to "enclose",
        )

        private val POSITION_IDCS = mapOf(
            "left"    to listOf(listOf("⿰", "%X%", "？"), listOf("⿲", "%X%", "？", "？")),
            "right"   to listOf(listOf("⿰", "？", "%X%"), listOf("⿲", "？", "？", "%X%")),
            "top"     to listOf(listOf("⿱", "%X%", "？"), listOf("⿳", "%X%", "？", "？")),
            "bottom"  to listOf(listOf("⿱", "？", "%X%"), listOf("⿳", "？", "？", "%X%")),
            "wrapTL"  to listOf(listOf("⿸", "%X%", "？")),
            "wrapBL"  to listOf(listOf("⿺", "%X%", "？")),
            "wrapTR"  to listOf(listOf("⿹", "%X%", "？")),
            "enclose" to listOf(
                listOf("⿴", "%X%", "？"), listOf("⿵", "%X%", "？"),
                listOf("⿶", "%X%", "？"), listOf("⿷", "%X%", "？")
            ),
        )
    }
}
