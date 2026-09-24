// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Wires the pure {@link detectTokens} detector up to a live editor as a
 * purely visual decoration, using the CSS Custom Highlight API
 * (https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API).
 *
 * That API paints a highlight over arbitrary Range objects without
 * inserting any node into the document, so recognised tokens can be
 * decorated with zero risk of ever mutating the editor's actual content
 * - unlike the old tiny_chemformula plugin, this module never calls
 * replaceChild, insertNode, or setContent. If a browser does not support
 * the API, the whole module is a silent no-op rather than falling back
 * to any DOM-mutating alternative.
 *
 * @module      tiny_chemformula/highlighter
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {detectTokens, getLiteralMask} from './formatter';

const HIGHLIGHT_NAME = 'tiny_chemformula-token';
const WORD_BOUNDARY_KEYS = new Set([' ', '.', 'Enter']);
// Script/style, plus content filter_chemformula never touches, so
// highlighting it would mislead.
const SKIP_SELECTOR = 'script, style, pre, code, .nolink';
// Inline formatting tags that don't break a run of text (mirrors
// filter_chemformula's text_filter::INLINE_TAGS).
const INLINE_TAGS = new Set([
    'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'INS', 'MARK', 'Q',
    'S', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'U',
]);

/**
 * @param {Window} win
 * @returns {boolean}
 */
const isHighlightApiSupported = (win) => Boolean(win && win.CSS && win.CSS.highlights && win.Highlight);

/**
 * Inject the (idempotent) stylesheet rule that paints the highlight.
 * Uses editor.dom.addStyle so it is scoped to the editor's own document
 * and removed automatically when the editor is destroyed.
 *
 * @param {TinyMCE} editor
 */
const injectHighlightStyle = (editor) => {
    editor.dom.addStyle(
        `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(255, 196, 0, .35); }`
    );
};

/**
 * Gather the text node descendants of root into runs: each run is the text
 * nodes that read as one continuous stretch of text, separated only by
 * inline formatting tags. Any other element (a paragraph, list item, line
 * break, ...) ends the current run. Script and style content, and anything
 * filter_chemformula would skip (pre, code, or a "nolink" element), is left
 * out. Read-only: nothing here is ever mutated.
 *
 * @param {Node} root
 * @returns {Text[][]}
 */
const collectTextRuns = (root) => {
    const runs = [[]];
    const walk = (node) => {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                runs[runs.length - 1].push(child);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const skip = child.matches(SKIP_SELECTOR);
                const boundary = skip || !INLINE_TAGS.has(child.nodeName);
                if (boundary) {
                    runs.push([]);
                }
                if (!skip) {
                    walk(child);
                }
                if (boundary) {
                    runs.push([]);
                }
            }
        }
    };
    walk(root);
    return runs.filter((run) => run.length > 0);
};

/**
 * Re-scan the whole editor body and repaint the highlight to match
 * exactly the tokens currently recognised in the (untouched) text.
 *
 * @param {TinyMCE} editor
 */
export const refreshHighlights = (editor) => {
    const win = editor.getWin();
    if (!isHighlightApiSupported(win)) {
        return;
    }

    const doc = editor.getDoc();
    const ranges = collectTextRuns(editor.getBody()).flatMap((run) => {
        // Pair backtick literals over the whole run, so one whose backticks
        // land in different text nodes (e.g. "`<em>2.5x10^-3`</em>") still
        // suppresses highlighting inside it.
        const mask = getLiteralMask(run.map((node) => node.textContent).join(''));
        let offset = 0;
        return run.flatMap((node) => {
            const text = node.textContent;
            const nodeMask = mask.slice(offset, offset + text.length);
            offset += text.length;
            return detectTokens(text, nodeMask).map((token) => {
                const range = doc.createRange();
                range.setStart(node, token.start);
                range.setEnd(node, token.end);
                return range;
            });
        });
    });

    win.CSS.highlights.set(HIGHLIGHT_NAME, new win.Highlight(...ranges));
};

/**
 * Word-boundary trigger: space, period or Enter. Runs on keyup, after
 * the character has already been inserted by the browser, since this
 * module only ever reads the resulting text - there is no cursor-position
 * bookkeeping to get right the way there would be for an in-place edit.
 *
 * @param {TinyMCE} editor
 * @returns {function(KeyboardEvent): void}
 */
const handleWordBoundaryKey = (editor) => (event) => {
    if (WORD_BOUNDARY_KEYS.has(event.key)) {
        refreshHighlights(editor);
    }
};

/**
 * Register the highlighter on the given editor instance. A no-op if the
 * browser does not support the CSS Custom Highlight API.
 *
 * Everything that touches the editor's content window/body is deferred
 * until the 'init' event: at plugin setup time (when this function
 * itself runs) TinyMCE has not necessarily created its iframe/body yet,
 * and calling getWin()/getBody() too early can throw and abort the
 * whole editor's initialisation.
 *
 * @param {TinyMCE} editor
 */
export const registerHighlighting = (editor) => {
    editor.on('init', () => {
        if (!isHighlightApiSupported(editor.getWin())) {
            return;
        }

        injectHighlightStyle(editor);
        editor.on('keyup', handleWordBoundaryKey(editor));
        editor.on('SetContent', () => refreshHighlights(editor));
        refreshHighlights(editor);
    });
};
