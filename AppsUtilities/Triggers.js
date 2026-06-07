/**
 * Simple trigger that runs when a user edits a cell in a spreadsheet.
 * Coordinates validation and other edit events.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function onEdit(e) {
  RecordManager.processRecordEdit(e);
}
