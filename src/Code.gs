/**
 * ============================================================
 *  DIGITAL HALL PASS SYSTEM — Code.gs
 *  Google Apps Script Backend
 * ============================================================
 *
 *  REQUIRED GOOGLE SHEET TABS (create these exactly):
 *  ┌────────────────┬────────────────────────────────────────────────────────┐
 *  │ Tab Name       │ Column Layout (left → right, Row 1 = headers)          │
 *  ├────────────────┼────────────────────────────────────────────────────────┤
 *  │ Students       │ A: Student ID  │ B: Name  │ C: Grade Level             │
 *  │ Active Passes  │ A: Name │ B: Student ID │ C: Grade │ D: Destination    │
 *  │                │ E: Time Out                                             │
 *  │ Pass Log       │ A: Name │ B: Student ID │ C: Grade │ D: Destination    │
 *  │                │ E: Time Out │ F: Time In │ G: Duration (min)           │
 *  │ Stats          │ (formula-driven — see setup instructions)               │
 *  └────────────────┴────────────────────────────────────────────────────────┘
 *
 *  HOW IT WORKS:
 *  1. Student searches their name/ID on the kiosk.
 *  2. They pick a destination (Bathroom, Nurse, Office).
 *  3. issuePass() validates capacity then writes to "Active Passes".
 *  4. The kiosk shows a live timer.
 *  5. When they tap "Return", returnStudent() moves the row to "Pass Log"
 *     and calculates the total time away.
 */


// ============================================================
//  CONFIGURATION  ← Edit these values for your school
// ============================================================

/** Maximum number of students from ONE grade who can be out at the same time. */
const MAX_PER_GRADE = 3;

/** Your school's name — shown in the kiosk header. */
const SCHOOL_NAME = 'Kate Collins Middle School';

/**
 * ── DAILY LIMIT FEATURE (CURRENTLY DISABLED) ────────────────
 *
 * This feature lets you cap how many passes a single student
 * can request per day.  To turn it on later:
 *   1. Set  DAILY_LIMIT_ENABLED = true
 *   2. Set  DAILY_LIMIT_MAX     = your preferred number (e.g. 2)
 *   3. In issuePass(), find the commented block and uncomment it.
 *
 * const DAILY_LIMIT_ENABLED = false;
 * const DAILY_LIMIT_MAX     = 2;
 */


// ============================================================
//  SHEET NAME CONSTANTS
// ============================================================

const TAB_STUDENTS = 'Students';
const TAB_ACTIVE   = 'Active Passes';
const TAB_LOG      = 'Pass Log';


// ============================================================
//  DHB: INTERNAL DATA HELPER (Minimized API Calls)
// ============================================================

/**
 * DB helper object to centralize and cache sheet access.
 * Reduces redundant calls to SpreadsheetApp.getActiveSpreadsheet().
 */
const DB = {
  _ss: null,
  _sheets: {},

  get ss() {
    if (!this._ss) this._ss = SpreadsheetApp.getActiveSpreadsheet();
    return this._ss;
  },

  getSheet(name) {
    if (!this._sheets[name]) {
      this._sheets[name] = this.ss.getSheetByName(name);
      if (!this._sheets[name]) {
        throw new Error(`Sheet tab "${name}" not found. Verify your Google Sheet setup.`);
      }
    }
    return this._sheets[name];
  },

  /**
   * Fetches all data for a tab, including headers.
   * Caches the values for the duration of one request.
   */
  _values: {},
  getValues(name) {
    if (!this._values[name]) {
      this._values[name] = this.getSheet(name).getDataRange().getValues();
    }
    return this._values[name];
  },

  /**
   * Force refresh values from the sheet (useful after appendRow/deleteRow)
   */
  refresh(name) {
    delete this._values[name];
  }
};


/**
 * Formats a Date to a readable string based on script timezone.
 */
function _formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
}


// ============================================================
//  ENTRY POINT: Serve the Web App
// ============================================================

/**
 * Serve the single-page application.
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.schoolName = SCHOOL_NAME;

  return template.evaluate()
    .setTitle(`Digital Hall Pass — ${SCHOOL_NAME}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}


// ============================================================
//  STUDENT SEARCH
// ============================================================

/**
 * Searches students by name or ID (Column A or B).
 * Returns up to 10 results.
 */
function searchStudents(query) {
  const term = query?.trim().toLowerCase();
  if (!term || term.length < 2) return [];

  const rows = DB.getValues(TAB_STUDENTS);
  const found = [];

  // Skip header (i=1)
  for (let i = 1; i < rows.length; i++) {
    const [id, name, grade] = rows[i];
    if (String(id).toLowerCase().includes(term) || String(name).toLowerCase().includes(term)) {
      found.push({ id, name, grade });
    }
    if (found.length >= 10) break;
  }

  return found;
}


// ============================================================
//  HALL PASS OPERATIONS
// ============================================================

/**
 * Main action to start a pass. Validates rules before writing.
 */
function issuePass(student, destination) {
  try {
    const activeRows = DB.getValues(TAB_ACTIVE);
    let gradeCount = 0;

    // Single pass to check BOTH current status and grade capacity
    for (let i = 1; i < activeRows.length; i++) {
      // Column B: Student ID
      if (String(activeRows[i][1]) === String(student.id)) {
        return { success: false, message: `${student.name} already has an active pass.` };
      }
      // Column C: Grade
      if (String(activeRows[i][2]) === String(student.grade)) {
        gradeCount++;
      }
    }

    if (gradeCount >= MAX_PER_GRADE) {
      return {
        success: false,
        message: `Grade ${student.grade} capacity reached. Please wait for a classmate.`
      };
    }

    // Daily limit check (Optional logic could go here)

    const timeOut = new Date();
    DB.getSheet(TAB_ACTIVE).appendRow([
      student.name,
      student.id,
      student.grade,
      destination,
      timeOut
    ]);

    Logger.log(`ISSUE | ${student.name} (${student.id}) -> ${destination}`);

    return {
      success: true,
      message: 'Pass issued!',
      timeOut: timeOut.toISOString()
    };
  } catch (err) {
    Logger.log(`ERROR issuePass: ${err.message}`);
    return { success: false, message: 'Server error. Please notify a teacher.' };
  }
}

/**
 * Returns a student: calculates duration, logs it, and removes active row.
 */
function returnStudent(studentId) {
  try {
    const sheet = DB.getSheet(TAB_ACTIVE);
    const rows  = DB.getValues(TAB_ACTIVE);

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) !== String(studentId)) continue;

      const [name, id, grade, destination, rawTimeOut] = rows[i];
      const timeIn = new Date();
      const timeOut = new Date(rawTimeOut);
      const durationMin = Math.round(((timeIn - timeOut) / 60000) * 100) / 100;

      // Log completion
      DB.getSheet(TAB_LOG).appendRow([name, id, grade, destination, timeOut, timeIn, durationMin]);

      // Remove from active
      sheet.deleteRow(i + 1);

      Logger.log(`RETURN | ${name} | ${durationMin} min`);

      return {
        success: true,
        message: `${name} returned.`,
        duration: `${durationMin.toFixed(2)} minutes`
      };
    }

    return { success: false, message: 'No active pass found for this ID.' };
  } catch (err) {
    Logger.log(`ERROR returnStudent: ${err.message}`);
    return { success: false, message: 'Server error tracking return.' };
  }
}

