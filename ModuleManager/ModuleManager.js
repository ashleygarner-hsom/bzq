/**
 * ModuleManager handles the discovery, enabling, dependency tracking,
 * and data seeding of BZQ Apps Script modules.
 */
class ModuleManager {
  /**
   * Retrieves the Module Manager spoke spreadsheet from the Modules registry.
   * @returns {SpreadsheetApp.Spreadsheet|null} The spreadsheet workbook or null if not found.
   */
  static getSpreadsheet() {
    const registryId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    const ss = SpreadsheetApp.openById(registryId);
    const sheet = ss.getSheetByName("Modules");
    if (!sheet) return null;
    const values = this.getSheetDataRows_(sheet, "Module");
    const match = values.find(r => r[2] === "ModuleManager");
    return match ? SpreadsheetApp.openById(match[5]) : null;
  }

  /**
   * Safely retrieves all data rows from a sheet, skipping any pre-header or header rows.
   * @param {SpreadsheetApp.Sheet} sheet - The target sheet to scan.
   * @param {string} objName - The singular object name to look up header configurations for.
   * @returns {Array[]} Row values from the sheet excluding headers.
   */
  static getSheetDataRows_(sheet, objName) {
    const config = AppsUtilities.ConfigurationManager.getObjectConfiguration(objName, 'objectName');
    const headerNum = config ? (Number(config["Header Number"]) || 1) : 1;
    const lastRow = sheet.getLastRow();
    if (lastRow <= headerNum) return [];
    return sheet.getRange(headerNum + 1, 1, lastRow - headerNum, sheet.getLastColumn()).getValues();
  }

  /**
   * Checks if a given module is currently enabled in the platform registry.
   * @param {string} moduleName - Name of the module.
   * @returns {boolean} True if enabled, false otherwise.
   */
  static isModuleEnabled(moduleName) {
    const sheet = this.getSpreadsheet().getSheetByName("Modules");
    if (!sheet) return false;
    const values = this.getSheetDataRows_(sheet, "Module");
    const match = values.find(r => r[2] === moduleName);
    return match ? match[3] === "Yes" : false;
  }

