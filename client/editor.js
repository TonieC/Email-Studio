import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter, lintKeymap, linter } from '@codemirror/lint';
import { keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { indentWithTab, defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { foldGutter, indentOnInput, bracketMatching, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';

function basicLint(source, language) {
  const problems = [];
  if (language === 'html') {
    const stripped = source.replace(/<!--[\s\S]*?-->/g, '');
    const scriptAt = stripped.search(/<script\b/i);
    if (scriptAt >= 0) {
      problems.push({ from: scriptAt, to: scriptAt + 8, severity: 'error', message: 'Scripts are removed during email conversion and must not be used.' });
    }
    const handler = /on[a-z]+\s*=/i.exec(stripped);
    if (handler) {
      problems.push({ from: handler.index, to: handler.index + handler[0].length, severity: 'error', message: 'Inline event handlers are stripped and unsafe in email HTML.' });
    }
    const jsUrl = /(?:href|src)\s*=\s*["']?\s*javascript:/i.exec(stripped);
    if (jsUrl) {
      problems.push({ from: jsUrl.index, to: jsUrl.index + jsUrl[0].length, severity: 'error', message: 'javascript: URLs are rejected.' });
    }
    const tags = [];
    const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
    let m;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    while ((m = re.exec(stripped))) {
      const [, tag, selfClose] = m;
      const isClose = /^<\//.test(m[0]);
      if (selfClose || voidTags.has(tag.toLowerCase())) continue;
      if (isClose) {
        const last = tags[tags.length - 1];
        if (last && last.name === tag) tags.pop();
        else if (last) {
          problems.push({ from: m.index, to: m.index + m[0].length, severity: 'warning', message: `Closing tag </${tag}> does not match <${last.name}>` });
        }
      } else {
        tags.push({ name: tag, index: m.index });
      }
    }
    for (const open of tags) {
      problems.push({ from: open.index, to: open.index + 1, severity: 'warning', message: `Missing closing tag for <${open.name}>` });
    }
  }
  if (language === 'css') {
    const open = (source.match(/{/g) || []).length;
    const close = (source.match(/}/g) || []).length;
    if (open !== close) {
      problems.push({ from: 0, to: Math.min(1, source.length), severity: 'warning', message: 'Unbalanced CSS braces' });
    }
  }
  return problems;
}

function makeLinter(language) {
  return linter((view) => {
    const source = view.state.doc.toString();
    return basicLint(source, language);
  });
}

export function createEditor({ parent, value, language, onChange, onSave, onFormat }) {
  const extensions = [
    basicSetup,
    oneDark,
    history(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    foldGutter(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    search(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
      { key: 'Mod-s', run: () => { onSave && onSave(); return true; } },
      { key: 'Mod-Shift-f', run: () => { onFormat && onFormat(); return true; } },
    ]),
    lintGutter(),
    makeLinter(language),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
  if (language === 'html') extensions.push(html({ autoCloseTags: true, matchClosingTags: true }));
  if (language === 'css') extensions.push(css());

  const view = new EditorView({
    state: EditorState.create({ doc: value || '', extensions }),
    parent,
  });
  return view;
}

export function setValue(view, value) {
  const cur = view.state.doc.toString();
  if (cur === value) return;
  view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
}

export async function formatDoc(view, language, formatter) {
  const source = view.state.doc.toString();
  if (!formatter) return;
  try {
    const formatted = await formatter(source, language);
    if (formatted && formatted !== source) {
      view.dispatch({ changes: { from: 0, to: source.length, insert: formatted } });
    }
  } catch (e) {
    console.error('format failed', e);
  }
}

export function openSearch(view) {
  view.focus();
  const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true });
  view.contentDOM.dispatchEvent(event);
}
