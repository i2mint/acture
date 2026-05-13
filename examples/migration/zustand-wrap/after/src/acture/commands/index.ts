/**
 * Command barrel. Each import below is a side-effect register that
 * adds one command to the shared registry at module load.
 *
 *   Wrapped (still call legacy store actions via wrapMutation):
 *     - app.note.add
 *     - app.note.toggleDone
 *     - app.note.remove
 *     - app.note.setDueDate
 *     - app.settings.setTheme
 *     - app.settings.setFontSize
 *
 *   Graduated (legacy store action removed; body lives in execute):
 *     - app.note.setBody
 *     - app.note.archiveDone
 */

import './notes/addNote.js';
import './notes/toggleDone.js';
import './notes/removeNote.js';
import './notes/setDueDate.js';
import './notes/setBody.js';        // graduated
import './notes/archiveDone.js';    // graduated
import './settings/setTheme.js';
import './settings/setFontSize.js';
