/**
 * Contains tools for capturing cell format styles and dynamically applying them to rows (header and records) in datasheets.
 */
class FormatManager {
  /**
   * Formats a row in a datasheet using the stored header or record formatting.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index to format
   * @param {Object} objConfig - The datasheet object configuration
   */
  static formatRow(sheet, row, objConfig) {
    if (!sheet || !objConfig) return;
    
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    if (row < headerNumber) return; // Ignore rows above the header
    
    let formatKey = null;
    if (row === headerNumber) {
      formatKey = "HEADER_FORMAT";
    } else if (row > headerNumber) {
      formatKey = "RECORD_FORMAT";
    }
    
    if (!formatKey) return;
    
    let formatObj = null;
    try {
      const formatStr = ConfigurationManager.getConfigValue(formatKey);
      if (formatStr) {
        formatObj = JSON.parse(formatStr);
      }
    } catch (e) {
      LoggingManager.LogError_(`Failed to parse formatting for ${formatKey}: ` + e.message);
      return;
    }
    
    if (!formatObj) return;
    
    const lastCol = sheet.getLastColumn() || 1;
    const range = sheet.getRange(row, 1, 1, lastCol);
    
    this.applyFormatToRange_(range, formatObj);
  }
  
  /**
   * Captures format from the active cell and saves it as HEADER_FORMAT in the configurations.
   * @param {SpreadsheetApp.Range} range - The source cell/range
   */
  static saveHeaderFormat(range) {
    const format = this.getCellFormat_(range);
    ConfigurationManager.setConfigValue("HEADER_FORMAT", JSON.stringify(format));
  }

  /**
   * Captures format from the active cell and saves it as RECORD_FORMAT in the configurations.
   * @param {SpreadsheetApp.Range} range - The source cell/range
   */
  static saveRecordFormat(range) {
    const format = this.getCellFormat_(range);
    ConfigurationManager.setConfigValue("RECORD_FORMAT", JSON.stringify(format));
  }

  /**
   * Captures formatting from the top-left cell of a range.
   * @param {SpreadsheetApp.Range} range - Range to capture from
   * @returns {Object} Format properties
   * @private
   */
  static getCellFormat_(range) {
    const cell = range.getCell(1, 1);
    return {
      background: cell.getBackground(),
      fontColor: cell.getFontColor(),
      fontFamily: cell.getFontFamily(),
      fontSize: cell.getFontSize(),
      fontWeight: cell.getFontWeight(),
      fontStyle: cell.getFontStyle(),
      fontLine: cell.getFontLine(),
      horizontalAlignment: cell.getHorizontalAlignment(),
      verticalAlignment: cell.getVerticalAlignment()
    };
  }
  
  /**
   * Applies formatting options to a spreadsheet range.
   * @param {SpreadsheetApp.Range} range - The spreadsheet range to format
   * @param {Object} formatObj - The formatting properties object
   * @private
   */
  static applyFormatToRange_(range, formatObj) {
    if (formatObj.background !== undefined) range.setBackground(formatObj.background);
    if (formatObj.fontColor !== undefined) range.setFontColor(formatObj.fontColor);
    if (formatObj.fontFamily !== undefined) range.setFontFamily(formatObj.fontFamily);
    if (formatObj.fontSize !== undefined) range.setFontSize(formatObj.fontSize);
    if (formatObj.fontWeight !== undefined) range.setFontWeight(formatObj.fontWeight);
    if (formatObj.fontStyle !== undefined) range.setFontStyle(formatObj.fontStyle);
    if (formatObj.fontLine !== undefined) range.setFontLine(formatObj.fontLine);
    if (formatObj.horizontalAlignment !== undefined) range.setHorizontalAlignment(formatObj.horizontalAlignment);
    if (formatObj.verticalAlignment !== undefined) range.setVerticalAlignment(formatObj.verticalAlignment);
  }
}
