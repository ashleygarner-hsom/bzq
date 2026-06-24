/**
 * Retrieves and manages sequence configuration data.
 * Coordinates generation and auto-incrementing of alphanumeric sequence IDs.
 */
class SequenceManager {
  /**
   * Reference to the configuration properties spreadsheet.
   * Opened using the workbook ID stored in AppUtilitiesGlobalProperties.
   * @type {SpreadsheetApp.Spreadsheet}
   * @private
   */
  static get spreadsheet_(){
    return SpreadsheetApp.openById(AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_);
  }
  
  /**
   * Reference to the sheet containing sequence configuration data.
   * Retrieved from the configuration workbook by name.
   * @type {SpreadsheetApp.Sheet}
   * @private
   */
  static get sequenceSheet_() {
    return this.spreadsheet_.getSheetByName(AppUtilitiesGlobalProperties.sequenceConfigurationSheetName_);
  }

  /**
   * Gets the index of the row matching the datasheet name in the sequence configuration sheet.
   * Used to locate where a specific sheet's sequence is stored.
   * @param {Array<Array<*>>} data - The 2D array of sheet values to search through.
   * @param {string} name - Plural datasheet name/object name to locate.
   * @param {number} colIndex - The 0-based column index representing the "Datasheet Name" column.
   * @returns {number} The matching 0-based row index, or -1 if not found.
   * @private
   */
  static getSequenceRowIndex_(data, name, colIndex) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIndex]).trim() === name) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Gets and validates column indices from sequence configuration headers.
   * Ensures necessary column fields exist in the header row.
   * @param {string[]} headers - The array of headers from the first row of the sequence sheet.
   * @returns {{ ds: number, prefix: number, val: number }} Column indices for Datasheet Name (ds), Sequence Prefix (prefix), and Current Value (val).
   * @throws {Error} If any required column is missing.
   * @private
   */
  static getRequiredColIndices_(headers) {
    const indices = {
      ds: headers.indexOf("Datasheet Name"),
      prefix: headers.indexOf("Sequence Prefix"),
      val: headers.indexOf("Current Value")
    };
    if (indices.ds === -1 || indices.prefix === -1 || indices.val === -1) {
      throw new Error("Missing required columns in Sequence Configuration sheet.");
    }
    return indices;
  }
  
  /**
   * For the provided datasheet name, retrieves the next sequence value to use and increments the record for the next value.
   * Uses dynamic header mapping to locate columns.
   * @param {string} dataSheetName - The plural of the business object which is also used as the sheet name.
   * @returns {string | null} The next value in the sequence to use (e.g. "PR-100"), or null if processing failed.
   * @throws {Error} If sequence configuration is empty or target datasheet name configuration row cannot be found.
   */
  static processSequenceForObject(dataSheetName) {
    if (!dataSheetName) return null;
    const sheet = this.sequenceSheet_;
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) throw new Error("Sequence configuration sheet is empty.");
    
    const cols = this.getRequiredColIndices_(data[0].map(h => String(h).trim()));
    const rowIndex = this.getSequenceRowIndex_(data, dataSheetName, cols.ds);
    if (rowIndex === -1) {
      const errorMsg = `Sequence configuration row not found for datasheet name '${dataSheetName}'.`;
      LoggingManager.LogError_(errorMsg);
      throw new Error(errorMsg);
    }
    
    const prefix = data[rowIndex][cols.prefix];
    const currentValue = Number(data[rowIndex][cols.val]);
    if (isNaN(currentValue)) throw new Error(`Invalid non-numeric Current Value for '${dataSheetName}'.`);
    
    sheet.getRange(rowIndex + 1, cols.val + 1).setValue(currentValue + 1);
    return `${prefix}${currentValue}`;
  }
}