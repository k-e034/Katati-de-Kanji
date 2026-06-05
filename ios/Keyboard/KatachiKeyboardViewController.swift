import UIKit

final class KatachiKeyboardViewController: UIInputViewController {
    private struct FlickDef {
        let center: String
        let left: String?
        let up: String?
        let right: String?
        let down: String?
    }

    private let composingLabel = UILabel()
    private let candidateScroll = UIStackView()
    private let keyGrid = UIStackView()

    private var searchEngine: KatachiKanjiSearch?
    private var composing = ""
    private var appliedQueryText = ""
    private var currentCandidates: [String] = []
    private var currentSearchTask: Task<Void, Never>?

    private let kanaDefs: [[FlickDef]] = [
        [
            FlickDef(center: "あ", left: "い", up: "う", right: "え", down: "お"),
            FlickDef(center: "か", left: "き", up: "く", right: "け", down: "こ"),
            FlickDef(center: "さ", left: "し", up: "す", right: "せ", down: "そ")
        ],
        [
            FlickDef(center: "た", left: "ち", up: "つ", right: "て", down: "と"),
            FlickDef(center: "な", left: "に", up: "ぬ", right: "ね", down: "の"),
            FlickDef(center: "は", left: "ひ", up: "ふ", right: "へ", down: "ほ")
        ],
        [
            FlickDef(center: "ま", left: "み", up: "む", right: "め", down: "も"),
            FlickDef(center: "や", left: nil, up: "ゆ", right: nil, down: "よ"),
            FlickDef(center: "ら", left: "り", up: "る", right: "れ", down: "ろ")
        ],
        [
            FlickDef(center: "小゛゜", left: nil, up: nil, right: nil, down: nil),
            FlickDef(center: "わ", left: "を", up: "ん", right: "ー", down: nil),
            FlickDef(center: "、", left: "？", up: "。", right: "！", down: "…")
        ]
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.07, blue: 0.09, alpha: 1.0)
        setupSearch()
        buildUI()
        renderComposing()
    }

    override func textWillChange(_ textInput: UITextInput?) {
        composing = ""
        appliedQueryText = ""
        currentSearchTask?.cancel()
        renderComposing()
        submitCandidates([])
    }

    private func setupSearch() {
        do {
            searchEngine = try KatachiKanjiSearch(bundle: Bundle.main)
        } catch {
            composingLabel.text = "検索データを読み込めません"
        }
    }

    private func buildUI() {
        let root = UIStackView()
        root.axis = .vertical
        root.spacing = 0
        root.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(root)

        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            root.topAnchor.constraint(equalTo: view.topAnchor),
            root.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            view.heightAnchor.constraint(greaterThanOrEqualToConstant: 340)
        ])

        composingLabel.font = UIFont.systemFont(ofSize: 18)
        composingLabel.textColor = .white
        composingLabel.backgroundColor = UIColor(red: 0.10, green: 0.12, blue: 0.16, alpha: 1.0)
        composingLabel.numberOfLines = 1
        composingLabel.heightAnchor.constraint(equalToConstant: 44).isActive = true
        composingLabel.layoutMargins = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 10)
        root.addArrangedSubview(composingLabel)

        let scrollView = UIScrollView()
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.backgroundColor = UIColor(red: 0.10, green: 0.12, blue: 0.16, alpha: 1.0)
        scrollView.heightAnchor.constraint(equalToConstant: 56).isActive = true
        candidateScroll.axis = .horizontal
        candidateScroll.spacing = 6
        candidateScroll.alignment = .center
        candidateScroll.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(candidateScroll)
        NSLayoutConstraint.activate([
            candidateScroll.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 6),
            candidateScroll.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -6),
            candidateScroll.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            candidateScroll.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            candidateScroll.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor)
        ])
        root.addArrangedSubview(scrollView)

        keyGrid.axis = .vertical
        keyGrid.spacing = 4
        keyGrid.distribution = .fillEqually
        keyGrid.layoutMargins = UIEdgeInsets(top: 4, left: 4, bottom: 4, right: 4)
        keyGrid.isLayoutMarginsRelativeArrangement = true
        root.addArrangedSubview(keyGrid)

        let controlLabels = ["⌫", "␣", "⏎", "✕"]
        let controlActions: [() -> Void] = [
            { [weak self] in self?.backspace() },
            { [weak self] in self?.space() },
            { [weak self] in self?.enter() },
            { [weak self] in self?.clear() }
        ]

        for (rowIndex, row) in kanaDefs.enumerated() {
            let rowStack = UIStackView()
            rowStack.axis = .horizontal
            rowStack.spacing = 4
            rowStack.distribution = .fillEqually

            for key in row {
                if key.center == "小゛゜" {
                    rowStack.addArrangedSubview(makeControlButton(title: "小゛゜") { [weak self] in self?.cycleLastKana() })
                } else {
                    let keyView = FlickKeyView(center: key.center, left: key.left, up: key.up, right: key.right, down: key.down)
                    keyView.onPick = { [weak self] value in self?.append(value) }
                    rowStack.addArrangedSubview(keyView)
                }
            }

            rowStack.addArrangedSubview(makeControlButton(title: controlLabels[rowIndex], action: controlActions[rowIndex]))
            keyGrid.addArrangedSubview(rowStack)
        }
    }

    private func makeControlButton(title: String, action: @escaping () -> Void) -> UIButton {
        let button = ActionButton(action: action)
        button.setTitle(title, for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = UIColor(red: 0.15, green: 0.17, blue: 0.21, alpha: 1.0)
        button.layer.cornerRadius = 6
        button.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .medium)
        return button
    }

    private func append(_ value: String) {
        composing.append(value)
        composingChanged()
    }

    private func backspace() {
        if !composing.isEmpty {
            composing.removeLast()
            composingChanged()
        } else {
            textDocumentProxy.deleteBackward()
        }
    }

    private func clear() {
        composing = ""
        composingChanged()
    }

    private func space() {
        if composing.isEmpty {
            textDocumentProxy.insertText(" ")
        } else if let first = currentCandidates.first {
            commit(first)
        } else {
            textDocumentProxy.insertText(composing)
            composing = ""
            composingChanged()
        }
    }

    private func enter() {
        if composing.isEmpty {
            textDocumentProxy.insertText("\n")
        } else {
            textDocumentProxy.insertText(composing)
            composing = ""
            composingChanged()
        }
    }

    private func cycleLastKana() {
        guard let last = composing.last, let next = Self.cycleNext[last] else { return }
        composing.removeLast()
        composing.append(next)
        composingChanged()
    }

    private func composingChanged() {
        renderComposing()
        scheduleSearch()
    }

    private func renderComposing() {
        composingLabel.text = composing
    }

    private func scheduleSearch() {
        let query = composing
        guard !query.isEmpty else {
            appliedQueryText = ""
            currentSearchTask?.cancel()
            submitCandidates([])
            return
        }
        if !query.hasPrefix(appliedQueryText) {
            appliedQueryText = ""
        }

        currentSearchTask?.cancel()
        currentSearchTask = Task { [weak self] in
            guard let self, let searchEngine else { return }
            let results = await Task.detached(priority: .userInitiated) {
                searchEngine.search(query).results
            }.value

            await MainActor.run {
                guard !Task.isCancelled else { return }
                let current = self.composing
                if !current.hasPrefix(query) {
                    return
                } else if !results.isEmpty && query.count >= self.appliedQueryText.count {
                    self.appliedQueryText = query
                    self.submitCandidates(results)
                } else if results.isEmpty && query == current {
                    self.appliedQueryText = query
                    self.submitCandidates([])
                }
            }
        }
    }

    private func submitCandidates(_ results: [String]) {
        currentCandidates = results
        candidateScroll.arrangedSubviews.forEach { view in
            candidateScroll.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for candidate in results {
            let button = ActionButton { [weak self] in self?.commit(candidate) }
            button.setTitle(candidate, for: .normal)
            button.setTitleColor(.white, for: .normal)
            button.titleLabel?.font = UIFont(name: "IPAmjMincho", size: 30) ?? UIFont.systemFont(ofSize: 30)
            button.tintColor = .white
            button.backgroundColor = UIColor(red: 0.13, green: 0.15, blue: 0.19, alpha: 1.0)
            button.layer.cornerRadius = 6
            button.widthAnchor.constraint(greaterThanOrEqualToConstant: 58).isActive = true
            button.heightAnchor.constraint(equalToConstant: 44).isActive = true
            candidateScroll.addArrangedSubview(button)
        }
    }

    private func commit(_ value: String) {
        textDocumentProxy.insertText(value)
        composing = ""
        composingChanged()
    }

    private static let cycles: [[Character]] = [
        ["あ", "ぁ"], ["い", "ぃ"], ["う", "ぅ", "ゔ"], ["え", "ぇ"], ["お", "ぉ"],
        ["か", "が"], ["き", "ぎ"], ["く", "ぐ"], ["け", "げ"], ["こ", "ご"],
        ["さ", "ざ"], ["し", "じ"], ["す", "ず"], ["せ", "ぜ"], ["そ", "ぞ"],
        ["た", "だ"], ["ち", "ぢ"], ["つ", "っ", "づ"], ["て", "で"], ["と", "ど"],
        ["は", "ば", "ぱ"], ["ひ", "び", "ぴ"], ["ふ", "ぶ", "ぷ"], ["へ", "べ", "ぺ"], ["ほ", "ぼ", "ぽ"],
        ["や", "ゃ"], ["ゆ", "ゅ"], ["よ", "ょ"], ["わ", "ゎ"]
    ]

    private static let cycleNext: [Character: Character] = {
        var map: [Character: Character] = [:]
        for cycle in cycles {
            for index in cycle.indices {
                map[cycle[index]] = cycle[(index + 1) % cycle.count]
            }
        }
        return map
    }()
}

