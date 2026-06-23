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
      throw new Error("Header format has not been saved yet. Please set the format first using 'Set header format' under the Admin -> Formatting submenu.");
    }
    const formatObj = JSON.parse(formatStr);
    this.applyFormatToRange_(range, formatObj);
  }

  /**
   * Applies the stored record format (RECORD_FORMAT) to each cell in the provided range.
   * @param {SpreadsheetApp.Range} range - The spreadsheet range to format
   */
  static applyRecordFormat(range) {
    const formatStr = ConfigurationManager.getConfigValue("RECORD_FORMAT");
    if (!formatStr) {
      throw new Error("Record format has not been saved yet. Please set the format first using 'Set record format' under the Admin -> Formatting submenu.");
    }
    const formatObj = JSON.parse(formatStr);
    this.applyFormatToRange_(range, formatObj);
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
    
    // Apply borders if configured
    if (formatObj.borders) {
      const b = formatObj.borders;
      
      const applySide = (sideName, hasSide, sideConfig) => {
        const top = sideName === 'top' ? hasSide : null;
        const left = sideName === 'left' ? hasSide : null;
        const bottom = sideName === 'bottom' ? hasSide : null;
        const right = sideName === 'right' ? hasSide : null;
        
        let color = null;
        let style = null;
        if (hasSide && sideConfig) {
          color = sideConfig.color || null;
          if (sideConfig.style) {
            const styleName = sideConfig.style.toUpperCase();
            style = SpreadsheetApp.BorderStyle[styleName] || null;
          }
        }
        range.setBorder(top, left, bottom, right, null, null, color, style);
      };
      
      applySide('top', !!b.top, b.top);
      applySide('bottom', !!b.bottom, b.bottom);
      applySide('left', !!b.left, b.left);
      applySide('right', !!b.right, b.right);
      
      // Apply vertical borders if left or right borders are present
      const hasVertical = !!b.left || !!b.right;
      const verticalConfig = b.left || b.right;
      let verticalColor = null;
      let verticalStyle = null;
      if (hasVertical && verticalConfig) {
        verticalColor = verticalConfig.color || null;
        if (verticalConfig.style) {
          const styleName = verticalConfig.style.toUpperCase();
          verticalStyle = SpreadsheetApp.BorderStyle[styleName] || null;
        }
      }
      range.setBorder(null, null, null, null, hasVertical, null, verticalColor, verticalStyle);
    }
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
      
      const serializeSide = (sideObj) => {
        if (!sideObj) return null;
        let colorStr = null;
        let styleStr = null;
        try {
          const color = sideObj.getColor();
          if (color) {
            colorStr = color.asRgbColor().asHexString();
          }
        } catch (e) {}
        try {
          const style = sideObj.getBorderStyle();
          if (style) {
            styleStr = String(style);
          }
        } catch (e) {}
        
        if (!styleStr || styleStr === 'NONE') return null;
        
        return {
          style: styleStr,
          color: colorStr
        };
      };
      
      const top = serializeSide(border.getTop());
      const bottom = serializeSide(border.getBottom());
      const left = serializeSide(border.getLeft());
      const right = serializeSide(border.getRight());
      
      if (!top && !bottom && !left && !right) return null;
      
      return { top, bottom, left, right };
    } catch (e) {
      return null;
    }
  }
}
