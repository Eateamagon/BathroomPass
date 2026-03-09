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
const SCHOOL_NAME = 'Riverside Middle School';

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
//  SHEET NAME CONSTANTS  ← Must match your tab names exactly
// ============================================================

const TAB_STUDENTS = 'Students';
const TAB_ACTIVE   = 'Active Passes';
const TAB_LOG      = 'Pass Log';


// ============================================================
//  INTERNAL HELPERS
// ============================================================

/**
 * Returns a Sheet object by tab name.
 * The script must be "bound" to the spreadsheet (opened via
 * Extensions → Apps Script inside the Sheet).
 *
 * @param {string} tabName
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function _getSheet(tabName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!sheet) {
    throw new Error(
      'Could not find a tab named "' + tabName + '". ' +
      'Please check your Google Sheet tab names match the constants in Code.gs.'
    );
  }
  return sheet;
}

/**
 * Formats a JavaScript Date to a readable 12-hour time string.
 * Example output: "Mar 9, 2026 2:35 PM"
 *
 * @param {Date} date
 * @returns {string}
 */
function _formatTime(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'MMM d, yyyy h:mm a'
  );
}


// ============================================================
//  ENTRY POINT: Serve the Web App
// ============================================================

/**
 * Called automatically when someone visits the deployed web-app URL.
 * Renders Index.html and passes the school name as a template variable.
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.schoolName = SCHOOL_NAME;          // injected into <?= schoolName ?>

  return template.evaluate()
    .setTitle('Digital Hall Pass — ' + SCHOOL_NAME)
    // ALLOWALL lets the page be displayed inside an iframe (e.g. Chromebook kiosk tab).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}


// ============================================================
//  STUDENT SEARCH
// ============================================================

/**
 * Searches the Students tab by partial name OR partial student ID.
 * Called from the frontend as the student types in the search box.
 *
 * @param {string} query  - Text the student has typed (min 2 chars).
 * @returns {Array<{id: string, name: string, grade: string|number}>}
 *          Up to 10 matching students (empty array if no match).
 */
function searchStudents(query) {
  // Reject searches that are too short to be meaningful.
  if (!query || query.trim().length < 2) return [];

  const sheet = _getSheet(TAB_STUDENTS);
  const rows  = sheet.getDataRange().getValues(); // includes header row
  const term  = query.trim().toLowerCase();
  const found = [];

  // Row 0 is the header, so we start at index 1.
  for (let i = 1; i < rows.length; i++) {
    const rowId   = String(rows[i][0]).toLowerCase(); // Column A: Student ID
    const rowName = String(rows[i][1]).toLowerCase(); // Column B: Name

    if (rowId.includes(term) || rowName.includes(term)) {
      found.push({
        id:    rows[i][0],   // Return original (not lowercased) values
        name:  rows[i][1],
        grade: rows[i][2]    // Column C: Grade Level
      });
    }

    if (found.length >= 10) break; // Cap results to keep the list tidy
  }

  return found;
}


// ============================================================
//  CAPACITY & VALIDATION CHECKS
// ============================================================

/**
 * Counts how many students from a specific grade are currently
 * listed in the "Active Passes" tab.
 *
 * @param {string|number} grade
 * @returns {number}
 */
function _getActiveCountForGrade(grade) {
  const sheet = _getSheet(TAB_ACTIVE);
  const rows  = sheet.getDataRange().getValues();
  let   count = 0;

  for (let i = 1; i < rows.length; i++) {
    // Column C (index 2) holds the grade level.
    if (String(rows[i][2]) === String(grade)) count++;
  }
  return count;
}

/**
 * Returns true if the student already has an open (unreturned) pass.
 *
 * @param {string|number} studentId
 * @returns {boolean}
 */
function _hasActivePass(studentId) {
  const sheet = _getSheet(TAB_ACTIVE);
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    // Column B (index 1) holds the student ID.
    if (String(rows[i][1]) === String(studentId)) return true;
  }
  return false;
}


// ── DAILY LIMIT CHECK (DISABLED) ─────────────────────────────
/**
 * Checks whether a student has hit their daily pass limit.
 *
 * HOW TO ENABLE:
 *   1. Uncomment the two constant lines near the top of the file
 *      (DAILY_LIMIT_ENABLED and DAILY_LIMIT_MAX).
 *   2. Uncomment the checkDailyLimit() call inside issuePass().
 *
 * @param {string|number} studentId
 * @returns {{ allowed: boolean, tripsToday: number }}
 */
// function checkDailyLimit(studentId) {
//   if (!DAILY_LIMIT_ENABLED) return { allowed: true, tripsToday: 0 };
//
//   const sheet      = _getSheet(TAB_LOG);
//   const rows       = sheet.getDataRange().getValues();
//   const tz         = Session.getScriptTimeZone();
//   const todayStr   = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
//   let   tripsToday = 0;
//
//   for (let i = 1; i < rows.length; i++) {
//     const rowId   = String(rows[i][1]);   // Column B: Student ID
//     const timeOut = rows[i][4];            // Column E: Time Out
//
//     if (rowId === String(studentId) && timeOut instanceof Date) {
//       const rowDate = Utilities.formatDate(timeOut, tz, 'yyyy-MM-dd');
//       if (rowDate === todayStr) tripsToday++;
//     }
//   }
//
//   return {
//     allowed:    tripsToday < DAILY_LIMIT_MAX,
//     tripsToday: tripsToday
//   };
// }
// ─────────────────────────────────────────────────────────────