final class ActionButton: UIButton {
    private let action: () -> Void

    init(action: @escaping () -> Void) {
        self.action = action
        super.init(frame: .zero)
        addTarget(self, action: #selector(runAction), for: .touchUpInside)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func runAction() {
        action()
    }
}

final class FlickKeyView: UIControl {
    var onPick: ((String) -> Void)?

    private let centerLabel: String
    private let flicks: [String?]
    private let threshold: CGFloat = 24
    private var startPoint: CGPoint = .zero
    private var activeDirection: Int = -1

    init(center: String, left: String?, up: String?, right: String?, down: String?) {
        self.centerLabel = center
        self.flicks = [left, up, right, down]
        super.init(frame: .zero)
        isMultipleTouchEnabled = false
        backgroundColor = UIColor(red: 0.15, green: 0.17, blue: 0.21, alpha: 1.0)
        layer.cornerRadius = 6
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
        startPoint = touch.location(in: self)
        activeDirection = -1
        setNeedsDisplay()
        return true
    }

    override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
        let point = touch.location(in: self)
        activeDirection = direction(dx: point.x - startPoint.x, dy: point.y - startPoint.y)
        setNeedsDisplay()
        return true
    }

    override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
        let point = touch?.location(in: self) ?? startPoint
        let pickedDirection = direction(dx: point.x - startPoint.x, dy: point.y - startPoint.y)
        let value = pickedDirection == -1 ? centerLabel : flicks[pickedDirection]
        activeDirection = -1
        setNeedsDisplay()
        if let value, !value.isEmpty {
            onPick?(value)
        }
    }

    override func cancelTracking(with event: UIEvent?) {
        activeDirection = -1
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        let context = UIGraphicsGetCurrentContext()
        context?.setFillColor((isTracking ? UIColor(red: 0.27, green: 0.31, blue: 0.40, alpha: 1.0) : UIColor(red: 0.15, green: 0.17, blue: 0.21, alpha: 1.0)).cgColor)
        context?.fill(rect)

        if isTracking {
            drawHint(in: rect)
        } else {
            drawResting(in: rect)
        }
    }

    private func drawResting(in rect: CGRect) {
        draw(centerLabel, at: CGPoint(x: rect.midX, y: rect.midY), font: .systemFont(ofSize: 22, weight: .medium), color: .white)
        let muted = UIColor(red: 0.58, green: 0.61, blue: 0.67, alpha: 1.0)
        if let left = flicks[0] { draw(left, at: CGPoint(x: rect.minX + 16, y: rect.midY), font: .systemFont(ofSize: 11), color: muted) }
        if let up = flicks[1] { draw(up, at: CGPoint(x: rect.midX, y: rect.minY + 14), font: .systemFont(ofSize: 11), color: muted) }
        if let right = flicks[2] { draw(right, at: CGPoint(x: rect.maxX - 16, y: rect.midY), font: .systemFont(ofSize: 11), color: muted) }
        if let down = flicks[3] { draw(down, at: CGPoint(x: rect.midX, y: rect.maxY - 14), font: .systemFont(ofSize: 11), color: muted) }
    }

    private func drawHint(in rect: CGRect) {
        let cell = min(rect.width, rect.height) / 3
        let cells: [(String, CGPoint, Int)] = [
            (centerLabel, CGPoint(x: rect.midX, y: rect.midY), -1),
            (flicks[0] ?? "", CGPoint(x: rect.midX - cell, y: rect.midY), 0),
            (flicks[1] ?? "", CGPoint(x: rect.midX, y: rect.midY - cell), 1),
            (flicks[2] ?? "", CGPoint(x: rect.midX + cell, y: rect.midY), 2),
            (flicks[3] ?? "", CGPoint(x: rect.midX, y: rect.midY + cell), 3)
        ]

        for (label, point, direction) in cells where !label.isEmpty {
            let isActive = activeDirection == direction
            let cellRect = CGRect(x: point.x - cell / 2 + 2, y: point.y - cell / 2 + 2, width: cell - 4, height: cell - 4)
            let path = UIBezierPath(roundedRect: cellRect, cornerRadius: 6)
            (isActive ? UIColor(red: 0.48, green: 0.72, blue: 1.0, alpha: 1.0) : UIColor(red: 0.23, green: 0.25, blue: 0.31, alpha: 1.0)).setFill()
            path.fill()
            draw(label, at: point, font: .systemFont(ofSize: isActive ? 22 : 20, weight: .medium), color: isActive ? UIColor.black : UIColor.white)
        }
    }

    private func draw(_ string: String, at point: CGPoint, font: UIFont, color: UIColor) {
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let size = string.size(withAttributes: attributes)
        string.draw(at: CGPoint(x: point.x - size.width / 2, y: point.y - size.height / 2), withAttributes: attributes)
    }

    private func direction(dx: CGFloat, dy: CGFloat) -> Int {
        let adx = abs(dx)
        let ady = abs(dy)
        if adx < threshold && ady < threshold { return -1 }
        if adx > ady {
            return dx < 0 ? 0 : 2
        }
        return dy < 0 ? 1 : 3
    }
}
