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
 * Unit tests for the pure tiny_chemformula token detector.
 *
 * NOTE: as with the old tiny_chemformula plugin this replaces, this
 * checkout does not have a jest runtime wired up (no `jest`
 * devDependency, no `grunt jest` task). These tests follow Moodle's
 * documented `tests/jest/*.test.js` convention so they are ready to run
 * as soon as that infrastructure is added.
 *
 * @module      tiny_chemformula/tests/jest/formatter_test
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {detectTokens} from '../../amd/src/formatter';

describe('tiny_chemformula formatter', () => {

    describe('simple formulas', () => {
        it('detects a subscript after an element for a simple molecule', () => {
            expect(detectTokens('H2O')).toEqual([
                {start: 0, end: 3, text: 'H2O', preview: 'H₂O'},
            ]);
        });

        it('detects subscripts for a two-element compound', () => {
            expect(detectTokens('CO2')).toEqual([
                {start: 0, end: 3, text: 'CO2', preview: 'CO₂'},
            ]);
        });

        it('includes a leading stoichiometric coefficient in the token span', () => {
            // The coefficient itself never renders differently, but it is
            // part of what the author typed as a single word, so the
            // highlighted span covers the whole thing.
            const tokens = detectTokens('2H2O');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('2H2O');
            expect(tokens[0].preview).toBe('2H₂O');
        });
    });

    describe('complex formulas with groups', () => {
        it('detects a bracketed group with a trailing count', () => {
            expect(detectTokens('Fe2(SO4)3')).toEqual([
                {start: 0, end: 9, text: 'Fe2(SO4)3', preview: 'Fe₂(SO₄)₃'},
            ]);
        });

        it('detects square-bracket groups', () => {
            const tokens = detectTokens('K4[Fe(CN)6]');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].preview).toBe('K₄[Fe(CN)₆]');
        });
    });

    describe('ionic charges', () => {
        it('detects a digit+sign charge', () => {
            expect(detectTokens('Ca2+')).toEqual([
                {start: 0, end: 4, text: 'Ca2+', preview: 'Ca²⁺'},
            ]);
        });

        it('detects a bare sign charge with no digit', () => {
            expect(detectTokens('Na+')[0].preview).toBe('Na⁺');
            expect(detectTokens('Cl-')[0].preview).toBe('Cl⁻');
        });

        it('uses the caret hint to separate a subscript from a charge', () => {
            const tokens = detectTokens('SO4^2-');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('SO4^2-');
            expect(tokens[0].preview).toBe('SO₄²⁻');
        });

        it('recognises a sign-first charge and normalises the preview to magnitude-then-sign', () => {
            // "Mg+2" must be recognised the same as "Mg2+", and both must
            // preview in the conventional magnitude-then-sign order.
            expect(detectTokens('Mg+2')[0].preview).toBe('Mg²⁺');
            expect(detectTokens('Mg2+')[0].preview).toBe('Mg²⁺');
            expect(detectTokens('H3O+1')[0].preview).toBe('H₃O¹⁺');
            expect(detectTokens('SO4^+2')[0].preview).toBe('SO₄²⁺');
        });
    });

    describe('isotopes', () => {
        it('formats Element-Number isotope notation', () => {
            expect(detectTokens('U-238')).toEqual([
                {start: 0, end: 5, text: 'U-238', preview: '²³⁸U'},
            ]);
        });

        it('formats Number-Element isotope notation identically', () => {
            expect(detectTokens('238-U')[0].preview).toBe('²³⁸U');
        });

        it('formats a two-letter element isotope', () => {
            expect(detectTokens('C-14')[0].preview).toBe('¹⁴C');
        });
    });

    describe('full nuclear symbol notation', () => {
        it('detects mass number and atomic number together', () => {
            expect(detectTokens('238/92U')).toEqual([
                {start: 0, end: 7, text: '238/92U', preview: '²³⁸₉₂U'},
            ]);
        });

        it('detects a two-letter element with nuclear symbol notation', () => {
            expect(detectTokens('14/6C')[0].preview).toBe('¹⁴₆C');
        });

        it('does not affect ordinary slash-separated text with no uppercase', () => {
            expect(detectTokens('10/25/2024')).toEqual([]);
            expect(detectTokens('and/or')).toEqual([]);
        });
    });

    describe('unknown-element placeholder ("X")', () => {
        it('accepts X in full nuclear symbol notation', () => {
            expect(detectTokens('235/92X')).toEqual([
                {start: 0, end: 7, text: '235/92X', preview: '²³⁵₉₂X'},
            ]);
        });

        it('accepts X in isotope notation, either order', () => {
            expect(detectTokens('X-235')[0].preview).toBe('²³⁵X');
            expect(detectTokens('235-X')[0].preview).toBe('²³⁵X');
        });
    });

    describe('unknown-number placeholder ("?")', () => {
        it('accepts ? for either or both numbers in nuclear symbol notation', () => {
            expect(detectTokens('?/92U')[0].preview).toBe('?₉₂U');
            expect(detectTokens('235/?U')[0].preview).toBe('²³⁵?U');
            expect(detectTokens('?/?U')[0].preview).toBe('??U');
        });

        it('combines with the X unknown-element placeholder', () => {
            expect(detectTokens('?/?X')[0].preview).toBe('??X');
        });

        it('accepts ? as an unknown mass number in isotope notation, either order', () => {
            expect(detectTokens('U-?')[0].preview).toBe('?U');
            expect(detectTokens('?-U')[0].preview).toBe('?U');
        });

        it('does not let a stray ? glued onto a formula block detection', () => {
            // "?" only means something inside isotope/nuclear-symbol
            // notation - elsewhere (e.g. ending a sentence with no space)
            // it is just punctuation, and the chemistry underneath must
            // still be detected.
            const tokens = detectTokens('H2O?');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('H2O?');
            expect(tokens[0].preview).toBe('H₂O');
        });
    });

    describe('state labels and fully-resolved-but-unstyled formulas', () => {
        it('does not surface a formula that would render identically to its own text', () => {
            // "NaCl(aq)" is recognised chemistry, but the filter would
            // render it completely unstyled, so there is nothing useful
            // to highlight for the author.
            expect(detectTokens('NaCl(aq)')).toEqual([]);
        });

        it('still surfaces the subscript inside a state-labelled formula', () => {
            const tokens = detectTokens('H2O(l)');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('H2O(l)');
            expect(tokens[0].preview).toBe('H₂O(l)');
        });
    });

    describe('reaction arrows', () => {
        it('detects a simple arrow', () => {
            expect(detectTokens('H2 -> H2O')).toContainEqual(
                {start: 3, end: 5, text: '->', preview: '→'}
            );
        });

        it('detects a long-form arrow the same way as a short one', () => {
            expect(detectTokens('H2 --> H2O').find((t) => t.text === '-->').preview).toBe('→');
        });

        it('detects equilibrium arrows', () => {
            expect(detectTokens('A <=> B').find((t) => t.text === '<=>').preview).toBe('⇌');
            expect(detectTokens('A <-> B').find((t) => t.text === '<->').preview).toBe('⇌');
        });

        it('detects every recognised token in a full equation, in order', () => {
            const tokens = detectTokens('H2 + O2 -> H2O');
            expect(tokens.map((t) => t.text)).toEqual(['H2', 'O2', '->', 'H2O']);
            expect(tokens.map((t) => t.preview)).toEqual(['H₂', 'O₂', '→', 'H₂O']);
        });
    });

    describe('false positives are left undetected', () => {
        it('does not flag a capitalised word followed by an unrelated number', () => {
            expect(detectTokens('In 2024')).toEqual([]);
        });

        it('does not treat a bare single element symbol as a formula', () => {
            expect(detectTokens('In')).toEqual([]);
            expect(detectTokens('As')).toEqual([]);
            expect(detectTokens('At')).toEqual([]);
        });

        it('does not match an ordinary acronym that happens to be two element symbols', () => {
            expect(detectTokens('US')).toEqual([]);
        });

        it('does not partially match a word containing non-element letters', () => {
            expect(detectTokens('COVID19')).toEqual([]);
            expect(detectTokens('NASA')).toEqual([]);
        });

        it('finds only the real formulas in a sentence of ordinary prose', () => {
            const tokens = detectTokens('A quick note about H2O and CO2 levels.');
            expect(tokens.map((t) => t.text)).toEqual(['H2O', 'CO2']);
        });

        it('returns an empty array for empty input', () => {
            expect(detectTokens('')).toEqual([]);
        });
    });
});
