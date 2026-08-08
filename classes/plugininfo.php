<?php
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

namespace tiny_chemformula;

use editor_tiny\plugin;

/**
 * Tiny chemformula plugin.
 *
 * A lightweight authoring aid that visually highlights recognised
 * chemistry tokens while editing. It has no toolbar button or menu item
 * of its own, so it does not implement plugin_with_buttons or
 * plugin_with_menuitems - it only needs to be loaded so its AMD module
 * can register its (purely visual, non-mutating) editor event handlers.
 *
 * @package    tiny_chemformula
 * @copyright  2026 Moodle
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class plugininfo extends plugin {
}
