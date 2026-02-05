# ARCHITECTURE.md — VS Code Inline Chat Diff の DOM 構造と技術解説

このドキュメントでは、VS Code のインラインチャット diff 表示の内部 DOM 構造と、本パッチがフォントを適用するメカニズムを詳細に解説します。

## 目次

1. [VS Code エディタの基本構造](#vs-code-エディタの基本構造)
2. [インラインチャット Diff の特殊構造](#インラインチャット-diff-の特殊構造)
3. [マッチングアルゴリズム](#マッチングアルゴリズム)
4. [設計判断と却下した代替案](#設計判断と却下した代替案)
5. [公式 API の限界](#公式-api-の限界)
6. [拡張ポイント](#拡張ポイント)

---

## VS Code エディタの基本構造

VS Code のエディタ（Monaco Editor）は、テキスト描画と装飾表示を分離したレイヤー構造を持っています。

### 通常エディタの構造

```
.monaco-editor
  └── .overflow-guard
        └── .monaco-scrollable-element
              └── .lines-content.monaco-editor-background
                    ├── .view-overlays          ← 背景装飾レイヤー
                    │     ├── div[style="top: 0px"]
                    │     │     └── .current-line  (カーソル行ハイライト)
                    │     ├── div[style="top: 19px"]
                    │     └── ...
                    │
                    └── .view-lines             ← テキスト描画レイヤー
                          ├── div[style="top: 0px"]
                          │     └── .view-line
                          │           └── span.mtk1  (トークン)
                          ├── div[style="top: 19px"]
                          │     └── .view-line
                          │           └── span.mtk5
                          └── ...
```

**重要な点**:
- `view-overlays`（背景）と `view-lines`（テキスト）は**兄弟要素**
- 各行は `style.top` の px 値で同じ行を示す
- テキストに diff 固有の CSS クラスは**付与されない** — `span.mtk*` は通常コードと同一

---

## インラインチャット Diff の特殊構造

インラインチャット（Ctrl+I）の diff 表示は、通常エディタとは**大きく異なる構造**を持ちます。

### 全体像

```
.overflow-guard
  │
  ├── .lines-content (A) ─── 装飾 + 削除テキスト
  │     ├── .view-overlays
  │     │     ├── div[style="top: 329px"]
  │     │     │     └── .char-insert          ← 挿入行の背景装飾
  │     │     ├── div[style="top: 310px"]
  │     │     │     └── .char-insert
  │     │     └── div[style="top: 92px"]      ← char-insert なし（変更なし行）
  │     │
  │     ├── .view-lines (空)                   ← children=0、ダミー
  │     │
  │     └── .view-lines.line-delete            ← 削除テキスト
  │           └── div[style="top: 310px"]
  │                 └── .view-line
  │
  ├── .lines-content (B) ─── 挿入テキスト
  │     └── .view-lines                        ← ★ ターゲット
  │           ├── div (top は style ではなく offsetTop で取得)
  │           │     └── .view-line [offsetTop=130]
  │           ├── div
  │           │     └── .view-line [offsetTop=329]  ← 329 が一致!
  │           └── ...
  │
  └── .lines-content (C) ─── その他（行番号等）
```

### 発見した重要事項

#### 1. 同一 overflow-guard 内に複数の lines-content が存在

通常のエディタでは `overflow-guard` 内に `lines-content` は 1 つですが、インラインチャットの diff 表示では**3 つ以上**の `lines-content` が存在します。

#### 2. view-lines が複数存在し、最初のものは空

`lines-content (A)` 内には 2 つの `view-lines` があります：
- 最初の `view-lines`: **children=0**（空のダミー要素）
- 2番目の `view-lines.line-delete`: 削除側のテキスト

`querySelector('.view-lines')` は**最初の空要素を返す**ため、単純なクエリでは正しい要素を取得できません。

#### 3. overlay と挿入テキストは別の lines-content に存在

- `.char-insert` は `lines-content (A)` の `view-overlays` 内
- 挿入テキストは `lines-content (B)` の `view-lines` 内

同じ `lines-content` 内を探索しても見つからないため、`overflow-guard` まで遡って検索する必要があります。

#### 4. 挿入テキストの位置指定方法が異なる

| 要素 | 位置指定方法 | 値の例 |
|------|-------------|--------|
| overlay の行 div | `style.top` | `"329px"` |
| 削除側 view-line の親 | `style.top` | `"310px"` |
| 挿入側 view-line の親 | `style.top` | `""` (空文字) |
| 挿入側 view-line 自体 | `offsetTop` | `329` (数値) |

挿入側のテキストは CSS の `top` プロパティではなく、**通常フロー配置**（`position: static` 的な配置）を使用しています。そのため `style.top` は空文字列を返し、実際の位置は `offsetTop` で取得する必要があります。

---

## マッチングアルゴリズム

### 処理フロー

```
1. document.querySelectorAll('.view-overlays') で全 overlay を取得

2. 各 overlay に対して:
   a. :scope > div 内の .char-insert を持つ行の style.top を parseInt で収集
      → Set<number> insertTops = {329, 310, 348, 367, ...}

   b. overlay.closest('.overflow-guard') で共通コンテナを取得

   c. overflow-guard 内の全 .view-lines を走査:
      - .line-delete クラスを持つもの → スキップ（削除側テキスト）
      - children=0 のもの → スキップ（空ダミー）
      - view-line を持つもの → ターゲット

   d. ターゲット view-lines 内の各 .view-line:
      - viewLine.offsetTop を取得（数値）
      - insertTops.has(offsetTop) で照合
      - 一致 → 'custom-diff-line' クラスを付与
      - 不一致 → クラスを除去（リセット）

3. CSS がクラスに基づいてフォントを適用
```

### 照合の詳細

```javascript
// overlay 側: CSS style プロパティから取得
const top = parseInt(div.style.top);  // "329px" → 329

// テキスト側: レイアウト計算値から取得
const top = viewLine.offsetTop;       // 329

// 比較: 両方とも整数値なので === で一致
insertTops.has(top);                  // Set.has() で O(1) 照合
```

**注意**: `style.top` は文字列（`"329px"`）、`offsetTop` は数値（`329`）なので、overlay 側を `parseInt()` で変換して統一しています。

### MutationObserver の設定

```javascript
observer.observe(document.body, {
  childList: true,    // 子要素の追加・削除
  subtree: true,      // 全子孫要素
  attributes: true,   // 属性変更
  attributeFilter: ['class', 'style']  // class と style のみ監視
});
```

`body` 全体を監視する理由:
- インラインチャットウィジェットは動的に生成・破棄される
- ウィジェットの正確な挿入位置を事前に特定できない
- `attributeFilter` で監視対象を絞ることでパフォーマンス影響を軽減

### デバウンス

```javascript
const CHECK_INTERVAL = 300; // ms

function debouncedMark() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(markDiffLines, CHECK_INTERVAL);
}
```

MutationObserver は DOM 変更ごとに大量のコールバックを発火させるため、300ms のデバウンスで実行頻度を制限しています。

### ログ制御

```javascript
// マーキング数が変化した時だけログ出力
if (totalMatches !== lastMatchCount) {
  if (totalMatches > 0) {
    console.log(`[DiffFontPatch] ${totalMatches}行マーキング`);
  }
  lastMatchCount = totalMatches;
}
```

MutationObserver が繰り返し発火しても、マーキング結果が同じならログは出力されません。

---

## 設計判断と却下した代替案

### 却下案 1: view-overlays 内の行 div から直接 style.top で照合

```javascript
// ❌ 動かない
const top = viewLine.style.top || viewLine.parentElement?.style.top;
```

**理由**: `viewLine.style.top` が `"0px"` を返し、|| 演算子の短絡評価で常に `"0px"` が採用される。

### 却下案 2: 同一 lines-content 内の view-lines を探索

```javascript
// ❌ 空の view-lines またはline-delete のみが見つかる
const vl = overlays.parentElement.querySelector('.view-lines');
```

**理由**: `lines-content (A)` には空の view-lines と line-delete のview-lines しかなく、挿入テキストは `lines-content (B)` に存在する。

### 却下案 3: querySelector('.view-lines') で最初のものを取得

```javascript
// ❌ 空の view-lines を取得してしまう
const viewLines = editorEl.querySelector('.view-lines');
```

**理由**: 同一 overflow-guard 内に複数の view-lines があり、最初のものは children=0 の空要素。

### 却下案 4: CSS セレクタのみで解決

```css
/* ❌ diff テキストに固有のクラスが付かないため不可能 */
.inline-chat-diff .view-line { ... }
```

**理由**: VS Code は diff テキストの `span.mtk*` に diff 固有クラスを付与しない。背景装飾（`view-overlays`）とテキスト（`view-lines`）が完全に分離されている。

### 却下案 5: VS Code のソースコードをフォークしてビルド

**理由**: GitHub Copilot はプロダクト ID で認証されるため、フォーク版では Copilot が動作しない。また、毎月のアップデートでマージ作業が必要。

### 採用案: overflow-guard まで遡り、offsetTop で照合

```javascript
const overflowGuard = overlays.closest('.overflow-guard');
overflowGuard.querySelectorAll('.view-lines').forEach(vl => {
  if (vl.classList.contains('line-delete')) return;
  vl.querySelectorAll('.view-line').forEach(viewLine => {
    if (insertTops.has(viewLine.offsetTop)) {
      viewLine.classList.add(DIFF_LINE_CLASS);
    }
  });
});
```

**利点**: overlay 側の `style.top` と挿入テキスト側の `offsetTop` が同じ px 値を示すことを利用した確実な照合方法。

---

## 公式 API の限界

VS Code が公式に提供する diff 関連のカスタマイズは以下のみです：

```jsonc
{
  "workbench.colorCustomizations": {
    // 背景色のみ変更可能
    "inlineChatDiff.inserted": "#9ece6a20",
    "inlineChatDiff.removed": "#f7768e20",
    "inlineChat.regionHighlight": "#ffffff08"
  }
}
```

以下は**変更不可**:
- diff テキストのフォントファミリー
- diff テキストのフォントサイズ
- diff テキストのフォントスタイル（太字、イタリック等）
- diff テキストの文字色（シンタックスハイライトに依存）

---

## 拡張ポイント

### 削除行（.char-delete）のフォント変更

現在は `.char-insert` のみ対応していますが、同じ手法で `.char-delete` にも対応可能です：

```javascript
// diff-font-patch.js への追加
const DIFF_DELETE_CLASS = 'custom-diff-delete-line';

// overlay 走査時に char-delete も収集
if (div.querySelector('.char-delete')) {
  const top = parseInt(div.style.top);
  if (!isNaN(top)) deleteTops.add(top);
}

// line-delete クラスを持つ view-lines を対象にマッチング
overflowGuard.querySelectorAll('.view-lines.line-delete').forEach(vl => {
  vl.querySelectorAll('.view-line').forEach(viewLine => {
    const parent = viewLine.parentElement;
    const top = parseInt(parent?.style.top);
    if (!isNaN(top) && deleteTops.has(top)) {
      viewLine.classList.add(DIFF_DELETE_CLASS);
    }
  });
});
```

```css
/* custom.css への追加 */
.view-line.custom-diff-delete-line,
.view-line.custom-diff-delete-line * {
    font-family: 'お好みのフォント', monospace !important;
    text-decoration: line-through;
    opacity: 0.6;
}
```

**注意**: 削除側の view-line は `line-delete` クラスを持つ `view-lines` 内にあり、親 div の `style.top` で位置指定されています（挿入側と異なる）。

### ゴーストテキスト（インライン補完）のフォント変更

Copilot のインライン補完（ゴーストテキスト）は JS パッチ不要で CSS のみで変更可能です：

```css
.ghost-text-decoration {
    font-family: 'お好みのフォント', monospace !important;
    font-style: italic !important;
}
```

### インラインチャット入力欄のフォント変更

```css
.inline-chat-overflow.monaco-editor .view-lines {
    font-family: 'お好みのフォント', monospace !important;
}
```

### AI チャットメッセージのフォント変更

```css
.zone-widget.inline-chat-widget .rendered-markdown {
    font-family: 'お好みのフォント', sans-serif !important;
}
```

---

## DOM 構造の調査方法

今後 VS Code のアップデートで DOM 構造が変更された場合の調査手順：

### 1. DevTools を開く

`Ctrl+Shift+I` または `Help` → `Toggle Developer Tools`

### 2. エディタインスタンスの一覧を取得

```javascript
document.querySelectorAll('.monaco-editor .overflow-guard').forEach((ed, i) => {
  const overlays = ed.querySelector('.view-overlays');
  const insertCount = overlays?.querySelectorAll('.char-insert').length || 0;
  console.log(`Editor${i}: char-insert=${insertCount}`);
});
```

### 3. overlay と view-lines の位置指定方法を確認

```javascript
// overlay 側
overlays.querySelectorAll(':scope > div').forEach(d => {
  console.log('top:', d.style.top, 'transform:', d.style.transform);
});

// view-line 側
viewLines.querySelectorAll('.view-line').forEach(v => {
  console.log('offsetTop:', v.offsetTop, 'style.top:', v.style.top,
              'parent.style.top:', v.parentElement?.style.top);
});
```

### 4. Console フィルタの活用

DevTools Console のフィルタに `DiffFontPatch` と入力すると、パッチのログのみを表示できます。
