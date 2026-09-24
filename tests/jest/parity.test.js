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
 * Shared filter/highlighter parity cases.
 *
 * tests/fixtures/parity_cases.json is a copy of filter_chemformula's
 * canonical fixture: {text, html} pairs giving how the filter renders each
 * input. Here the highlighter's view of the same input - each highlighted
 * range replaced by its preview, backtick-literal delimiters dropped - must
 * read the same as that html flattened to unicode, so the JS and PHP
 * detectors can't silently drift apart. Don't edit the copy: change the
 * filter's fixture and copy it over.
 */

import fs from 'fs';
import path from 'path';
import {detectTokens, getLiteralMask} from '../../amd/src/formatter';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'parity_cases.json');
const FILTER_FIXTURE = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..',
    'filter', 'chemformula', 'tests', 'fixtures', 'parity_cases.json');

const SUB = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋'};
const SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻'};

/**
 * Flatten filter_chemformula's html output to the unicode the highlighter
 * previews use.
 *
 * @param {string} html
 * @returns {string}
 */
const flattenFilterHtml = (html) => html
    .replace(/<span class="filter-chemformula-nuclide">|<\/span>/g, '')
    .replace(/<sub>([^<]*)<\/sub>/g, (unused, chars) => [...chars].map((c) => SUB[c] ?? c).join(''))
    .replace(/<sup>([^<]*)<\/sup>/g, (unused, chars) => [...chars].map((c) => SUP[c] ?? c).join(''))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/**
 * The text as the highlighter presents it: every token replaced by its
 * preview, and backtick-literal delimiters (which the filter strips) dropped.
 *
 * @param {string} text
 * @returns {string}
 */
const renderViaHighlighter = (text) => {
    const mask = getLiteralMask(text);
    let result = '';
    let position = 0;
    const keep = (from, to) => [...text.slice(from, to)].filter((c, i) => mask[from + i] !== 'd').join('');
    for (const token of detectTokens(text)) {
        result += keep(position, token.start) + token.preview;
        position = token.end;
    }
    return result + keep(position, text.length);
};

const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

describe('filter/highlighter parity', () => {
    it.each(cases.map((c) => [c.text, c.html]))('%s', (text, html) => {
        expect(renderViaHighlighter(text)).toBe(flattenFilterHtml(html));
    });

    const filterFixtureIt = fs.existsSync(FILTER_FIXTURE) ? it : it.skip;
    filterFixtureIt('uses an identical copy of the filter_chemformula fixture', () => {
        expect(fs.readFileSync(FIXTURE, 'utf8')).toBe(fs.readFileSync(FILTER_FIXTURE, 'utf8'));
    });
});
