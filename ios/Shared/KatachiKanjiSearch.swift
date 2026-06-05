import Foundation
import SQLite3

public final class KatachiKanjiSearch {
    public struct Result {
        public let tokens: [String]
        public let candidates: [[String]]
        public let results: [String]
        public let message: String?
    }

    private struct ReadingIndex: Decodable {
        let readings: [String: [String]]
        let joyo: [String]
    }

    private enum TokenKind: Equatable {
        case reading
        case kanji
        case position
        case particle
    }

    private struct WorkToken {
        var kind: TokenKind
        var length: Int
        var value: String
        var position: String?
    }

    private struct Token {
        var kind: TokenKind
        var value: String
        var position: String?
    }

    private let db: OpaquePointer?
    private let subtreeDb: OpaquePointer?
    private let dbLock = NSLock()
    private let idsCacheLock = NSLock()
    private var idsTokensCache: [String: [String]] = [:]
    private let readings: [String: [String]]
    private let joyoSet: Set<String>

    public var readingCount: Int { readings.count }

    public convenience init(bundle: Bundle = .main) throws {
        guard let dbURL = bundle.url(forResource: "idsfind", withExtension: "db") else {
            throw NSError(domain: "KatachiKanjiSearch", code: 1, userInfo: [NSLocalizedDescriptionKey: "idsfind.db not found in bundle"])
        }
        guard let readingURL = bundle.url(forResource: "reading-index", withExtension: "json") else {
            throw NSError(domain: "KatachiKanjiSearch", code: 2, userInfo: [NSLocalizedDescriptionKey: "reading-index.json not found in bundle"])
        }
        try self.init(
            databaseURL: dbURL,
            readingIndexURL: readingURL,
            subtreeIndexURL: bundle.url(forResource: "subtree-index", withExtension: "db")
        )
    }

    public init(databaseURL dbURL: URL, readingIndexURL readingURL: URL, subtreeIndexURL: URL? = nil) throws {
        var opened: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX
        guard sqlite3_open_v2(dbURL.path, &opened, flags, nil) == SQLITE_OK else {
            defer { if opened != nil { sqlite3_close(opened) } }
            throw NSError(domain: "KatachiKanjiSearch", code: 3, userInfo: [NSLocalizedDescriptionKey: "Could not open idsfind.db"])
        }
        db = opened

        var openedSubtree: OpaquePointer?
        if let subtreeIndexURL,
           sqlite3_open_v2(subtreeIndexURL.path, &openedSubtree, flags, nil) == SQLITE_OK {
            subtreeDb = openedSubtree
        } else {
            if openedSubtree != nil { sqlite3_close(openedSubtree) }
            subtreeDb = nil
        }

        let data = try Data(contentsOf: readingURL)
        let index = try JSONDecoder().decode(ReadingIndex.self, from: data)
        readings = index.readings
        joyoSet = Set(index.joyo)
    }

    deinit {
        if db != nil {
            sqlite3_close(db)
        }
        if subtreeDb != nil {
            sqlite3_close(subtreeDb)
        }
    }

    public func search(_ input: String, candidatePerReading: Int = 8) -> Result {
        let tokens = segmentInput(input)
        if tokens.isEmpty {
            return Result(tokens: [], candidates: [], results: [], message: "読みを認識できませんでした")
        }

        var display: [String] = []
        var plainCandidates: [[String]] = []
        var groups: [[[String]]] = []

        for token in tokens {
            let kanji = token.kind == .kanji
                ? [token.value]
                : Array((readings[token.value] ?? []).prefix(candidatePerReading))

            display.append(token.position.map { "\(token.value)(\($0))" } ?? token.value)
            plainCandidates.append(kanji)

            var alternatives: [[String]] = []
            for candidate in kanji {
                alternatives.append(contentsOf: applyPosition(candidate, token.position))
            }
            groups.append(alternatives)
        }

        if groups.contains(where: { $0.isEmpty }) {
            return Result(tokens: display, candidates: plainCandidates, results: [], message: "候補なしの読みがあります")
        }

        let positions = tokens.map(\.position)
        let fastHits = findContainersBySignature(plainCandidates, positions: positions)
        let raw: [String]
        if let fastHits {
            raw = fastHits.map(\.ucs)
        } else {
            preloadIdsTokens(groups.flatMap { $0 }.flatMap { $0 })
            raw = findContainers(groups)
        }
        let ranked = fastHits.map { rankSignatureResults($0, plainCandidates: plainCandidates) }
            ?? rankResults(raw, plainCandidates: plainCandidates)
        return Result(tokens: display, candidates: plainCandidates, results: ranked, message: nil)
    }

