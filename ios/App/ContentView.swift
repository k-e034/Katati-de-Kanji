import SwiftUI

struct ContentView: View {
    @State private var status = "検索データを読み込み中..."
    @State private var sampleText = "ここでキーボードを試せます"

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("カタチで漢字")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)

            Text("設定 > 一般 > キーボード > キーボード > 新しいキーボードを追加 から有効化してください。フルアクセスは不要です。")
                .font(.system(size: 16))
                .foregroundStyle(Color(red: 0.78, green: 0.80, blue: 0.85))

            Text(status)
                .font(.system(size: 14, design: .monospaced))
                .foregroundStyle(Color(red: 0.48, green: 0.72, blue: 1.0))

            TextEditor(text: $sampleText)
                .font(.system(size: 20))
                .foregroundStyle(.white)
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(height: 160)
                .background(Color(red: 0.10, green: 0.12, blue: 0.16))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.06, green: 0.07, blue: 0.09))
        .task {
            await warmSearchEngine()
        }
    }

    private func warmSearchEngine() async {
        let start = Date()
        do {
            let engine = try await Task.detached(priority: .userInitiated) {
                try KatachiKanjiSearch(bundle: .main)
            }.value
            let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)
            status = "準備完了: 読み \(engine.readingCount) 件 / \(elapsedMs)ms"
        } catch {
            status = "検索データを読み込めません: \(error.localizedDescription)"
        }
    }
}

#Preview {
    ContentView()
}