// ============================================================
//  ISSUE A HALL PASS
// ============================================================

/**
 * Validates all school rules, then (if approved) writes a new
 * row to "Active Passes" and returns the server timestamp to the
 * client so its live timer stays in sync.
 *
 * Validation order:
 *   1. Student doesn't already have an open pass.
 *   2. Grade-level hallway capacity is not exceeded.
 *   3. (Disabled) Daily pass limit not exceeded.
 *
 * @param {{ id: string, name: string, grade: string|number }} student
 * @param {string} destination  'Bathroom' | 'Nurse' | 'Office'
 * @returns {{ success: boolean, message: string, timeOut?: string }}
 *          timeOut is an ISO-8601 string used by the client timer.
 */
function issuePass(student, destination) {

  // ── Check 1: Prevent issuing a second pass to the same student ──
  if (_hasActivePass(student.id)) {
    return {
      success: false,
      message: student.name + ' already has an active pass. Please return to class first.'
    };
  }

  // ── Check 2: Grade-level hallway capacity ──────────────────────
  const gradeCount = _getActiveCountForGrade(student.grade);
  if (gradeCount >= MAX_PER_GRADE) {
    return {
      success: false,
      message:
        'The hallways are at capacity for Grade ' + student.grade + '. ' +
        'Please wait for a classmate to return before leaving.'
    };
  }

  // ── Check 3: Daily limit (DISABLED — uncomment to enable) ──────
  // const limitCheck = checkDailyLimit(student.id);
  // if (!limitCheck.allowed) {
  //   return {
  //     success: false,
  //     message:
  //       'You have used all ' + DAILY_LIMIT_MAX + ' of your hall passes for today. ' +
  //       'Please see your teacher.'
  //   };
  // }

  // ── All checks passed — write the active pass record ───────────
  const timeOut = new Date();
  _getSheet(TAB_ACTIVE).appendRow([
    student.name,    // Column A
    student.id,      // Column B
    student.grade,   // Column C
    destination,     // Column D
    timeOut          // Column E  (stored as a Date; Google Sheets formats it automatically)
  ]);

  Logger.log('PASS ISSUED | %s (ID: %s, Grade: %s) → %s | Out: %s',
    student.name, student.id, student.grade, destination, _formatTime(timeOut));

  return {
    success: true,
    message: 'Pass issued!',
    timeOut: timeOut.toISOString()  // Client uses this to start its live countdown timer
  };
}


// ============================================================
//  RETURN STUDENT TO CLASS
// ============================================================

/**
 * Finds the student's row in "Active Passes", calculates how long
 * they were out, appends a complete record to "Pass Log", then
 * deletes the row from "Active Passes".
 *
 * @param {string|number} studentId
 * @returns {{ success: boolean, message: string, duration?: string }}
 *          duration is a formatted string like "4.72 minutes".
 */
function returnStudent(studentId) {
  const activeSheet = _getSheet(TAB_ACTIVE);
  const logSheet    = _getSheet(TAB_LOG);
  const rows        = activeSheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    // Column B (index 1) = Student ID
    if (String(rows[i][1]) !== String(studentId)) continue;

    // ── Found the student's active pass ───────────────────────────
    const name        = rows[i][0];            // Column A
    const id          = rows[i][1];            // Column B
    const grade       = rows[i][2];            // Column C
    const destination = rows[i][3];            // Column D
    const timeOut     = new Date(rows[i][4]);  // Column E (convert back to Date)
    const timeIn      = new Date();            // Right now

    // Calculate elapsed time in minutes, rounded to 2 decimal places.
    const durationMs  = timeIn - timeOut;
    const durationMin = Math.round((durationMs / 60000) * 100) / 100;

    // ── Write the completed trip to Pass Log ───────────────────────
    // Columns: Name | Student ID | Grade | Destination | Time Out | Time In | Duration (min)
    logSheet.appendRow([name, id, grade, destination, timeOut, timeIn, durationMin]);

    // ── Remove from Active Passes ──────────────────────────────────
    // Sheet row numbers are 1-based; array index i already skips the
    // header, so the sheet row = i + 1.
    activeSheet.deleteRow(i + 1);

    Logger.log('RETURNED | %s | Away: %s min | Destination: %s',
      name, durationMin, destination);

    return {
      success:  true,
      message:  name + ' has returned to class.',
      duration: durationMin.toFixed(2) + ' minutes'
    };
  }

  // Student wasn't found in Active Passes.
  return {
    success: false,
    message: 'No active pass was found for this student.'
  };
}