    private func segmentInput(_ input: String) -> [Token] {
        let chars = Array(kataToHira(input).trimmingCharacters(in: .whitespacesAndNewlines))
        var raw: [WorkToken] = []
        var i = 0
        var lastCompleted = false

        while i < chars.count {
            var best: WorkToken?
            let maxLen = min(chars.count - i, Self.maxMatchLength)
            if maxLen > 0 {
                for length in stride(from: maxLen, through: 1, by: -1) {
                    let candidate = String(chars[i..<(i + length)])
                    if let radical = Self.radicalNames[candidate] {
                        best = WorkToken(kind: .kanji, length: length, value: radical.kanji, position: radical.position)
                        break
                    }
                    if let position = Self.positionWords[candidate] {
                        best = WorkToken(kind: .position, length: length, value: position, position: nil)
                        break
                    }
                    if length >= 2, readings[candidate] != nil {
                        if lastCompleted, let first = candidate.first, Self.particleChars.contains(first) {
                            continue
                        }
                        best = WorkToken(kind: .reading, length: length, value: candidate, position: nil)
                        break
                    }
                    if length == 1 {
                        if let first = candidate.first, Self.particleChars.contains(first) {
                            best = WorkToken(kind: .particle, length: 1, value: "", position: nil)
                            break
                        }
                        if readings[candidate] != nil {
                            best = WorkToken(kind: .reading, length: 1, value: candidate, position: nil)
                            break
                        }
                    }
                }
            }

            if let best {
                if best.kind != .particle {
                    raw.append(best)
                    lastCompleted = true
                } else {
                    lastCompleted = false
                }
                i += best.length
            } else {
                i += 1
                lastCompleted = false
            }
        }

        var output: [Token] = []
        for token in raw {
            if token.kind == .position {
                if let last = output.popLast(), last.position == nil {
                    output.append(Token(kind: last.kind, value: last.value, position: token.value))
                }
            } else {
                output.append(Token(kind: token.kind, value: token.value, position: token.position))
            }
        }
        return output
    }

    private func applyPosition(_ kanji: String, _ position: String?) -> [[String]] {
        guard let position, let patterns = Self.positionIDCs[position] else {
            return [[kanji]]
        }
        return patterns.map { pattern in
            pattern.map { $0 == "%X%" ? kanji : $0 }
        }
    }

    private func lookupIdsTokens(_ token: String) -> String? {
        idsTokens(for: token).first
    }

    private func buildAltPattern(_ alternative: [String]) -> String {
        var expanded = alternative.map { lookupIdsTokens($0) ?? $0 }.joined(separator: " ")
        expanded = expanded.replacingOccurrences(of: " ？ ", with: "\" \"")
        expanded = expanded.replacingOccurrences(of: "？ ", with: "")
        expanded = expanded.replacingOccurrences(of: "\" \"？", with: "")
        expanded = expanded.replacingOccurrences(of: " ？", with: "")
        return "\"\(escapeFTSPhrase(expanded))\""
    }

    private func buildPattern(_ groups: [[[String]]]) -> String {
        groups.map { alternatives in
            let parts = alternatives.map(buildAltPattern)
            return parts.count == 1 ? parts[0] : "(\(parts.joined(separator: " OR ")))"
        }
        .joined(separator: " ")
    }

