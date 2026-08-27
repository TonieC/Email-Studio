import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter, lintKeymap, linter } from '@codemirror/lint';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';

function basicLint(source, language) {
  const problems = [];
  if (language === 'html') {
    const stripped = source.replace(/<!--[\s\S]*?-->/g, '');
    if (/<script\b/i.test(stripped)) {
      problems.push({ from: stripped.search(/<script\b/i), to: stripped.search(/<script\b/i) + 8, severity: 'error', message: 'Scripts are removed during email conversion and must not be used.' });
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
  return problems;
}

function makeLinter(language) {
  return linter((view) => {
    const source = view.state.doc.toString();
    return basicLint(source, language);
  });
}

export function createEditor({ parent, value, language, onChange }) {
  const extensions = [
    basicSetup,
    oneDark,
    keymap.of([...lintKeymap, indentWithTab]),
    lintGutter(),
    makeLinter(language),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
  if (language === 'html') extensions.push(html());
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
