# TROUBLESHOOTING.md — デバッグ手順と開発時の知見

## 目次

1. [よくある問題と解決策](#よくある問題と解決策)
2. [動作確認手順](#動作確認手順)
3. [開発時に遭遇した問題と解決の経緯](#開発時に遭遇した問題と解決の経緯)
4. [VS Code アップデート後の対応](#vs-code-アップデート後の対応)

---

## よくある問題と解決策

### JS が読み込まれない

**症状**: Console に `[DiffFontPatch] Observer started` が表示されない

**確認手順**:
1. `Ctrl+Shift+I` で DevTools を開く
2. Console タブでフィルタに `DiffFontPatch` を入力
3. ログが出ていない場合は JS が読み込まれていない

**原因と対策**:

| 原因 | 対策 |
|------|------|
| パスが間違っている | `file:///` で始まり、フォワードスラッシュを使用しているか確認 |
| Custom CSS が無効 | `Ctrl+Shift+P` → `Enable Custom CSS and JS` を実行 |
| Reload していない | 有効化後に VS Code を再起動 |
| ファイルが存在しない | 指定パスにファイルがあるか確認 |

**パス形式の正誤例**:
```
✅ file:///C:/Users/user/workspace/.vscode/diff-font-patch.js
❌ file:///C:\Users\user\workspace\.vscode\diff-font-patch.js  (バックスラッシュ)
❌ file://C:/Users/user/workspace/.vscode/diff-font-patch.js   (スラッシュ2つ)
❌ file:///c:/users/user/...                                    (小文字ドライブレター)
```

### マーキングログが出るがフォントが変わらない

**症状**: Console に `[DiffFontPatch] N行マーキング` が出るが、フォントが変わっていない

**確認手順**:

1. Elements タブで `.custom-diff-line` クラスが付いているか確認:
```javascript
document.querySelectorAll('.custom-diff-line').length
```

2. CSS が正しく読み込まれているか確認:
```javascript
// テスト用 CSS を直接注入
const style = document.createElement('style');
style.textContent = `
  .view-line.custom-diff-line,
  .view-line.custom-diff-line * {
    font-family: 'フォント名', monospace !important;
    color: red !important;
  }
`;
document.head.appendChild(style);
```

3. 赤色になれば CSS の優先度問題。`custom.css` のセレクタをより詳細にする:
```css
/* 優先度を上げる */
.monaco-editor .view-lines .view-line.custom-diff-line,
.monaco-editor .view-lines .view-line.custom-diff-line * {
    font-family: 'フォント名', monospace !important;
}
```

### マーキングログが出ない（diff 表示中なのに）

**症状**: diff が表示されているのに `[DiffFontPatch]` ログが出ない

**診断コマンド**（Console で実行）:

```javascript
(function() {
  // Step 1: char-insert が存在するか
  const inserts = document.querySelectorAll('.char-insert');
  console.log('char-insert 数:', inserts.length);
  if (inserts.length === 0) {
    console.log('→ diff が表示されていないか、DOM 構造が変更された可能性');
    return;
  }

  // Step 2: overlay の構造を確認
  const overlays = document.querySelectorAll('.view-overlays');
  console.log('view-overlays 数:', overlays.length);

  overlays.forEach((ol, i) => {
    const insertCount = ol.querySelectorAll('.char-insert').length;
    if (insertCount === 0) return;

    console.log(`overlays[${i}]: char-insert=${insertCount}`);

    // Step 3: overflow-guard の確認
    const og = ol.closest('.overflow-guard');
    console.log('  overflow-guard:', !!og);

    // Step 4: view-lines の確認
    if (og) {
      og.querySelectorAll('.view-lines').forEach((vl, j) => {
        const isDelete = vl.classList.contains('line-delete');
        const count = vl.querySelectorAll('.view-line').length;
        console.log(`  view-lines[${j}]: delete=${isDelete} count=${count}`);
      });
    }
  });

  // Step 5: top 値の照合テスト
  const firstInsert = inserts[0].closest('[style*="top"]');
  if (firstInsert) {
    const insertTop = parseInt(firstInsert.style.top);
    console.log('最初の char-insert top:', insertTop);

    const og = firstInsert.closest('.overflow-guard');
    og?.querySelectorAll('.view-lines').forEach(vl => {
      if (vl.classList.contains('line-delete')) return;
      vl.querySelectorAll('.view-line').forEach((v, k) => {
        if (v.offsetTop === insertTop) {
          console.log(`  一致: view-line[${k}] offsetTop=${v.offsetTop}`);
        }
      });
    });
  }
})();
```

### フォントがインストールされていない

**確認方法**:
```javascript
// フォントが利用可能か確認
document.fonts.check('12px "Moralerspace Radon JPDOC"');
```

`false` が返る場合、フォントがインストールされていません。

---

## 動作確認手順

### 基本確認

1. VS Code を開く
2. `Ctrl+Shift+I` → Console → フィルタ: `DiffFontPatch`
3. `[DiffFontPatch] Observer started (v5.1)` が表示されていることを確認
4. エディタで `Ctrl+I` → インラインチャットで何らかの変更を生成
5. `[DiffFontPatch] N行マーキング` が表示されることを確認
6. diff 行のフォントが変わっていることを確認

### 詳細診断

```javascript
// 全エディタインスタンスの状態を一覧表示
(function() {
  const editors = document.querySelectorAll('.monaco-editor .overflow-guard');
  editors.forEach((ed, i) => {
    const overlays = ed.querySelector('.view-overlays');
    const insertCount = overlays?.querySelectorAll('.char-insert').length || 0;
    const viewLineCount = ed.querySelectorAll('.view-line').length;
    const markedCount = ed.querySelectorAll('.custom-diff-line').length;
    const zoneWidget = ed.closest('.zone-widget');
    
    console.log(`[Editor${i}] inserts:${insertCount} lines:${viewLineCount} marked:${markedCount} zone:${!!zoneWidget}`);
  });
})();
```

---

## 開発時に遭遇した問題と解決の経緯

本パッチの開発では、VS Code の非公開 DOM 構造を解析するために 5 回のメジャーバージョン改修（v1→v5.1）が必要でした。以下はその経緯の記録です。

### v1: 基本実装 — overflow-guard 起点、style.top 照合

**仮説**: `overflow-guard` 内の `view-overlays` と `view-lines` は兄弟で、同じ `style.top` 値を持つ

**問題**: view-line の `style.top` が常に `"0px"` を返す

**調査結果**: view-line 自体ではなく、**親 div** の `style.top` に実際の位置がある

```javascript
// v1（失敗）
const top = viewLine.style.top;        // → "0px"（常に）

// 実際の構造
// <div style="top: 310px">     ← 親の top が位置
//   <div class="view-line">    ← 自身の top は 0px
```

### v2: 親の style.top を使用

**修正**: `viewLine.parentElement.style.top` を参照

**問題**: `"0px"` が先に評価される（`||` 演算子の罠）

```javascript
// v2（失敗）
const top = viewLine.style.top || viewLine.parentElement?.style.top;
// viewLine.style.top = "0px" (falsy ではない！) → 常に "0px" が使われる
```

### v3: lines-content 起点、非空 view-lines を探索

**修正**: `overlays.parentElement`（= lines-content）内の view-lines を探索

**問題**: ターゲットの view-lines が同じ lines-content 内に存在しない

**調査結果**:
- `lines-content (A)` に overlay + `view-lines (空)` + `view-lines.line-delete`
- `lines-content (B)` に `view-lines (挿入テキスト)`
- 同じ parent 内を探しても見つからない

```
lines-content (A)          lines-content (B)
├── view-overlays          └── view-lines ← ★ ここにある
│   └── .char-insert
├── view-lines (空)
└── view-lines.line-delete
```

### v4: overflow-guard まで遡り、line-delete を除外

**修正**: `overlays.closest('.overflow-guard')` で共通祖先まで遡る

**問題**: view-line の親 `style.top` が空文字列

**調査結果**:
- 削除側: 親 div に `style.top="310px"` あり
- 挿入側: 親 div に `style.top=""` （空）
- 挿入側は通常フロー配置（CSS position による位置指定なし）

```javascript
// v4 の調査ログ
// overlay 側
overlay[0]: { top: "329px" }  // ← ある

// 挿入側 view-line
view-line[0]: { parentTop: "" }  // ← 空！
```

### v5: offsetTop で照合（最終版）

**修正**: `viewLine.offsetTop` を使用

**根拠**: `offsetTop` はレイアウトエンジンが計算した実際のピクセル位置を返す。CSS `top` プロパティに依存しない。

```javascript
// overlay 側: CSS style から取得
parseInt(div.style.top)    // "329px" → 329

// view-line 側: レイアウト計算値
viewLine.offsetTop          // 329

// 一致！
```

### v5.1: ログ制御

**問題**: MutationObserver が頻繁に発火し、Console がログで圧迫される

**修正**: `lastMatchCount` を記録し、変化があった時だけログ出力

---

## VS Code アップデート後の対応

VS Code のアップデートで DOM 構造が変更された場合の対応手順：

### Step 1: 症状の確認

1. `[DiffFontPatch] Observer started` は出るか？
   - 出ない → Custom CSS and JS の再有効化が必要
2. `[DiffFontPatch] N行マーキング` は出るか？
   - 出る → CSS の問題（セレクタ変更等）
   - 出ない → DOM 構造の変更

### Step 2: DOM 構造の再調査

上記の [詳細診断コマンド](#マーキングログが出ないdiff-表示中なのに) を実行し、以下を確認：

1. `.char-insert` は存在するか？（クラス名の変更確認）
2. `.view-overlays` の構造は同じか？
3. `.view-lines` の配置は同じか？
4. 位置指定方法は `style.top` / `offsetTop` のままか？

### Step 3: パッチの修正

DOM 構造の変更に応じて `diff-font-patch.js` を修正：

- クラス名の変更 → セレクタ文字列を更新
- 階層構造の変更 → 探索ロジックを調整
- 位置指定方法の変更 → 照合方法を変更

### Custom CSS and JS の再適用

VS Code アップデート後は Custom CSS and JS のパッチが無効化される場合があります：

1. `Ctrl+Shift+P` → `Reload Custom CSS and JS`
2. VS Code を再起動
3. 動作を確認
