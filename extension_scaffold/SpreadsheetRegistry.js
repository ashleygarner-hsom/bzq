/**
 * Coordinates spreadsheet registration, metadata lookup, and configuration properties location.
 */
class SpreadsheetRegistry {
  /**
   * Auto-detects the active deployment environment name (e.g. 'LOCAL_ASHLEYGARNER-HSOM') 
   * by parsing the containing script project's file name in Google Drive, falling back 
   * to checking script properties or defaulting to production. This avoids manual property 
   * setting during automated bootstrap deployments.
   * @returns {string} The active environment identifier (e.g., 'PROD' or custom environment name),
   *                  used to resolve the corresponding environment-suffixed configuration spreadsheet.
   * @private
   */
  static getEnvName_() {
    let env = PropertiesService.getScriptProperties().getProperty("BZQ_ENV");
    if (env) return env;

    if (typeof BZQ_ENV !== "undefined" && BZQ_ENV) {
      return BZQ_ENV;
    }

    try {
      const name = DriveApp.getFileById(ScriptApp.getScriptId()).getName();
      const match = name.match(/\[(.*?)\]/);
      return match ? match[1] : "PROD";
    } catch (ex) {
      console.error("Failed to auto-detect environment name: " + ex.message);
      return "PROD";
    }
  }