    private func findContainers(_ groups: [[[String]]]) -> [String] {
        guard !groups.isEmpty else { return [] }
        let pattern = buildPattern(groups)
        let sql = """
        SELECT DISTINCT char AS UCS
        FROM idsfind_fts
        JOIN idsfind_ref USING (docid)
        WHERE IDS_tokens MATCH ?
        LIMIT 60
        """
        return queryStrings(sql, [pattern]).filter { !$0.hasPrefix("&") }
    }

    private struct SignatureHit {
        let ucs: String
        var rankRows: [String]
    }

    private func findContainersBySignature(_ candidateGroups: [[String]], positions: [String?]) -> [SignatureHit]? {
        guard let subtreeDb, !candidateGroups.isEmpty else { return nil }
        var clauses: [String] = []
        let allCandidates = Array(Set(candidateGroups.flatMap { $0 }))
        let placeholders = Array(repeating: "?", count: allCandidates.count).joined(separator: ",")
        let signatureRows = queryStringPairs(
            "SELECT UCS, signature FROM ids_signature WHERE UCS IN (\(placeholders))",
            allCandidates,
            database: subtreeDb
        )
        var signaturesByCandidate: [String: [String]] = [:]
        for (ucs, signature) in signatureRows {
            signaturesByCandidate[ucs, default: []].append(signature)
        }

        for (index, candidates) in candidateGroups.enumerated() {
            let prefix = positions[index].flatMap { Self.positionSignaturePrefix[$0] } ?? "s"
            var signatures = Set<String>()
            for candidate in candidates {
                for signature in signaturesByCandidate[candidate] ?? [] {
                    signatures.insert(prefix + signature.dropFirst())
                }
            }
            guard !signatures.isEmpty else { return nil }
            let sorted = signatures.sorted()
            clauses.append(sorted.count == 1 ? sorted[0] : "(\(sorted.joined(separator: " OR ")))")
        }

        let sql = """
        SELECT r.char, r.rank_tokens
        FROM subtree_fts f
        JOIN subtree_ref r ON r.docid = f.rowid
        WHERE f.signatures MATCH ?
        LIMIT 1000
        """
        let rows = queryStringPairs(sql, [clauses.joined(separator: " ")], database: subtreeDb)
        var grouped: [String: SignatureHit] = [:]
        var order: [String] = []
        for (ucs, rankTokens) in rows where !ucs.hasPrefix("&") {
            if grouped[ucs] != nil {
                grouped[ucs]?.rankRows.append(rankTokens)
            } else if grouped.count < 60 {
                grouped[ucs] = SignatureHit(ucs: ucs, rankRows: [rankTokens])
                order.append(ucs)
            }
        }
        return order.compactMap { grouped[$0] }
    }

    private func matchBonus(_ ucs: String, plainCandidates: [[String]]) -> Int {
        let rows = idsTokens(for: ucs)
        if rows.isEmpty { return 0 }

        struct Requirement {
            var set: Set<String>
            var minimum: Int
        }

        var requirements: [String: Requirement] = [:]
        for group in plainCandidates {
            let key = group.joined(separator: "|")
            let previous = requirements[key]
            requirements[key] = Requirement(set: Set(group), minimum: (previous?.minimum ?? 0) + 1)
        }

        var best = 0
        for row in rows {
            let tokens = row.split(separator: " ").map(String.init)
            var total = 0
            for requirement in requirements.values {
                var count = 0
                for token in tokens {
                    if requirement.set.contains(token) {
                        count += 1
                    } else if let original = Self.originalCharacter(fromOLToken: token), requirement.set.contains(original) {
                        count += 1
                    }
                }
                total += min(count, requirement.minimum)
            }
            best = max(best, total)
        }
        return best
    }

