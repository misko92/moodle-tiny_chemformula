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

import {detectTokens} from './formatter';

const HIGHLIGHT_NAME = 'tiny_chemformula-token';
const WORD_BOUNDARY_KEYS = new Set([' ', '.', 'Enter']);
const SKIP_PARENT_TAGS = new Set(['SCRIPT', 'STYLE']);

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
 * Collect all non-empty text node descendants of root, skipping script
 * and style content. Read-only: nothing here is ever mutated.
 *
 * @param {Node} root
 * @returns {Text[]}
 */
const collectTextNodes = (root) => {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (node.parentNode && SKIP_PARENT_TAGS.has(node.parentNode.nodeName)) {
                return NodeFilter.FILTER_REJECT;
            }
            return node.textContent.trim() === '' ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
        },
    });
    let current = walker.nextNode();
    while (current) {
        nodes.push(current);
        current = walker.nextNode();
    }
    return nodes;
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
    const ranges = collectTextNodes(editor.getBody()).flatMap(
        (node) => detectTokens(node.textContent).map((token) => {
            const range = doc.createRange();
            range.setStart(node, token.start);
            range.setEnd(node, token.end);
            return range;
        })
    );

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