  /**
   * Recursively resolves and returns all disabled dependencies for a module.
   * @param {string} moduleName - Name of the target module.
   * @param {string[]} [visited=[]] - Tracking array for circular dependency checks.
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
    const values = this.getSheetDataRows_(depsSheet, "Module Dependency");
    values.forEach(row => {
      if (row[2] === moduleName && !this.isModuleEnabled(row[3])) {
        this.collectPrereqs_(row[3], newVisited, disabledPrereqs);
      }
    });
    return disabledPrereqs;
  }

  /**
   * Collects and aggregates prerequisite module names.
   * @param {string} prereq - Prerequisite module name.
   * @param {string[]} visited - Circular dependency tracking array.
   * @param {string[]} collected - Collected prerequisites accumulator list.
   */
  static collectPrereqs_(prereq, visited, collected) {
    const nested = this.getDisabledDependencies(prereq, visited);
    nested.forEach(n => {
      if (collected.indexOf(n) === -1) collected.push(n);
    });
    if (collected.indexOf(prereq) === -1) collected.push(prereq);
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
   * @param {string} folderId - Target Google Drive folder ID.
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
   * Registers a new spoke workbook in the Spreadsheets registry.
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
   * Updates status of module in registry sheet to Yes.
   * @param {string} module - Name of the module.
   * @param {string} spokeId - Created spreadsheet ID.
   * @private
   */
  static updateStatusToEnabled_(module, spokeId) {
    const sheet = this.getSpreadsheet().getSheetByName("Modules");
    if (!sheet) return;
    const values = this.getSheetDataRows_(sheet, "Module");
    const matchIdx = values.findIndex(r => r[2] === module);
    if (matchIdx !== -1) {
      const headerNum = 1;
      sheet.getRange(matchIdx + headerNum + 1, 4).setValue("Yes");
      sheet.getRange(matchIdx + headerNum + 1, 6).setValue(spokeId);
    }
  }

  /**
   * Dynamically discovers all active modules registered in the global scope.
   * @returns {string[]} Array of active module names.
   * @private
   */
  static discoverModules_() {
    return Object.keys(globalThis)
      .filter(k => k.indexOf("getObjects_") === 0)
      .map(k => k.substring(11));
  }

  /**
   * Retrieves the object metadata array for a module.
   * @param {string} moduleName - Name of the module.
   * @returns {Object[]|null} List of objects, or null if not found.
   * @private
   */
  static getModuleObjects_(moduleName) {
    const getter = `getObjects_${moduleName}`;
    return typeof globalThis[getter] === "function" ? globalThis[getter]() : null;
  }

  /**
   * Retrieves the seed data payload for a module.
   * @param {string} moduleName - Name of the module.
   * @returns {Object|null} Seed data dictionary map, or null if not found.
   * @private
   */
  static getModuleSeedData_(moduleName) {
    const getter = `getSeedData_${moduleName}`;
    return typeof globalThis[getter] === "function" ? globalThis[getter]() : null;
  }

  /**
   * Resolves query-based and index-based dynamic lookups from the global seed registry.
   * @param {string} cellValue - Value of cell containing lookup pattern expression.
   * @param {Object} registry - In-memory pre-compiled global registry of seed rows.
   * @returns {string} The resolved sequence ID or display value.
   */
  static resolveDynamicLookup(cellValue, registry) {
    if (typeof cellValue !== "string") return cellValue;
    const regex = /^([a-zA-Z0-9]+)\.([0-9]+)\.(filter\(([^=]+)==\s*\"([^\"]+)\"\)|[0-9]+)$/;
    const match = cellValue.match(regex);
    if (!match) return cellValue;

    const [_, mod, stableId, suffix, filterField, filterVal] = match;
    const key = `${mod}.${stableId}`;
    const group = registry[key];
    if (!group) return cellValue;

    if (filterField) {
      const matchRow = group.find(r => String(r.row[filterField.trim()]) === filterVal);
      return matchRow ? matchRow.combined : cellValue;
    } else {
      const idx = Number(suffix) - 1;
      return group[idx] ? group[idx].combined : cellValue;
    }
  }

  /**
   * Verifies that each object defined in a module has a unique StableId.
   * @param {string} moduleName - Name of the module to verify.
   */
  static verifyStableIds_(moduleName) {
    const objects = this.getModuleObjects_(moduleName);
    if (!objects) return;
    const ids = new Set();
    objects.forEach(obj => {
      if (ids.has(obj.StableId)) {
        throw new Error(`Duplicate StableId ${obj.StableId} found in module ${moduleName}`);
      }
      ids.add(obj.StableId);
    });
  }

  /**
   * Verifies that seed data contains absolutely no hardcoded manual sequence IDs.
   * @param {Object} seedData - Seeding dictionary map.
   */
  static validateNoHardcodedIds_(seedData) {
    Object.keys(seedData).forEach(key => {
      const isStableId = /^[0-9]+$/.test(key) || key.indexOf(".") !== -1;
      if (!isStableId) return;

      const objConfig = this.resolveObjectByStableId_(key);
      const idFieldName = objConfig["Id Field Name"] || "Id";
      const records = seedData[key];

      records.forEach(row => {
        const idVal = row[idFieldName];
        if (idVal && /^(xSC-|xOC-|xLC-|xDC-|xGD-|xSS-|xFM-|xMD-|xDD-)/.test(String(idVal))) {
          throw new Error(`Explicit sequence ID "${idVal}" in seed key ${key} is rejected.`);
        }
      });
    });
  }

  /**
   * Pre-compiles and loads all modules' seed data into an in-memory Global Seed Registry.
   * @returns {Object} Global Seed Registry map.
   * @private
   */
  static buildGlobalRegistry_() {
    const registry = {};
    const modules = this.discoverModules_();
    modules.forEach(mod => this.compileModuleInRegistry_(mod, registry));
    return registry;
  }

  /**
   * Compiles seed data rows for a single module.
   * @param {string} mod - Name of the module.
   * @param {Object} registry - Destination global registry map.
   * @private
   */
  static compileModuleInRegistry_(mod, registry) {
    const objects = this.getModuleObjects_(mod);
    const seedData = this.getModuleSeedData_(mod);
    if (!objects || !seedData) return;

    objects.forEach(obj => {
      const rows = seedData[obj.StableId] || seedData[String(obj.StableId)] || [];
      registry[`${mod}.${obj.StableId}`] = this.compileObjectRows_({ mod, obj, rows }, registry);
    });
  }

  /**
   * Formats and pre-calculates sequence IDs and display values for object rows.
   * @param {Object} params - Options containing object schema and raw row array.
   * @param {Object} registry - Registry map to extract sequence specs from.
   * @returns {Object[]} Processed registry row list.
   * @private
   */
  static compileObjectRows_(params, registry) {
    const { obj, rows } = params;
    const specs = this.buildSequenceSpecs_(registry);
    const spec = specs[obj.Datasheet];
    return rows.map((row, i) => {
      if (!spec) return { id: "", combined: "", row };
      const num = spec.start + i;
      const pad = String(num).padStart(spec.fmt.length - 1, '0');
      const id = `${spec.prefix}${pad}`;
      const nameKey = this.resolveNameKey_(obj, row);
      const nameVal = row[nameKey] || "";
      const combined = nameVal ? `${id} - ${nameVal}` : id;
      return { id, combined, row };
    });
  }

  /**
   * Dynamically compiles sequence specifications from in-memory sequence seed data.
   * @param {Object} registry - Pre-compiled seed registry map.
   * @returns {Object} Compiled specifications map of Datasheet Name -> { start, prefix, fmt }.
   * @private
   */
  static buildSequenceSpecs_(registry) {
    const specs = {};
    Object.keys(registry).forEach(key => {
      if (!key.endsWith(".1000")) return;
      registry[key].forEach(rec => {
        const row = rec.row;
        specs[row["Datasheet Name"]] = {
          start: Number(row["Starting Number"]) || 1000,
          prefix: row["Sequence Prefix"] || "",
          fmt: row["Format"] || "000#"
        };
      });
    });
    return specs;
  }

  /**
   * Resolves the primary descriptor/name field key inside a seed row.
   * @param {Object} obj - The object configuration record.
   * @param {Object} row - The row data key-value pair map.
   * @returns {string} The matched primary column header key, or blank if not found.
   * @private
   */
  static resolveNameKey_(obj, row) {
    const candidates = [obj.Name + " Name", "Object Name", "Sequence Name", "Spreadsheet Name", "Dropdown Name", "Global Dropdown Name", "Form Name"];
    return candidates.find(c => c in row) || "";
  }

  /**
   * Translates placeholder values and resolves dynamic lookups on cell.
   * @param {*} cell - The cell value.
   * @param {string} spokeId - Active spoke ID.
   * @param {Object} registry - In-memory pre-compiled global registry of seed rows.
   * @returns {*} Translated value.
   * @private
   */
  static translateRowCell_(cell, spokeId, registry) {
    if (typeof cell !== "string" && typeof cell !== "boolean") return cell;
    const regId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    let val = String(cell).replace(/\${CONFIG_SS_ID}/g, regId);
    val = val.replace(/\${SPOKE_ID}/g, spokeId);
    return this.resolveDynamicLookup(val, registry);
  }

  /**
   * Resolves the object metadata config by numeric or namespaced StableId.
   * @param {string|number} stableId - The stable ID key to resolve.
   * @returns {Object} The matched object configuration schema.
   */
  static resolveObjectByStableId_(stableId) {
    const modules = this.discoverModules_();
    let matchObj = null;
    modules.forEach(mod => {
      const objects = this.getModuleObjects_(mod);
      if (!objects) return;
      objects.forEach(obj => {
        const fullId = `${mod}.${obj.StableId}`;
        if (String(obj.StableId) === String(stableId) || fullId === String(stableId)) {
          matchObj = { ...obj, ModuleName: mod };
        }
      });
    });
    if (!matchObj) throw new Error(`Object with StableId ${stableId} not found`);
    return matchObj;
  }

  /**
   * Appends missing headers, and writes/merges seed records in sheet.
   * @param {Object} objConfig - Object schema metadata configuration.
   * @param {Object[]} seedRows - Row records list.
   * @param {string} spokeId - Spoke spreadsheet ID.
   * @param {Object} registry - Pre-compiled seed registry map.
   * @private
   */
  static writeSeedRecordsToSheet_(objConfig, seedRows, spokeId, registry) {
    const registryId = AppsUtilities.AppUtilitiesGlobalProperties.configurationPropertiesWorkbookId_;
    const isCore = objConfig.Datasheet.indexOf("__") === 0 || objConfig.Datasheet === "ObjectConfiguration" || objConfig.Datasheet === "SequenceConfiguration" || objConfig.Datasheet === "LookupConfiguration" || objConfig.Datasheet === "DropdownConfiguration" || objConfig.Datasheet === "GlobalDropdownConfiguration" || objConfig.Datasheet === "Spreadsheets" || objConfig.Datasheet === "ConfigurationProperties";
    const targetSs = isCore ? SpreadsheetApp.openById(registryId) : SpreadsheetApp.openById(spokeId);
    
    let sheet = targetSs.getSheetByName(objConfig.Datasheet);
    if (!sheet) sheet = targetSs.insertSheet(objConfig.Datasheet);

    const headers = this.ensureAndSyncHeaders_(sheet, seedRows);
    seedRows.forEach((rowObj, i) => {
      this.mergeRecordInSheet_({ sheet, rowObj, headers, objConfig, i, spokeId, registry });
    });
  }

  /**
   * Synchronizes and appends any missing headers to the worksheet first row.
   * @param {SpreadsheetApp.Sheet} sheet - Target worksheet.
   * @param {Object[]} seedRows - Seeding records list.
   * @returns {string[]} Synced headers list.
   * @private
   */
  static ensureAndSyncHeaders_(sheet, seedRows) {
    let headers = [];
    if (sheet.getLastColumn() > 0) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    }
    const allKeys = new Set();
    seedRows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

    const newHeaders = [...allKeys].filter(k => headers.indexOf(k) === -1);
    if (newHeaders.length > 0) {
      const startCol = headers.length + 1;
      sheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
      headers = headers.concat(newHeaders);
    }
    return headers;
  }

  /**
   * Evaluates and updates or inserts seed record row in sheet.
   * @param {Object} params - Context details.
   * @private
   */
  static mergeRecordInSheet_(params) {
    const { sheet, rowObj, headers, objConfig, i, spokeId, registry } = params;
    const nameKey = this.resolveNameKey_(objConfig, rowObj);
    const keyVal = String(rowObj[nameKey]).trim();

    const matchingRowIdx = this.findMatchingRowIndex_(sheet, headers, nameKey, keyVal);
    if (matchingRowIdx !== -1) {
      this.updateExistingRow_({ sheet, matchingRowIdx, rowObj, headers, spokeId, registry });
    } else {
      this.insertNewRow_({ sheet, rowObj, headers, objConfig, i, spokeId, registry });
    }
  }

  /**
   * Searches the worksheet for a record matching a specific primary key cell value.
   * @param {SpreadsheetApp.Sheet} sheet - Worksheet to scan.
   * @param {string[]} headers - Active sheet headers list.
   * @param {string} nameKey - Primary key header name.
   * @param {string} keyVal - Key value to match.
   * @returns {number} The 1-based row index, or -1 if not found.
   * @private
   */
  static findMatchingRowIndex_(sheet, headers, nameKey, keyVal) {
    const colIdx = headers.indexOf(nameKey);
    if (colIdx === -1 || sheet.getLastRow() <= 1) return -1;
    const colValues = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim());
    const matchIdx = colValues.indexOf(keyVal);
    return matchIdx !== -1 ? matchIdx + 2 : -1;
  }

  /**
   * Merges and updates specific provided cells in an existing record row.
   * @param {Object} params - Update options.
   * @private
   */
  static updateExistingRow_(params) {
    const { sheet, matchingRowIdx, rowObj, headers, spokeId, registry } = params;
    Object.keys(rowObj).forEach(key => {
      const colIdx = headers.indexOf(key);
      if (colIdx !== -1) {
        let cellVal = rowObj[key];
        cellVal = this.translateRowCell_(cellVal, spokeId, registry);
        sheet.getRange(matchingRowIdx, colIdx + 1).setValue(cellVal);
      }
    });
  }

  /**
   * Creates and appends a fully mapped new record row.
   * @param {Object} params - Insertion options.
   * @private
   */
  static insertNewRow_(params) {
    const { sheet, rowObj, headers, objConfig, i, spokeId, registry } = params;
    const newRow = headers.map(key => {
      const idFieldName = objConfig["Id Field Name"] || "Id";
      if (key === idFieldName) {
        const group = registry[`${objConfig.ModuleName}.${objConfig.StableId}`];
        return group && group[i] ? group[i].id : "";
      }
      let cellVal = rowObj[key] !== undefined ? rowObj[key] : "";
      return this.translateRowCell_(cellVal, spokeId, registry);
    });
    sheet.appendRow(newRow);
  }

  /**
   * Seeds the database with all stable ID records and layouts of module.
   * @param {string} module - Name of module to seed.
   * @param {string} spokeId - Created spoke ID.
   */
  static seedModuleData_(module, spokeId) {
    this.verifyStableIds_(module);
    const registry = this.buildGlobalRegistry_();
    const seedData = this.getModuleSeedData_(module);
    if (!seedData) return;

    this.validateNoHardcodedIds_(seedData);

    Object.keys(seedData).forEach(key => {
      const isStableId = /^[0-9]+$/.test(key) || key.indexOf(".") !== -1;
      if (isStableId) {
        const objConfig = this.resolveObjectByStableId_(key);
        this.writeSeedRecordsToSheet_(objConfig, seedData[key], spokeId, registry);
      } else {
        this.seedRawLayoutSheet_(key, seedData[key], spokeId, registry);
      }
    });
  }

  /**
   * Installs raw layout worksheets inside the spoke workbook.
   * @param {string} sheetName - Target worksheet name.
   * @param {Object[]} rows - Mapped layout rows.
   * @param {string} spokeId - Spoke spreadsheet ID.
   * @param {Object} registry - Global seed registry map.
   * @private
   */
  static seedRawLayoutSheet_(sheetName, rows, spokeId, registry) {
    const spokeSs = SpreadsheetApp.openById(spokeId);
    let sheet = spokeSs.getSheetByName(sheetName);
    if (!sheet) sheet = spokeSs.insertSheet(sheetName);
    if (sheet.getLastRow() > 0 || rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    sheet.appendRow(headers);
    rows.forEach(r => {
      const vals = headers.map(h => this.translateRowCell_(r[h], spokeId, registry));
      sheet.appendRow(vals);
    });
  }
}
