import XCTest
@testable import Katati_de_Kanji

final class Katati_de_KanjiTests: XCTestCase {
    private var search: KatachiKanjiSearch!

    override func setUpWithError() throws {
        search = try KatachiKanjiSearch(bundle: Bundle.main)
    }

    func testNamedRadicalAndReading() {
        let result = search.search("きへんにもどる")

        XCTAssertEqual(result.tokens, ["き(left)", "もどる"])
        XCTAssertEqual(result.results.first, "棙")
    }

    func testRepeatedComponentsFavorDragonGlyph() {
        let result = search.search("あめくちくちくちりゅう")

        XCTAssertEqual(result.tokens, ["あめ", "くち", "くち", "くち", "りゅう"])
        XCTAssertEqual(result.results.first, "龗")
    }

    func testParticleCharacterInsideReadingIsNotSplit() {
        let result = search.search("おに")

        XCTAssertEqual(result.tokens, ["おに"])
        XCTAssertTrue(result.results.contains("鬼"))
    }

    func testKatakanaIsNormalizedToHiragana() {
        let hiragana = search.search("おに")
        let katakana = search.search("オニ")

        XCTAssertEqual(katakana.tokens, hiragana.tokens)
        XCTAssertEqual(katakana.results, hiragana.results)
    }

    func testUnknownInputReturnsMessage() {
        let result = search.search("abc")

        XCTAssertTrue(result.results.isEmpty)
        XCTAssertEqual(result.message, "読みを認識できませんでした")
    }
}