  /**
   * Searches the user's Google Drive for files matching a specific configuration name and
   * filters out trashed files to return the ID of the most recently updated instance. This 
   * ensures we always connect to the latest active configuration database sheet.
   * @param {string} name - The exact file name of the configuration spreadsheet (e.g., 'BZQ Core Configuration').
   *                        Used to lookup the specific sheet in Drive.
   * @returns {string|null} The unique Google Drive file ID of the most recently modified sheet, 
   *                        or null if no matching file exists in Drive.
   * @private
   */
  static findLatestFileIdByName_(name) {
    const files = DriveApp.getFilesByName(name);
    let latestId = null;
    let latestTime = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      const time = file.getLastUpdated().getTime();
      if (time > latestTime) {
        latestTime = time;
        latestId = file.getId();
      }
    }
    return latestId;
  }

  /**
   * Searches Drive for configuration spreadsheets. If the environment is specified,
   * it searches for the exact environment-suffixed file. If not found or in PROD,
   * it searches for any config file and uses it only if there is a single unique match.
   * @param {string} env - The active environment name (e.g., 'PROD' or 'LOCAL_ASHLEYGARNER-HSOM').
   *                       Used to match environment-specific configuration files.
   * @returns {string|null} The unique Google Drive file ID of the resolved configuration sheet,
   *                        or null if it cannot be determined unambiguously.
   * @private
   */
  static findConfigIdForEnv_(env) {
    const exactName = env === "PROD" ? "BZQ Core Configuration" : `BZQ Core Configuration ${env}`;
    const parentId = typeof BZQ_PARENT_FOLDER_ID !== "undefined" ? BZQ_PARENT_FOLDER_ID : "";
    if (parentId) {
      const inFolderId = this.locateConfigInFolder_(parentId, exactName);
      if (inFolderId) return inFolderId;
    }
    const exactId = this.findLatestFileIdByName_(exactName);
    if (exactId) return exactId;

    return env === "PROD" ? this.searchProdConfig_() : null;
  }

  /**
   * Performs a single-match lookup for production configuration files in Drive.
   * @returns {string|null} The resolved file ID or null if ambiguous.
   * @private
   */
  static searchProdConfig_() {
    const query = "title contains 'BZQ Core Configuration' and " +
      "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
    const files = DriveApp.searchFiles(query);
    const results = [];
    while (files.hasNext()) {
      results.push(files.next());
    }
    return results.length === 1 ? results[0].getId() : null;
  }

  static resolveConfigId() {
    const cache = CacheService.getScriptCache();
    const cachedId = cache.get("bzq_config_sheet_id");
    if (cachedId) return cachedId;

    const env = this.getEnvName_();
    const fileId = this.findConfigIdForEnv_(env);
    if (fileId) {
      cache.put("bzq_config_sheet_id", fileId, 1500);
    }
    return fileId;
  }

  /**
   * Locates an untrashed file with the matching name inside a specific folder (or Root My Drive if null).
   * @param {string|null} folderId - The unique Google Drive Folder ID, or null to lookup in My Drive Root.
   *                                Used as the parent directory to constrain the search.
   * @param {string} name - The exact filename string to search for (e.g. 'BZQ Core Configuration').
   *                        Used to find files by name.
   * @returns {string|null} The unique Google Drive file ID of the matched configuration sheet, or null if not found.
   * @private
   */
  static locateConfigInFolder_(folderId, name) {
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const files = folder.getFilesByName(name);
    while (files.hasNext()) {
      const file = files.next();
      if (!file.isTrashed()) return file.getId();
    }
    return null;
  }

  /**
   * Initializes a newly created Spreadsheet with the default schema sheets.
   * @param {SpreadsheetApp.Spreadsheet} ss - The newly created Google Spreadsheet object to initialize.
   *                                          Used to insert tables.
   * @returns {void}
   * @private
   */
  static initializeSchemaSheets_(ss) {
    const sheets = [
      "ConfigurationProperties", "SequenceConfiguration",
      "ObjectConfiguration", "LookupConfiguration",
      "DropdownConfiguration", "GlobalDropdownConfiguration",
      "Spreadsheets"
    ];
    sheets.forEach(name => ss.insertSheet(name));
  }

  /**
   * Provisions a new BZQ Configuration Spreadsheet or resolves an existing one in the folder.
   * Places the file in the designated parent folder if provided.
   * @param {string|null} parentFolderId - Optional Google Drive Folder ID.
   *                                       Used as the destination directory for the new sheet.
   * @returns {string} The unique spreadsheet ID of the resolved or newly provisioned BZQ configuration.
   */
  static createConfigurationSpreadsheet(parentFolderId) {
    const env = this.getEnvName_();
    const name = env === "PROD" ? "BZQ Core Configuration" : `BZQ Core Configuration ${env}`;
    const existingId = this.locateConfigInFolder_(parentFolderId, name);
    if (existingId) {
      CacheService.getScriptCache().put("bzq_config_sheet_id", existingId, 1500);
      return existingId;
    }
    const ss = SpreadsheetApp.create(name);
    const ssFile = DriveApp.getFileById(ss.getId());
    if (parentFolderId) {
      DriveApp.getFolderById(parentFolderId).addFile(ssFile);
      DriveApp.getRootFolder().removeFile(ssFile);
    }
    this.initializeSchemaSheets_(ss);
    CacheService.getScriptCache().put("bzq_config_sheet_id", ss.getId(), 1500);
    return ss.getId();
  }

  /**
   * Validates if a spreadsheet is registered as a managed BZQ Spoke Sheet.
   * Checks the active ID against the Object Configuration sheet.
   * @param {string} spreadsheetId - The active spreadsheet ID to inspect.
   * @returns {boolean} True if the spreadsheet is managed.
   */
  static isManagedSpreadsheet(spreadsheetId) {
    const configId = this.resolveConfigId();
    if (!configId) return false;
    
    const ss = SpreadsheetApp.openById(configId);
    const sheet = ss.getSheetByName("Spreadsheets");
    if (!sheet) return false;
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;
    
    const idCol = data[0].findIndex(h => String(h).toLowerCase().includes("id"));
    const colIndex = idCol === -1 ? 0 : idCol;
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIndex]).trim() === spreadsheetId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a configuration sheet resides in a Shared Drive.
   * @param {string} configId - Spreadsheet ID of the configuration properties.
   * @returns {boolean} True if in a Shared Drive, false if in personal My Drive.
   */
  static isConfigInSharedDrive(configId) {
    try {
      const file = DriveApp.getFileById(configId);
      const parents = file.getParents();
      if (parents.hasNext()) {
        const parent = parents.next();
        return parent.getOwner() === null;
      }
    } catch (e) {
      // Fallback
    }
    return false;
  }

  /**
   * Provisions a spoke workbook. Clones from Template folder if missing, then checks and injects trigger boots.
   * @param {string} name - Name of the spoke workbook.
   * @param {string} parentFolderId - Folder ID where the spoke resides or should be created.
   * @returns {string} The spreadsheet ID.
   */
  static provisionSpokeWorkbook(name, parentFolderId) {
    const ssId = this.locateOrCreateSpokeFile_(name, parentFolderId);
    this.ensureSpokeTriggers(ssId);
    return ssId;
  }

  /**
   * Helper to locate or clone a spoke file from the Templates directory.
   * @param {string} name - Spoke sheet name.
   * @param {string} folderId - Target parent folder ID.
   * @returns {string} Spreadsheet ID.
   * @private
   */
  static locateOrCreateSpokeFile_(name, folderId) {
    const parentFolder = DriveApp.getFolderById(folderId);
    const files = parentFolder.getFilesByName(name);
    if (files.hasNext()) return files.next().getId();

    const configId = this.resolveConfigId();
    if (!configId) throw new Error("Config workbook not found.");
    const configParents = DriveApp.getFileById(configId).getParents();
    if (!configParents.hasNext()) throw new Error("Templates directory not resolvable.");

    const templates = configParents.next().getFoldersByName("Templates");
    if (!templates.hasNext()) throw new Error("Templates folder not found.");
    const tFiles = templates.next().getFilesByName("SpokeTemplate");
    if (!tFiles.hasNext()) throw new Error("SpokeTemplate not found.");

    const copy = tFiles.next().makeCopy(name, parentFolder);
    return copy.getId();
  }

  /**
   * Resolves the container-bound script ID of a spreadsheet using Developer Metadata.
   * @param {string} spreadsheetId - Active spreadsheet ID.
   * @returns {string|null} Script ID, or null if no bound script container found.
   * @private
   */
  static getBoundScriptId_(spreadsheetId) {
    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      const meta = ss.getDeveloperMetadata();
      const found = meta.find(m => m.getKey() === "bzq_bound_script_id");
      return found ? found.getValue() : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Ensures that a managed spreadsheet contains a bound script triggers project.
   * Self-heals/creates the project if missing, then updates its triggers.
   * @param {string} spreadsheetId - Target Google Spreadsheet ID.
   * @returns {string} Bound script ID.
   */
  static ensureSpokeTriggers(spreadsheetId) {
    let scriptId = this.getBoundScriptId_(spreadsheetId);
    if (!scriptId) {
      const ss = SpreadsheetApp.openById(spreadsheetId);
      scriptId = this.createBoundScript_(spreadsheetId, ss.getName() + " Bound Script");
      this.saveBoundScriptId_(ss, scriptId);
    }
    if (scriptId) {
      this.injectBootstrapper_(scriptId);
    }
    return scriptId;
  }

  /**
   * Attaches the bound script ID as developer metadata on the spreadsheet file.
   * @param {SpreadsheetApp.Spreadsheet} ss - Target spreadsheet.
   * @param {string|null} scriptId - Script ID.
   * @private
   */
  static saveBoundScriptId_(ss, scriptId) {
    if (!scriptId) return;
    try {
      ss.addDeveloperMetadata("bzq_bound_script_id", scriptId, SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
    } catch (e) {
      console.error("Failed to write developer metadata: " + e.message);
    }
  }

  /**
   * Creates a container-bound script project for the target spreadsheet.
   * @param {string} spreadsheetId - Parent spreadsheet ID.
   * @param {string} title - Friendly title for the script project.
   * @returns {string} The created Apps Script project ID.
   * @private
   */
  static createBoundScript_(spreadsheetId, title) {
    const url = "https://script.googleapis.com/v1/projects";
    const payload = {
      title: title,
      parentId: spreadsheetId
    };
    const response = UrlFetchApp.fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
    const result = JSON.parse(response.getContentText());
    return result.scriptId;
  }

  /**
   * Injects the static triggers.js bootstrapper into the target container script.
   * @param {string} scriptId - Target Apps Script project container ID.
   * @returns {void}
   * @private
   */
  static injectBootstrapper_(scriptId) {
    const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const payload = this.getBootstrapperPayload_();
    UrlFetchApp.fetch(url, {
      method: "PUT",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  }

  /**
   * Builds the identical container-bound script files array payload.
   * @returns {Object} JSON files array.
   * @private
   */
  static getBootstrapperPayload_() {
    const appsUtilitiesLibId = typeof BZQ_APPS_UTILITIES_ID !== "undefined"
      ? BZQ_APPS_UTILITIES_ID
      : "1CA8gHQERZVfscjg57JFohV0yih0iY7L0RB8swaKrI-RIPEMZWUx4m3FS";
    const formsEngineLibId = typeof BZQ_FORMS_ENGINE_ID !== "undefined"
      ? BZQ_FORMS_ENGINE_ID
      : "1HucXDble404_cRjXs0BOfsNsXqXzsu5e8d1mjn85Qpy4RrTvfgz9CYlT";
    const moduleManagerLibId = typeof BZQ_MODULE_MANAGER_ID !== "undefined"
      ? BZQ_MODULE_MANAGER_ID
      : "1BYaOu7n4ronLM28iOvHDGPBjjfdykchy-zBLqniLoDqgWdn5ba490WdF";

    const triggerSourceLines = [
      "function onOpen() { AppsUtilities.onOpen(this); }",
      "function onEdit(e) { AppsUtilities.onEdit(e); }",
      "function appInit_setupInstallableTrigger() { AppsUtilities.appInit_setupInstallableTrigger(); }",
      "function appInit_onOpenInstallable(e) { AppsUtilities.appInit_onOpenInstallable(e); }",
      "function appInit_onEditInstallable(e) { AppsUtilities.appInit_onEditInstallable(e); }",
      "function appInit_getLogoUrl() { return AppsUtilities.appInit_getLogoUrl(); }",
      "function appInit_updateCache() { return AppsUtilities.appInit_updateCache(); }",
      "function appInit_preCacheObjects() { return AppsUtilities.appInit_preCacheObjects(); }",
      "function appInit_createMenus() { return AppsUtilities.appInit_createMenus(this); }",
      "function triggerAddRecordToActivePage() { AppsUtilities.triggerAddRecordToActivePage(); }",
      "function triggerValidateSelectedRows() { AppsUtilities.triggerValidateSelectedRows(); }",
      "function triggerResetConfigurationCache() { AppsUtilities.triggerResetConfigurationCache(); }",
      "function triggerSetHeaderFormat() { AppsUtilities.triggerSetHeaderFormat(); }",
      "function triggerSetRecordFormat() { AppsUtilities.triggerSetRecordFormat(); }",
      "function triggerApplyHeaderFormat() { AppsUtilities.triggerApplyHeaderFormat(); }",
      "function triggerApplyRecordFormat() { AppsUtilities.triggerApplyRecordFormat(); }",
      "/**",
      " * Returns the current configuration cache version.",
      " * @customfunction",
      " * @returns {number} The active cache version number (timestamp).",
      " */",
      "function BZQ_CACHE_VERSION() { return AppsUtilities.BZQ_CACHE_VERSION(); }",
      "/**",
      " * Retrieves a property value from a BZQ business object record.",
      " * @param {string} objectName Name of the business object.",
      " * @param {string} recordId Unique identifier of the record.",
      " * @param {string} fieldName Field column name to retrieve.",
      " * @param {number} cacheBuster Cache buster timestamp (usually BZQ_CACHE_VERSION()).",
      " * @customfunction",
      " * @returns {string} The retrieved value.",
      " */",
      "function BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster) {",
      "  return AppsUtilities.BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster);",
      "}"
    ];
    const triggerSource = triggerSourceLines.join("\n");
    return {
      files: [
        { name: "Triggers", type: "SERVER_JS", source: triggerSource },
        { name: "appsscript", type: "JSON", source: JSON.stringify({
          timeZone: "America/New_York",
          runtimeVersion: "V8",
          dependencies: {
            libraries: [
              { userSymbol: "AppsUtilities", libraryId: appsUtilitiesLibId, version: "1", developmentMode: true },
              { userSymbol: "FormsEngine", libraryId: formsEngineLibId, version: "1", developmentMode: true },
              { userSymbol: "ModuleManager", libraryId: moduleManagerLibId, version: "1", developmentMode: true }
            ]
          },
          exceptionLogging: "STACKDRIVER"
        })}
      ]
    };
  }

  /**
   * Warm up configuration cache during the onOpen event.
   * @param {string} configId - The central configuration spreadsheet ID.
   * @returns {void}
   */
  static warmCache(configId) {
    // Warm up the configuration library cache
    AppsUtilities.configurationManager_UpdateCachedConfigValues(false);
  }

  /**
   * Helper to build a breadcrumb path for a file (e.g. Shared Drive / BZQ / Sales).
   * @param {string} fileId - The Google Drive File ID.
   * @returns {string} The formatted path string.
   */
  static getFolderPath(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const path = [];
      let current = file;
      let parents = current.getParents();
      while (parents.hasNext()) {
        const parent = parents.next();
        path.unshift(parent.getName());
        current = parent;
        parents = current.getParents();
      }
      return path.length > 0 ? path.join(" / ") : "My Drive";
    } catch (e) {
      return "Unknown Drive Location";
    }
  }
}