    private func idsTokens(for ucs: String) -> [String] {
        idsCacheLock.lock()
        if let cached = idsTokensCache[ucs] {
            idsCacheLock.unlock()
            return cached
        }
        idsCacheLock.unlock()

        let rows = queryStrings("SELECT IDS_tokens FROM idsfind WHERE UCS = ?", [ucs])

        idsCacheLock.lock()
        idsTokensCache[ucs] = rows
        idsCacheLock.unlock()
        return rows
    }

    private func preloadIdsTokens(_ values: [String]) {
        let unique = Array(Set(values))
        idsCacheLock.lock()
        let missing = unique.filter { idsTokensCache[$0] == nil }
        idsCacheLock.unlock()
        guard !missing.isEmpty else { return }

        for chunkStart in stride(from: 0, to: missing.count, by: 400) {
            let chunk = Array(missing[chunkStart..<min(chunkStart + 400, missing.count)])
            let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ",")
            let rows = queryStringPairs(
                "SELECT UCS, IDS_tokens FROM idsfind WHERE UCS IN (\(placeholders))",
                chunk
            )

            var grouped: [String: [String]] = Dictionary(uniqueKeysWithValues: chunk.map { ($0, []) })
            for (ucs, tokens) in rows {
                grouped[ucs, default: []].append(tokens)
            }

            idsCacheLock.lock()
            for (ucs, tokens) in grouped where idsTokensCache[ucs] == nil {
                idsTokensCache[ucs] = tokens
            }
            idsCacheLock.unlock()
        }
    }

    private func rankResults(_ ucsList: [String], plainCandidates: [[String]]) -> [String] {
        preloadIdsTokens(ucsList)
        return ucsList
            .map { ucs -> (String, Int64) in
                let cp = Int64(ucs.unicodeScalars.first?.value ?? 0)
                let isBMP = cp <= 0xFFFF
                let isCJK = cp >= 0x4E00 && cp <= 0x9FFF
                let inJoyo = joyoSet.contains(ucs)
                let bonus = Int64(matchBonus(ucs, plainCandidates: plainCandidates))
                let score = -bonus * 10_000_000
                    + (inJoyo ? 0 : 1_000_000)
                    + (isBMP ? 0 : 500_000)
                    + (isCJK ? 0 : 100_000)
                    + cp
                return (ucs, score)
            }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    private func rankSignatureResults(_ hits: [SignatureHit], plainCandidates: [[String]]) -> [String] {
        hits
            .map { hit -> (String, Int64) in
                let cp = Int64(hit.ucs.unicodeScalars.first?.value ?? 0)
                let isBMP = cp <= 0xFFFF
                let isCJK = cp >= 0x4E00 && cp <= 0x9FFF
                let inJoyo = joyoSet.contains(hit.ucs)
                let bonus = Int64(matchBonusRows(hit.rankRows, plainCandidates: plainCandidates))
                let score = -bonus * 10_000_000
                    + (inJoyo ? 0 : 1_000_000)
                    + (isBMP ? 0 : 500_000)
                    + (isCJK ? 0 : 100_000)
                    + cp
                return (hit.ucs, score)
            }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    private func matchBonusRows(_ rows: [String], plainCandidates: [[String]]) -> Int {
        struct Requirement {
            var set: Set<String>
            var minimum: Int
        }
        var requirements: [String: Requirement] = [:]
        for group in plainCandidates {
            let key = group.joined(separator: "|")
            let previous = requirements[key]
            requirements[key] = Requirement(set: Set(group), minimum: (previous?.minimum ?? 0) + 1)
        }
        var best = 0
        for row in rows {
            let tokens = row.split(separator: " ").map(String.init)
            var total = 0
            for requirement in requirements.values {
                total += min(tokens.filter(requirement.set.contains).count, requirement.minimum)
            }
            best = max(best, total)
        }
        return best
    }

    private func queryStrings(_ sql: String, _ args: [String], database: OpaquePointer? = nil) -> [String] {
        dbLock.lock()
        defer { dbLock.unlock() }

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database ?? db, sql, -1, &statement, nil) == SQLITE_OK else {
            return []
        }
        defer { sqlite3_finalize(statement) }

        for (index, arg) in args.enumerated() {
            sqlite3_bind_text(statement, Int32(index + 1), arg, -1, SQLITE_TRANSIENT)
        }

        var output: [String] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            if let text = sqlite3_column_text(statement, 0) {
                output.append(String(cString: text))
            }
        }
        return output
    }

    private func queryStringPairs(
        _ sql: String,
        _ args: [String],
        database: OpaquePointer? = nil
    ) -> [(String, String)] {
        dbLock.lock()
        defer { dbLock.unlock() }

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database ?? db, sql, -1, &statement, nil) == SQLITE_OK else {
            return []
        }
        defer { sqlite3_finalize(statement) }

        for (index, arg) in args.enumerated() {
            sqlite3_bind_text(statement, Int32(index + 1), arg, -1, SQLITE_TRANSIENT)
        }

        var output: [(String, String)] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let first = sqlite3_column_text(statement, 0),
                  let second = sqlite3_column_text(statement, 1) else {
                continue
            }
            output.append((String(cString: first), String(cString: second)))
        }
        return output
    }

    private func escapeFTSPhrase(_ value: String) -> String {
        value.replacingOccurrences(of: "\"", with: "\"\"")
    }

    private func kataToHira(_ value: String) -> String {
        String(value.unicodeScalars.map { scalar in
            if scalar.value >= 0x30A1 && scalar.value <= 0x30F6 {
                return UnicodeScalar(scalar.value - 0x60).map(Character.init) ?? Character(scalar)
            }
            return Character(scalar)
        })
    }

    private static func originalCharacter(fromOLToken token: String) -> String? {
        guard token.hasPrefix("&ol-"), token.hasSuffix(";") else { return nil }
        let body = token.dropFirst(4).dropLast()
        guard let dash = body.lastIndex(of: "-") else { return nil }
        return String(body[..<dash])
    }

    private static let maxMatchLength = 8

    private struct Radical {
        let kanji: String
        let position: String
    }

    private static let radicalNames: [String: Radical] = [
        "くさかんむり": Radical(kanji: "艸", position: "top"),
        "たけかんむり": Radical(kanji: "竹", position: "top"),
        "うかんむり": Radical(kanji: "宀", position: "top"),
        "あめかんむり": Radical(kanji: "雨", position: "top"),
        "あなかんむり": Radical(kanji: "穴", position: "top"),
        "あみがしら": Radical(kanji: "网", position: "top"),
        "なべぶた": Radical(kanji: "亠", position: "top"),
        "はつがしら": Radical(kanji: "癶", position: "top"),
        "ひとやね": Radical(kanji: "人", position: "top"),
        "はちがしら": Radical(kanji: "八", position: "top"),
        "さんずい": Radical(kanji: "水", position: "left"),
        "にすい": Radical(kanji: "冫", position: "left"),
        "にんべん": Radical(kanji: "人", position: "left"),
        "ぎょうにんべん": Radical(kanji: "彳", position: "left"),
        "りっしんべん": Radical(kanji: "心", position: "left"),
        "てへん": Radical(kanji: "手", position: "left"),
        "のぎへん": Radical(kanji: "禾", position: "left"),
        "いとへん": Radical(kanji: "糸", position: "left"),
        "うまへん": Radical(kanji: "馬", position: "left"),
        "かねへん": Radical(kanji: "金", position: "left"),
        "かいへん": Radical(kanji: "貝", position: "left"),
        "ごんべん": Radical(kanji: "言", position: "left"),
        "しめすへん": Radical(kanji: "示", position: "left"),
        "けものへん": Radical(kanji: "犬", position: "left"),
        "さかなへん": Radical(kanji: "魚", position: "left"),
        "こざとへん": Radical(kanji: "阜", position: "left"),
        "つちへん": Radical(kanji: "土", position: "left"),
        "いしへん": Radical(kanji: "石", position: "left"),
        "たまへん": Radical(kanji: "玉", position: "left"),
        "ゆみへん": Radical(kanji: "弓", position: "left"),
        "ころもへん": Radical(kanji: "衣", position: "left"),
        "くちへん": Radical(kanji: "口", position: "left"),
        "めへん": Radical(kanji: "目", position: "left"),
        "みみへん": Radical(kanji: "耳", position: "left"),
        "つきへん": Radical(kanji: "月", position: "left"),
        "ひへん": Radical(kanji: "日", position: "left"),
        "のごめへん": Radical(kanji: "釆", position: "left"),
        "むしへん": Radical(kanji: "虫", position: "left"),
        "とりへん": Radical(kanji: "酉", position: "left"),
        "おおざと": Radical(kanji: "邑", position: "right"),
        "ちから": Radical(kanji: "力", position: "right"),
        "りっとう": Radical(kanji: "刀", position: "right"),
        "おおがい": Radical(kanji: "頁", position: "right"),
        "ふるとり": Radical(kanji: "隹", position: "right"),
        "ほこづくり": Radical(kanji: "殳", position: "right"),
        "おのづくり": Radical(kanji: "斤", position: "right"),
        "しんにょう": Radical(kanji: "辵", position: "wrapBL"),
        "しんにゅう": Radical(kanji: "辵", position: "wrapBL"),
        "えんにょう": Radical(kanji: "廴", position: "wrapBL"),
        "くにがまえ": Radical(kanji: "囗", position: "enclose"),
        "もんがまえ": Radical(kanji: "門", position: "enclose"),
        "はこがまえ": Radical(kanji: "匚", position: "enclose"),
        "ぎょうがまえ": Radical(kanji: "行", position: "enclose"),
        "きがまえ": Radical(kanji: "气", position: "wrapTL"),
        "まだれ": Radical(kanji: "广", position: "wrapTL"),
        "やまいだれ": Radical(kanji: "疒", position: "wrapTL"),
        "がんだれ": Radical(kanji: "厂", position: "wrapTL"),
        "とだれ": Radical(kanji: "戸", position: "wrapTL")
    ]

    private static let positionWords: [String: String] = [
        "へん": "left",
        "つくり": "right",
        "かんむり": "top",
        "あし": "bottom",
        "にょう": "wrapBL",
        "たれ": "wrapTL",
        "かまえ": "enclose"
    ]

    private static let positionIDCs: [String: [[String]]] = [
        "left": [["⿰", "%X%", "？"], ["⿲", "%X%", "？", "？"]],
        "right": [["⿰", "？", "%X%"], ["⿲", "？", "？", "%X%"]],
        "top": [["⿱", "%X%", "？"], ["⿳", "%X%", "？", "？"]],
        "bottom": [["⿱", "？", "%X%"], ["⿳", "？", "？", "%X%"]],
        "wrapTL": [["⿸", "%X%", "？"]],
        "wrapBL": [["⿺", "%X%", "？"]],
        "wrapTR": [["⿹", "%X%", "？"]],
        "enclose": [["⿴", "%X%", "？"], ["⿵", "%X%", "？"], ["⿶", "%X%", "？"], ["⿷", "%X%", "？"]]
    ]

    private static let positionSignaturePrefix: [String: String] = [
        "left": "l",
        "right": "r",
        "top": "t",
        "bottom": "b",
        "wrapTL": "d",
        "wrapBL": "n",
        "wrapTR": "q",
        "enclose": "e"
    ]

    private static let particleChars: Set<Character> = ["に", "と", "の", "で", "を", "は", "が"]
}

extension KatachiKanjiSearch: @unchecked Sendable {}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
