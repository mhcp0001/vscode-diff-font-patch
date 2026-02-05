# vscode-diff-font-patch

**VS Code Inline Chat の Diff 表示に別フォントを適用する Custom CSS/JS パッチ**

VS Code のインラインチャット（Ctrl+I）で生成されたコード差分に、通常コードとは異なるフォントを適用します。これにより、AI が提案した変更箇所を視覚的に即座に区別できるようになります。

![diff-font-demo](docs/images/demo.png)

## 動機・背景

VS Code のインラインチャット（Copilot の Ctrl+I）は、提案されたコード変更を diff 形式で表示します。しかし、この diff 表示のフォントは通常のエディタフォントと同一であり、公式の `settings.json` では diff テキスト自体のフォントを変更することはできません。

変更可能なのは背景色のみです：

```jsonc
{
  "workbench.colorCustomizations": {
    "inlineChatDiff.inserted": "#9ece6a20",
    "inlineChatDiff.removed": "#f7768e20"
  }
}
```

このパッチは MutationObserver と CSS クラス注入を使って、公式にはサポートされていない **diff テキストのフォント変更** を実現します。

## 必要なもの

- [VS Code](https://code.visualstudio.com/)（動作確認: v1.96+）
- [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) 拡張機能
- 適用したいフォント（例: [Moralerspace](https://github.com/yuru7/moralerspace)）

## セットアップ

### 1. ファイル配置

`diff-font-patch.js` と `custom.css` をプロジェクトまたは任意のディレクトリに配置します。

```
.vscode/
├── custom.css
├── diff-font-patch.js
└── settings.json
```

### 2. settings.json の設定

```jsonc
{
  "vscode_custom_css.imports": [
    "file:///C:/Users/<ユーザー名>/path/to/.vscode/custom.css",
    "file:///C:/Users/<ユーザー名>/path/to/.vscode/diff-font-patch.js"
  ]
}
```

> **重要**: パスは必ず `file:///`（スラッシュ3つ）で始め、フォワードスラッシュを使用してください。
>
> - ✅ `file:///C:/Users/user/workspace/.vscode/custom.css`
> - ❌ `file:///C:\\Users\\user\\workspace\\.vscode\\custom.css`
> - ❌ `file://C:/Users/user/workspace/.vscode/custom.css`

### 3. Custom CSS の有効化

1. `Ctrl+Shift+P` → `Enable Custom CSS and JS`
2. VS Code を再起動（Reload）

> 「Code インストールが壊れている可能性があります」という警告が出ますが、正常です。`Don't Show Again` で閉じてください。

### 4. 動作確認

1. `Ctrl+Shift+I` でインラインチャットを開く
2. コード変更を生成させる（diff 表示が出る）
3. `Ctrl+Shift+I` → DevTools Console で `[DiffFontPatch] N行マーキング` を確認
4. diff 行のフォントが変わっていれば成功

## ファイル構成

### diff-font-patch.js

MutationObserver を使って、diff 表示の背景装飾レイヤー（`view-overlays` 内の `.char-insert`）の位置情報を読み取り、対応するテキスト行（`view-lines` 内の `.view-line`）に `custom-diff-line` CSS クラスを付与します。

### custom.css

付与された `custom-diff-line` クラスに対してフォントを適用するスタイル定義です。

```css
/* Diff 挿入行 → 手書き風フォント */
.view-line.custom-diff-line,
.view-line.custom-diff-line * {
    font-family: 'Moralerspace Radon JPDOC', monospace !important;
}

/* ゴーストテキスト（Copilot インライン提案）→ 手書き風フォント */
.ghost-text-decoration {
    font-family: 'Moralerspace Radon JPDOC', monospace !important;
    font-style: italic !important;
}
```

## カスタマイズ

### フォントの変更

`custom.css` のフォントファミリーを変更するだけです：

```css
.view-line.custom-diff-line,
.view-line.custom-diff-line * {
    font-family: 'お好みのフォント', monospace !important;
}
```

### 追加のスタイリング

フォント以外にも CSS プロパティを自由に追加できます：

```css
.view-line.custom-diff-line,
.view-line.custom-diff-line * {
    font-family: 'Moralerspace Radon JPDOC', monospace !important;
    font-style: italic !important;
    opacity: 0.9;
}
```

### デバウンス間隔の調整

`diff-font-patch.js` 内の `CHECK_INTERVAL` を変更することで、DOM 監視の応答性を調整できます：

```javascript
const CHECK_INTERVAL = 300; // ミリ秒（デフォルト）
```

- 値を小さくすると応答性が上がるがCPU負荷が増加
- 値を大きくするとCPU負荷が減少するがフォント適用に遅延

## 技術的な仕組み

詳細な技術ドキュメントは以下を参照してください：

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — VS Code の DOM 構造、マッチングアルゴリズム、設計判断の詳細
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — デバッグ手順、よくある問題と解決策、開発時の調査ログ

### 概要

1. **MutationObserver** が DOM の変更を検知
2. `view-overlays` 内の `.char-insert` 要素の `style.top` 値を収集
3. 同じ `overflow-guard` 内の挿入側 `view-lines` を特定（`line-delete` クラスを除外）
4. 各 `.view-line` の `offsetTop` と overlay の `style.top` を照合
5. 一致した行に `custom-diff-line` CSS クラスを付与
6. CSS でフォントを適用

## 制限事項

- **VS Code アップデートで動作しなくなる可能性があります** — VS Code の内部 DOM 構造は非公開 API であり、アップデートで変更される可能性があります
- **Custom CSS and JS Loader は VS Code の整合性チェックに影響します** — 「インストールが壊れている可能性があります」という警告が出ます
- **パフォーマンス** — MutationObserver は body 全体を監視するため、非常に大きなファイルでは微小なオーバーヘッドが生じる可能性があります
- **削除行のフォント変更は未実装** — 現在は挿入行（`.char-insert`）のみ対応しています。`.char-delete` への対応は拡張可能です

## ライセンス

MIT License

## 謝辞

- [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) — VS Code へのカスタム CSS/JS 注入を可能にする拡張機能
- [Moralerspace](https://github.com/yuru7/moralerspace) — 日本語プログラミングフォント
