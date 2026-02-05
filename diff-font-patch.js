/**
 * VS Code Inline Chat Diff Font Patch v5.1
 * 
 * overlay: style.top="329px"
 * view-line: offsetTop=329
 * → parseInt(overlay.style.top) === viewLine.offsetTop で照合
 */
(function () {
  'use strict';

  const DIFF_LINE_CLASS = 'custom-diff-line';
  const CHECK_INTERVAL = 300;
  let debounceTimer = null;
  let lastMatchCount = 0;

  function markDiffLines() {
    let totalMatches = 0;

    document.querySelectorAll('.view-overlays').forEach(overlays => {
      const insertTops = new Set();
      overlays.querySelectorAll(':scope > div').forEach(div => {
        if (div.querySelector('.char-insert')) {
          const top = parseInt(div.style.top);
          if (!isNaN(top)) insertTops.add(top);
        }
      });
      if (insertTops.size === 0) return;

      const overflowGuard = overlays.closest('.overflow-guard');
      if (!overflowGuard) return;

      overflowGuard.querySelectorAll('.view-lines').forEach(vl => {
        if (vl.classList.contains('line-delete')) return;
        const viewLineEls = vl.querySelectorAll('.view-line');
        if (viewLineEls.length === 0) return;

        viewLineEls.forEach(viewLine => {
          const top = viewLine.offsetTop;
          if (insertTops.has(top)) {
            if (!viewLine.classList.contains(DIFF_LINE_CLASS)) {
              viewLine.classList.add(DIFF_LINE_CLASS);
            }
            totalMatches++;
          } else {
            viewLine.classList.remove(DIFF_LINE_CLASS);
          }
        });
      });
    });

    // マーキング数が変化した時だけログ出力
    if (totalMatches !== lastMatchCount) {
      if (totalMatches > 0) {
        console.log(`[DiffFontPatch] ${totalMatches}行マーキング`);
      }
      lastMatchCount = totalMatches;
    }
  }

  function debouncedMark() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(markDiffLines, CHECK_INTERVAL);
  }

  function startObserving() {
    const observer = new MutationObserver(debouncedMark);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    console.log('[DiffFontPatch] Observer started (v5.1)');
  }

  function init() {
    if (document.querySelector('.monaco-editor')) {
      startObserving();
      setTimeout(markDiffLines, 1000);
    } else {
      setTimeout(init, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
