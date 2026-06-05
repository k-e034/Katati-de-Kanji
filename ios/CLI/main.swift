import Foundation

private struct Case {
    let query: String
    let expectedFirst: String?
    let expectedContains: String?
}

private let cases = [
    Case(query: "きへんにもどる", expectedFirst: "棙", expectedContains: nil),
    Case(query: "あめくちくちくちりゅう", expectedFirst: "龗", expectedContains: nil),
    Case(query: "おに", expectedFirst: nil, expectedContains: "鬼"),
    Case(query: "くに", expectedFirst: nil, expectedContains: "国"),
    Case(query: "のき", expectedFirst: "宇", expectedContains: "軒"),
    Case(query: "オニ", expectedFirst: nil, expectedContains: "鬼")
]

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: katati-search-cli <asset-directory> [query ...]\n".utf8))
    exit(2)
}

let assetDirectory = URL(fileURLWithPath: arguments[1], isDirectory: true)
let dbURL = assetDirectory.appendingPathComponent("idsfind.db")
let readingURL = assetDirectory.appendingPathComponent("reading-index.json")
let subtreeURL = assetDirectory.appendingPathComponent("subtree-index.db")

let loadStart = ContinuousClock.now
let search = try KatachiKanjiSearch(
    databaseURL: dbURL,
    readingIndexURL: readingURL,
    subtreeIndexURL: FileManager.default.fileExists(atPath: subtreeURL.path) ? subtreeURL : nil
)
let loadElapsed = loadStart.duration(to: .now)
print("loaded readings=\(search.readingCount) in \(format(loadElapsed))")

if arguments.count > 2 {
    for query in arguments.dropFirst(2) {
        printResult(query: query, search: search)
    }
    exit(0)
}

var failures = 0
for testCase in cases {
    let result = printResult(query: testCase.query, search: search)
    if let expected = testCase.expectedFirst, result.results.first != expected {
        failures += 1
        print("  FAIL expected first=\(expected)")
    }
    if let expected = testCase.expectedContains, !result.results.contains(expected) {
        failures += 1
        print("  FAIL expected results to contain=\(expected)")
    }
}

if failures == 0 {
    print("PASS \(cases.count) cases")
} else {
    print("FAIL \(failures) assertions")
    exit(1)
}

@discardableResult
private func printResult(query: String, search: KatachiKanjiSearch) -> KatachiKanjiSearch.Result {
    let start = ContinuousClock.now
    let result = search.search(query)
    let elapsed = start.duration(to: .now)
    print("\n>>> \(query)")
    print("  tokens: \(result.tokens)")
    print("  results: \(result.results.prefix(20).joined(separator: " "))")
    print("  count=\(result.results.count) elapsed=\(format(elapsed))")
    if let message = result.message {
        print("  message: \(message)")
    }
    return result
}

private func format(_ duration: Duration) -> String {
    let components = duration.components
    let milliseconds = Double(components.seconds) * 1_000
        + Double(components.attoseconds) / 1_000_000_000_000_000
    return String(format: "%.1fms", milliseconds)
}
