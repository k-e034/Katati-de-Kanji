import UIKit

final class ViewController: UIViewController {
    private let statusLabel = UILabel()
    private let textView = UITextView()
    private var searchEngine: KatachiKanjiSearch?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.07, blue: 0.09, alpha: 1.0)
        buildUI()
        warmSearchEngine()
    }

    private func buildUI() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24)
        ])

        let titleLabel = UILabel()
        titleLabel.text = "カタチで漢字"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 28, weight: .semibold)
        stack.addArrangedSubview(titleLabel)

        let bodyLabel = UILabel()
        bodyLabel.text = "設定 > 一般 > キーボード > キーボード > 新しいキーボードを追加 から有効化してください。フルアクセスは不要です。"
        bodyLabel.textColor = UIColor(red: 0.78, green: 0.80, blue: 0.85, alpha: 1.0)
        bodyLabel.font = .systemFont(ofSize: 16)
        bodyLabel.numberOfLines = 0
        stack.addArrangedSubview(bodyLabel)

        statusLabel.textColor = UIColor(red: 0.48, green: 0.72, blue: 1.0, alpha: 1.0)
        statusLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .regular)
        statusLabel.text = "検索データを読み込み中..."
        stack.addArrangedSubview(statusLabel)

        textView.text = "ここでキーボードを試せます"
        textView.font = .systemFont(ofSize: 20)
        textView.textColor = .white
        textView.backgroundColor = UIColor(red: 0.10, green: 0.12, blue: 0.16, alpha: 1.0)
        textView.layer.cornerRadius = 8
        textView.textContainerInset = UIEdgeInsets(top: 14, left: 12, bottom: 14, right: 12)
        textView.heightAnchor.constraint(equalToConstant: 160).isActive = true
        stack.addArrangedSubview(textView)
    }

    private func warmSearchEngine() {
        Task {
            let start = Date()
            do {
                let engine = try await Task.detached(priority: .userInitiated) {
                    try KatachiKanjiSearch(bundle: .main)
                }.value
                searchEngine = engine
                let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)
                statusLabel.text = "準備完了: 読み \(engine.readingCount) 件 / \(elapsedMs)ms"
            } catch {
                statusLabel.text = "検索データを読み込めません: \(error.localizedDescription)"
            }
        }
    }
}
