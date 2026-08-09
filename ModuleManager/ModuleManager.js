/**
 * ModuleManager handles the discovery, enabling, dependency tracking,
 * and data seeding of BZQ Apps Script modules.
 */
class ModuleManager {
  /**
   * Retrieves the Module Manager configuration spreadsheet.
   * @returns {SpreadsheetApp.Spreadsheet} The workbook object.
   */
  static getSpreadsheet() {
    const registryId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    return SpreadsheetApp.openById(registryId);
  }

  /**
   * Checks if a given module is currently enabled.
   * @param {string} moduleName - Name of the module.
   * @returns {boolean} True if enabled, false otherwise.
   */
  static isModuleEnabled(moduleName) {
    const sheet = this.getSpreadsheet().getSheetByName("Modules");
    if (!sheet) return false;
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][2] === moduleName) {
        return values[i][3] === "Yes";
      }
    }
    return false;
  }

  /**
   * Recursively finds all disabled dependencies for a module.
   * @param {string} moduleName - Name of the target module.
   * @param {string[]} [visited=[]] - Tracking array for circular dependency detection.
   * @returns {string[]} Ordered list of disabled prerequisite module names.
   */
  static getDisabledDependencies(moduleName, visited = []) {
    if (visited.indexOf(moduleName) !== -1) {
      throw new Error(`Circular dependency detected: ${visited.join(" -> ")} -> ${moduleName}`);
    }
    const newVisited = visited.concat([moduleName]);
    const depsSheet = this.getSpreadsheet().getSheetByName("Module Dependencies");
    if (!depsSheet) return [];
    
    const disabledPrereqs = [];
    const values = depsSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][2] === moduleName) {
        const prereq = values[i][3];
        if (!this.isModuleEnabled(prereq)) {
          const nested = this.getDisabledDependencies(prereq, newVisited);
          nested.forEach(n => {
            if (disabledPrereqs.indexOf(n) === -1) disabledPrereqs.push(n);
          });
          if (disabledPrereqs.indexOf(prereq) === -1) {
            disabledPrereqs.push(prereq);
          }
        }
      }
    }
    return disabledPrereqs;
  }

  /**
   * Enables a module and recursively enables and configures all of its dependencies.
   * @param {string} moduleName - Name of the module to enable.
   * @param {string} folderId - Google Drive folder ID where spoke workbooks should be created.
   * @returns {string} Detailed status message of the enablement operations.
   */
  static enableModule(moduleName, folderId) {
    if (this.isModuleEnabled(moduleName)) {
      return `Module ${moduleName} is already enabled.`;
    }
    const disabledDeps = this.getDisabledDependencies(moduleName);
    const messages = [];
    disabledDeps.forEach(dep => {
      messages.push(this.enableSingleModule_(dep, folderId));
    });
    messages.push(this.enableSingleModule_(moduleName, folderId));
    return messages.join("\n");
  }

  /**
   * Performs the enabling sequence for a single module.
   * @param {string} module - Name of the module.
   * @param {string} folderId - Target Google Drive folder.
   * @returns {string} Status message.
   * @private
   */
  static enableSingleModule_(module, folderId) {
    const parentFolder = DriveApp.getFolderById(folderId);
    const title = `${module} Spoke Workbook`;
    const newSs = SpreadsheetApp.create(title);
    const file = DriveApp.getFileById(newSs.getId());
    parentFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    this.registerSpoke_(module, newSs.getId(), newSs.getUrl());
    this.seedModuleData_(module, newSs.getId());
    this.updateStatusToEnabled_(module, newSs.getId());
    return `Successfully enabled and configured module: ${module}`;
  }

  /**
   * Registers a new spoke workbook in the __Spreadsheets registry.
   * @param {string} module - Name of the module.
   * @param {string} ssId - New spreadsheet ID.
   * @param {string} ssUrl - New spreadsheet URL.
   * @private
   */
  static registerSpoke_(module, ssId, ssUrl) {
    const record = {
      "Spreadsheet Name": `${module} Spoke`,
      "Spreadsheet ID": ssId,
      "Spreadsheet URL": ssUrl
    };
    AppsUtilities.RecordManager.addRecord("Spreadsheet", record);
  }

  /**
   * Seeds the spreadsheet database with the module's seed configurations.
   * @param {string} module - Name of the module.
   * @param {string} spokeId - Created spoke ID.
   * @private
   */
  static seedModuleData_(module, spokeId) {
    const globalScope = globalThis;
    const getterName = `getSeedData_${module.replace(/[^a-zA-Z0-9]/g, "")}`;
    if (typeof globalScope[getterName] !== "function") return;
    
    const seedData = globalScope[getterName]();
    this.processSeedTables_(seedData, spokeId);
  }

  /**
   * Processes and appends seed data row-by-row.
   * @param {Object} seedData - Schema mapping sheet names to rows.
   * @param {string} spokeId - Dynamic spoke ID to translate placeholders with.
   * @private
   */
  static processSeedTables_(seedData, spokeId) {
    const registryId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    Object.keys(seedData).forEach(sheetName => {
      const rows = seedData[sheetName];
      const targetSs = this.resolveTargetWorkbook_(sheetName, registryId, spokeId);
      this.writeRowsToSheet_(targetSs, sheetName, rows, spokeId);
    });
  }

  /**
   * Resolves the target spreadsheet for writing.
   * @param {string} sheet - Sheet tab name.
   * @param {string} regId - Registry workbook ID.
   * @param {string} spokeId - Created spoke ID.
   * @returns {SpreadsheetApp.Spreadsheet} Target spreadsheet.
   * @private
   */
  static resolveTargetWorkbook_(sheet, regId, spokeId) {
    if (sheet.indexOf("__") === 0) {
      return SpreadsheetApp.openById(regId);
    }
    return SpreadsheetApp.openById(spokeId);
  }

  /**
   * Writes the provided seed rows into the target sheet.
   * @param {SpreadsheetApp.Spreadsheet} ss - Target spreadsheet.
   * @param {string} name - Sheet name.
   * @param {Array[]} rows - Seed records.
   * @param {string} spokeId - Spoke ID for placeholder translation.
   * @private
   */
  static writeRowsToSheet_(ss, name, rows, spokeId) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    const headers = rows[0];
    const dataRows = rows.slice(1);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }
    dataRows.forEach(row => {
      const translated = this.translateRow_(row, spokeId);
      sheet.appendRow(translated);
    });
  }

  /**
   * Translates string placeholders within seed data arrays.
   * @param {Array} row - Raw row data.
   * @param {string} spokeId - Spoke ID to swap `${SPOKE_ID}` placeholders with.
   * @returns {Array} Translated row data.
   * @private
   */
  static translateRow_(row, spokeId) {
    const regId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    return row.map(cell => {
      if (typeof cell !== "string") return cell;
      let val = cell.replace(/\${CONFIG_SS_ID}/g, regId);
      val = val.replace(/\${SPOKE_ID}/g, spokeId);
      return val;
    });
  }

  /**
   * Updates a module's row in the Modules sheet to mark it as enabled.
   * @param {string} module - Name of the module.
   * @param {string} spokeId - Created spoke ID.
   * @private
   */
  static updateStatusToEnabled_(module, spokeId) {
    const sheet = this.getSpreadsheet().getSheetByName("Modules");
    if (!sheet) return;
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][2] === module) {
        sheet.getRange(i + 1, 4).setValue("Yes");
        sheet.getRange(i + 1, 6).setValue(spokeId);
        break;
      }
    }
  }
}
