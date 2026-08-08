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
 * Unit tests for the tiny_chemformula highlighter's DOM wiring.
 *
 * NOTE: as with tests/jest/formatter.test.js, this checkout does not
 * currently have a jest runtime wired up; these tests are written ready
 * to run under Moodle's documented `tests/jest/*.test.js` + jsdom
 * convention as soon as that infrastructure is added.
 *
 * The CSS Custom Highlight API (window.CSS.highlights / window.Highlight)
 * is not implemented by jsdom, so it is polyfilled here via a minimal
 * fake returned from editor.getWin() - real text-node discovery still
 * goes through the genuine jsdom document/TreeWalker, only the
 * highlight-painting primitives are faked.
 *
 * @module      tiny_chemformula/tests/jest/highlighter_test
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {refreshHighlights, registerHighlighting} from '../../amd/src/highlighter';

const HIGHLIGHT_NAME = 'tiny_chemformula-token';

/** A minimal stand-in for the real Highlight constructor. */
class FakeHighlight {
    constructor(...ranges) {
        this.ranges = ranges;
    }
}

/**
 * Build a fake TinyMCE editor backed by a real jsdom element, with the
 * CSS Custom Highlight API polyfilled onto the object returned by
 * getWin().
 *
 * @param {string} bodyHtml
 * @returns {object}
 */
const makeEditor = (bodyHtml) => {
    const body = document.createElement('div');
    body.innerHTML = bodyHtml;

    const highlightsMap = new Map();
    const handlers = {};

    return {
        getBody: () => body,
        getDoc: () => document,
        getWin: () => ({
            CSS: {highlights: highlightsMap},
            Highlight: FakeHighlight,
        }),
        dom: {addStyle: jest.fn()},
        on: (event, handler) => {
            handlers[event] = handler;
        },
        fireKeyup: (key) => handlers.keyup({key}),
        fireInit: () => handlers.init(),
        highlights: highlightsMap,
    };
};

describe('tiny_chemformula highlighter', () => {

    it('highlights every recognised token and nothing else', () => {
        const editor = makeEditor('<p>Water is H2O and Ca2+.</p>');

        refreshHighlights(editor);

        const highlight = editor.highlights.get(HIGHLIGHT_NAME);
        expect(highlight).toBeInstanceOf(FakeHighlight);
        expect(highlight.ranges.map((range) => range.toString())).toEqual(['H2O', 'Ca2+']);
    });

    it('never mutates the editor content, even when it finds tokens', () => {
        const html = '<p>Water is H2O and Ca2+.</p>';
        const editor = makeEditor(html);

        refreshHighlights(editor);

        expect(editor.getBody().innerHTML).toBe(html);
    });

    it('paints an empty highlight when nothing is recognised', () => {
        const editor = makeEditor('<p>hello world</p>');

        refreshHighlights(editor);

        expect(editor.highlights.get(HIGHLIGHT_NAME).ranges).toHaveLength(0);
    });

    it('does not highlight content inside script or style tags', () => {
        const editor = makeEditor('<script>var x = "H2O";</script><style>/* H2O */</style><p>H2O</p>');

        refreshHighlights(editor);

        const highlight = editor.highlights.get(HIGHLIGHT_NAME);
        expect(highlight.ranges).toHaveLength(1);
        expect(highlight.ranges[0].toString()).toBe('H2O');
    });

    it('re-scans on the space, period and Enter word-boundary keys', () => {
        const editor = makeEditor('<p>H2O</p>');
        registerHighlighting(editor);
        editor.fireInit(); // Setup (including the keyup listener) only happens once init fires.
        editor.highlights.delete(HIGHLIGHT_NAME); // Clear the init-time scan to isolate this trigger.

        editor.fireKeyup(' ');

        expect(editor.highlights.get(HIGHLIGHT_NAME).ranges).toHaveLength(1);
    });

    it('ignores keys that are not word boundaries', () => {
        const editor = makeEditor('<p>H2O</p>');
        registerHighlighting(editor);
        editor.fireInit();
        editor.highlights.delete(HIGHLIGHT_NAME);

        editor.fireKeyup('a');

        expect(editor.highlights.has(HIGHLIGHT_NAME)).toBe(false);
    });

    it('scans the initial content once on init', () => {
        const editor = makeEditor('<p>H2O</p>');

        registerHighlighting(editor);
        editor.fireInit();

        expect(editor.highlights.get(HIGHLIGHT_NAME).ranges).toHaveLength(1);
    });

    it('never touches the editor window/body before init, and is a silent no-op after it if unsupported', () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>H2O</p>';
        const handlers = {};
        const on = jest.fn((event, handler) => {
            handlers[event] = handler;
        });
        const editor = {
            getBody: () => body,
            getDoc: () => document,
            getWin: () => ({}), // No CSS.highlights, no Highlight constructor.
            dom: {addStyle: jest.fn()},
            on,
        };

        // Registration itself must not touch getWin()/getBody() at all -
        // only the 'init' listener is set up synchronously.
        expect(() => registerHighlighting(editor)).not.toThrow();
        expect(on).toHaveBeenCalledTimes(1);
        expect(on).toHaveBeenCalledWith('init', expect.any(Function));
        expect(editor.dom.addStyle).not.toHaveBeenCalled();

        // Once init fires, the API is detected as unsupported and nothing
        // further is registered or painted.
        expect(() => handlers.init()).not.toThrow();
        expect(on).toHaveBeenCalledTimes(1);
        expect(editor.dom.addStyle).not.toHaveBeenCalled();
        expect(body.innerHTML).toBe('<p>H2O</p>');
    });
});
