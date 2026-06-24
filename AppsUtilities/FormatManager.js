/**
 * Contains tools for capturing cell format styles and dynamically applying them to rows (header and records) in datasheets.
 */
class FormatManager {
  /**
   * Helper to retrieve and parse a saved format configuration.
   * @private
   */
  static getFormatObj_(formatKey) {
    try {
      const formatStr = ConfigurationManager.getConfigValue(formatKey);
      if (formatStr) {
        return JSON.parse(formatStr);
      }
    } catch (e) {
      LoggingManager.LogError_(`Failed to parse formatting for ${formatKey}: ` + e.message);
    }
    return null;
  }

  /**
   * Formats a row in a datasheet using the stored header or record formatting.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet
   * @param {number} row - The row index to format
   * @param {Object} objConfig - The datasheet object configuration
   */
  static formatRow(sheet, row, objConfig) {
    if (!sheet || !objConfig) return;
    
    const headerNumber = Number(objConfig["Header Number"]) || 1;
    if (row < headerNumber) return;
    
    const formatKey = row === headerNumber ? "HEADER_FORMAT" : (row > headerNumber ? "RECORD_FORMAT" : null);
    if (!formatKey) return;
    
    const formatObj = this.getFormatObj_(formatKey);
    if (!formatObj) return;
    
    const lastCol = sheet.getLastColumn() || 1;
    this.applyFormatToRange_(sheet.getRange(row, 1, 1, lastCol), formatObj);
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
      verticalAlignment: cell.getVerticalAlignment(),
      borders: this.getCellBorder_(cell)
    };
  }
  
  /**
   * Applies the stored header format (HEADER_FORMAT) to each cell in the provided range.
   * @param {SpreadsheetApp.Range} range - The spreadsheet range to format
   */
  static applyHeaderFormat(range) {
    const formatStr = ConfigurationManager.getConfigValue("HEADER_FORMAT");
    if (!formatStr) {
      throw new Error("Header format has not been saved yet. Please set the format first.");
    }
    this.applyFormatToRange_(range, JSON.parse(formatStr));
  }

  /**
   * Applies the stored record format (RECORD_FORMAT) to each cell in the provided range.
   * @param {SpreadsheetApp.Range} range - The spreadsheet range to format
   */
  static applyRecordFormat(range) {
    const formatStr = ConfigurationManager.getConfigValue("RECORD_FORMAT");
    if (!formatStr) {
      throw new Error("Record format has not been saved yet. Please set the format first.");
    }
    this.applyFormatToRange_(range, JSON.parse(formatStr));
  }

  /**
   * Applies non-border text and background formatting options to a spreadsheet range.
   * @private
   */
  static applyBasicStyles_(range, formatObj) {
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

  /**
   * Helper to set a specific border side on a range.
   * @private
   */
  static applySideBorder_(range, sideName, hasSide, sideConfig) {
    const top = sideName === 'top' ? hasSide : null;
    const left = sideName === 'left' ? hasSide : null;
    const bottom = sideName === 'bottom' ? hasSide : null;
    const right = sideName === 'right' ? hasSide : null;
    
    let color = null;
    let style = null;
    if (hasSide && sideConfig) {
      color = sideConfig.color || null;
      if (sideConfig.style) {
        style = SpreadsheetApp.BorderStyle[sideConfig.style.toUpperCase()] || null;
      }
    }
    range.setBorder(top, left, bottom, right, null, null, color, style);
  }

  /**
   * Orchestrates the border rendering process.
   * @private
   */
  static applyBorders_(range, borders) {
    this.applySideBorder_(range, 'top', !!borders.top, borders.top);
    this.applySideBorder_(range, 'bottom', !!borders.bottom, borders.bottom);
    this.applySideBorder_(range, 'left', !!borders.left, borders.left);
    this.applySideBorder_(range, 'right', !!borders.right, borders.right);
    
    const hasVertical = !!borders.left || !!borders.right;
    const verticalConfig = borders.left || borders.right;
    let color = null;
    let style = null;
    if (hasVertical && verticalConfig) {
      color = verticalConfig.color || null;
      if (verticalConfig.style) {
        style = SpreadsheetApp.BorderStyle[verticalConfig.style.toUpperCase()] || null;
      }
    }
    range.setBorder(null, null, null, null, hasVertical, null, color, style);
  }

  /**
   * Applies formatting options to a spreadsheet range.
   * @param {SpreadsheetApp.Range} range - The spreadsheet range to format
   * @param {Object} formatObj - The formatting properties object
   * @private
   */
  static applyFormatToRange_(range, formatObj) {
    this.applyBasicStyles_(range, formatObj);
    if (formatObj.borders) {
      this.applyBorders_(range, formatObj.borders);
    }
  }

  /**
   * Formats a single border side structure for serialization.
   * @private
   */
  static serializeBorderSide_(sideObj) {
    if (!sideObj) return null;
    let colorStr = null;
    let styleStr = null;
    try {
      const color = sideObj.getColor();
      if (color) colorStr = color.asRgbColor().asHexString();
    } catch (e) {}
    try {
      const style = sideObj.getBorderStyle();
      if (style) styleStr = String(style);
    } catch (e) {}
    
    if (!styleStr || styleStr === 'NONE') return null;
    return { style: styleStr, color: colorStr };
  }

  /**
   * Captures cell border styles for serialization.
   * @param {SpreadsheetApp.Range} cell - Single cell range
   * @returns {Object|null} Border styles object or null
   * @private
   */
  static getCellBorder_(cell) {
    try {
      const border = cell.getBorder();
      if (!border) return null;
      
      const top = this.serializeBorderSide_(border.getTop());
      const bottom = this.serializeBorderSide_(border.getBottom());
      const left = this.serializeBorderSide_(border.getLeft());
      const right = this.serializeBorderSide_(border.getRight());
      
      if (!top && !bottom && !left && !right) return null;
      return { top, bottom, left, right };
    } catch (e) {
      return null;
    }
  }
}
