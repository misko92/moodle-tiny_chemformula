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
 * Tiny chemformula plugin: a lightweight authoring aid that visually
 * highlights recognised chemistry tokens while editing. It has no
 * toolbar button or menu item, and never converts or mutates the
 * editor's content - the actual conversion to <sub>/<sup> HTML happens
 * only at display time, in filter_chemformula.
 *
 * @module      tiny_chemformula/plugin
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {getTinyMCE} from 'editor_tiny/loader';
import {getPluginMetadata} from 'editor_tiny/utils';

import {component, pluginName} from './common';
import {registerHighlighting} from './highlighter';

// eslint-disable-next-line no-async-promise-executor
export default new Promise(async(resolve) => {
    const [tinyMCE, pluginMetadata] = await Promise.all([
        getTinyMCE(),
        getPluginMetadata(component, pluginName),
    ]);

    tinyMCE.PluginManager.add(pluginName, (editor) => {
        registerHighlighting(editor);

        return pluginMetadata;
    });

    resolve(pluginName);
});
