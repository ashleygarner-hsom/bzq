/**
 * Renders the default homepage for the Google Workspace Add-on.
 * Contextually routes the user based on whether they opened it inside Sheets or from Drive.
 * @param {Object} e - The event object from Workspace Add-on framework.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onAddonHomepage(e) {
  try {
    const configId = SpreadsheetRegistry.resolveConfigId();
    if (!configId) {
      return buildSetupCard("Configuration database not found. Choose a folder to provision BZQ.");
    }

    const hostApp = e && e.commonEventObject && e.commonEventObject.hostApp ? e.commonEventObject.hostApp.toUpperCase() : "";
    
    if (hostApp === "SHEETS") {
      let activeSsId = null;
      try {
        activeSsId = SpreadsheetApp.getActiveSpreadsheet().getId();
      } catch (ex) {
        // Fallback or read from event
        if (e.sheets && e.sheets.id) activeSsId = e.sheets.id;
      }
      
      if (activeSsId) {
        if (SpreadsheetRegistry.isManagedSpreadsheet(activeSsId) || activeSsId === configId) {
          // Inside a managed BZQ Sheet -> Automatically self-heal triggers, warm cache, and load cards
          SpreadsheetRegistry.ensureSpokeTriggers(activeSsId);
          SpreadsheetRegistry.warmCache(configId);
          return buildSheetEntryFormsCard(configId, activeSsId);
        } else {
          return buildUnmanagedSheetCard(activeSsId);
        }
      }
    }

    // Default outside of Sheets (e.g. Google Drive UI homepage)
    const isShared = SpreadsheetRegistry.isConfigInSharedDrive(configId);
    return buildMainMenuCard(configId, !isShared);
  } catch (err) {
    return buildSetupCard(err.message);
  }
}

/**
 * Renders the contextual homepage for Google Sheets editor.
 * @param {Object} e - The event object.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onSheetsHomepage(e) {
  return onAddonHomepage(e);
}

/**
 * Renders the contextual homepage for Google Drive.
 * @param {Object} e - The event object.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onDriveHomepage(e) {
  return onAddonHomepage(e);
}

/**
 * Handles contextual trigger when items are selected in Drive.
 * @param {Object} e - The event object containing selected item details.
 * @returns {CardService.Card} The contextual Card UI object.
 */
function onDriveItemsSelected(e) {
  if (!e || !e.drive || !e.drive.activeCursorItem) {
    return buildSetupCard("No item selected.");
  }
  const item = e.drive.activeCursorItem;
  const section = CardService.newCardSection()
    .setHeader("Selected File Context");
    
  section.addWidget(CardService.newKeyValue()
    .setTopLabel("File Name")
    .setContent(item.title)
    .setBottomLabel("Mime Type: " + item.mimeType));
    
  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

/**
 * Universal Action Callback to clear CacheService values.
 * @param {Object} e - Event parameters.
 * @returns {CardService.ActionResponse} Action response notification.
 */
function clearBqzCache(e) {
  const cache = CacheService.getScriptCache();
  cache.remove("bzq_config_sheet_id");
  try {
    CacheService.getUserCache().remove("bzq_config_sheet_id");
  } catch (ex) {}
  
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("BZQ Cache cleared successfully!"))
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(onAddonHomepage(e)))
    .build();
}

/**
 * Builds the initial configuration wizard card.
 * @param {string} statusMsg - Current status description message.
 * @returns {CardService.Card} Setup Card UI object.
 */
function buildSetupCard(statusMsg) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ ERP Setup Wizard"));
  
  const sec = CardService.newCardSection()
    .setHeader("Status Information")
    .addWidget(CardService.newTextParagraph().setText(statusMsg));

  // Native folder lookup
  sec.addWidget(CardService.newTextInput()
    .setFieldName("folderQuery")
    .setTitle("Search folder by name in Google Drive"));
    
  sec.addWidget(CardService.newTextButton()
    .setText("Find Target Folder")
    .setOnClickAction(CardService.newAction().setFunctionName("handleSearchFolders")));

  sec.addWidget(CardService.newTextParagraph().setText("— OR —"));

  sec.addWidget(CardService.newTextButton()
    .setText("Quick Install in My Drive (Sandbox)")
    .setOnClickAction(CardService.newAction()
      .setFunctionName("handleVerifyFolderSelect")
      .setParameters({ folderId: "root" })));

  return card.addSection(sec).build();
}

/**
 * Action Callback to search Drive folders by name.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Folder search results card.
 */
function handleSearchFolders(e) {
  const query = e.formInput.folderQuery;
  if (!query) {
    return wrapCardInActionResponse_(buildSetupCard("Search query cannot be empty."));
  }
  const card = buildSearchFoldersCard_(query);
  return wrapCardInActionResponse_(card);
}

/**
 * Builds the folder search results card.
 * @param {string} query - The search query.
 * @returns {CardService.Card} Folder list card.
 * @private
 */
function buildSearchFoldersCard_(query) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("BZQ Folder Selection"));
  const sec = CardService.newCardSection().setHeader(`Matching Folders for "${query}"`);
  const folders = DriveApp.searchFolders(`mimeType = 'application/vnd.google-apps.folder' and title contains '${query.replace(/'/g, "\\'")}' and trashed = false`);
  let count = 0;
  while (folders.hasNext() && count < 10) {
    const f = folders.next();
    const type = f.getOwner() !== null ? "Personal My Drive" : "Shared Drive";
    sec.addWidget(CardService.newKeyValue().setTopLabel(type).setContent(f.getName()).setBottomLabel("ID: " + f.getId().substring(0, 16) + "...")
      .setOnClickAction(CardService.newAction().setFunctionName("handleVerifyFolderSelect").setParameters({ folderId: f.getId() })));
    count++;
  }
  if (count === 0) {
    sec.addWidget(CardService.newTextParagraph().setText("No matching folders found. Please refine your query."));
  }
  return card.addSection(sec).build();
}

/**
 * Action Callback to verify selected folder type (Shared vs Personal).
 * Prompts user with warnings if personal folder is targeted.
 * @param {Object} e - Event parameters.
 * @returns {CardService.ActionResponse} Navigation redirect action response.
 */
function handleVerifyFolderSelect(e) {
  const folderId = e.parameters.folderId;
  const isPersonal = folderId === "root" || DriveApp.getFolderById(folderId).getOwner() !== null;
  if (isPersonal) {
    return wrapCardInActionResponse_(buildPersonalWarningCard_(folderId));
  }
  return handleExecuteFolderProvision({ parameters: { folderId: folderId } });
}

/**
 * Builds the personal drive confirmation warning card.
 * @param {string} folderId - The folder ID.
 * @returns {CardService.Card} Warning card.
 * @private
 */
function buildPersonalWarningCard_(folderId) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Personal Drive Warning"));
  const sec = CardService.newCardSection().setHeader("⚠️ Compatibility Warning")
    .addWidget(CardService.newTextParagraph().setText(
      "You have selected a folder in a personal My Drive directory. BZQ Shared Drive features " +
      "and automated collaborator access will not function properly here.\n\n" +
      "Are you sure you want to proceed?"
    ));
  sec.addWidget(CardService.newTextButton().setText("Acknowledge & Provision Anyway")
    .setOnClickAction(CardService.newAction().setFunctionName("handleExecuteFolderProvision").setParameters({ folderId: folderId })));
  sec.addWidget(CardService.newTextButton().setText("Cancel / Choose Shared Folder")
    .setOnClickAction(CardService.newAction().setFunctionName("onAddonHomepage")));
  return card.addSection(sec).build();
}

/**
 * Action Callback to execute configuration file creation.
 * @param {Object} e - Event parameters.
 * @returns {CardService.ActionResponse} Action response update card.
 */
function handleExecuteFolderProvision(e) {
  const folderId = e.parameters.folderId;
  const targetId = folderId === "root" ? null : folderId;

  try {
    const configId = SpreadsheetRegistry.createConfigurationSpreadsheet(targetId);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(onAddonHomepage(e)))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSetupCard("Provision failed: " + err.message)))
      .build();
  }
}

/**
 * Constructs the primary navigation menu once configuration is resolved.
 * @param {string} configId - The central configuration spreadsheet ID.
 * @param {boolean} isPersonalDrive - True if the configuration resides in My Drive.
 * @returns {CardService.Card} Navigation Card UI.
 */
function buildMainMenuCard(configId, isPersonalDrive = false) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Main Menu"));
  const section = CardService.newCardSection();

  if (isPersonalDrive) {
    section.addWidget(CardService.newTextParagraph().setText(
      "⚠️ WARNING: Config created in My Drive. Shared access is disabled. " +
      "We recommend moving the file to a Shared Drive."
    ));
  }
  
  const env = SpreadsheetRegistry.getEnvName_();
  section.addWidget(CardService.newKeyValue()
    .setTopLabel(`Connected: BZQ Core Configuration [${env}]`)
    .setContent("Status: Online")
    .setBottomLabel("ID: " + configId.substring(0, 12) + "..."));
      
  section.addWidget(CardService.newTextButton()
    .setText("📁 BZQ Sheets")
    .setOnClickAction(CardService.newAction().setFunctionName("handleShowBzqSheets")));

  section.addWidget(CardService.newTextButton()
    .setText("📋 Entry Forms")
    .setOnClickAction(CardService.newAction().setFunctionName("handleShowAllEntryForms")));
    
  return card.addSection(section).build();
}

/**
 * Wraps a CardService Card inside an ActionResponse with a navigation push instruction.
 * Prevents silent blank pages when action callbacks return raw Cards.
 * @param {CardService.Card} card - The built Card UI.
 * @returns {CardService.ActionResponse} Action response wrapping navigation.
 * @private
 */
function wrapCardInActionResponse_(card) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

/**
 * Renders the scrollable list of registered spreadsheets.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Registered spreadsheets list card.
 */
/**
 * Resolves column indices for the Spreadsheets workbook tab.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The Spreadsheets sheet object.
 * @returns {Object} Column offsets for id and name.
 * @private
 */
function getSpreadsheetHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ssIdIdx = headers.findIndex(h => String(h).toLowerCase().includes("id"));
  const ssNameIdx = headers.findIndex(h => String(h).toLowerCase().includes("name"));
  return {
    idCol: ssIdIdx === -1 ? 3 : ssIdIdx,
    nameCol: ssNameIdx === -1 ? 2 : ssNameIdx
  };
}

/**
 * Resolves column indices for the ObjectConfiguration workbook tab.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The ObjectConfiguration sheet object.
 * @returns {Object} Column offsets for name and spreadsheet ID.
 * @private
 */
function getObjectHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameIdx = headers.findIndex(h => String(h).toLowerCase() === "object name");
  const ssIdIdx = headers.findIndex(h => String(h).toLowerCase() === "spreadsheet id");
  return {
    nameCol: nameIdx === -1 ? 2 : nameIdx,
    ssIdCol: ssIdIdx === -1 ? 6 : ssIdIdx
  };
}

/**
 * Renders the scrollable list of registered spreadsheets.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Registered spreadsheets list card.
 */
function handleShowBzqSheets(e) {
  try {
    const configId = SpreadsheetRegistry.resolveConfigId();
    if (!configId) return wrapCardInActionResponse_(buildSetupCard("Configuration database not found."));
    const ss = SpreadsheetApp.openById(configId);
    const registrySheet = ss.getSheetByName("Spreadsheets");
    const card = buildBzqSheetsCard_(ss, registrySheet);
    return wrapCardInActionResponse_(card);
  } catch (err) {
    return wrapCardInActionResponse_(buildSetupCard("Error loading sheets: " + err.message));
  }
}

/**
 * Builds the card containing BZQ Managed Sheets.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Core configuration spreadsheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} registrySheet - Spreadsheets registry sheet.
 * @returns {CardService.Card} Sheets card.
 * @private
 */
function buildBzqSheetsCard_(ss, registrySheet) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("BZQ Managed Sheets"));
  const section = CardService.newCardSection();
  if (!registrySheet || registrySheet.getLastRow() < 2) {
    return card.addSection(section.addWidget(CardService.newTextParagraph().setText("No sheets registered."))).build();
  }
  const { idCol, nameCol } = getSpreadsheetHeaders_(registrySheet);
  const spreadsheets = registrySheet.getRange(2, 1, registrySheet.getLastRow() - 1, registrySheet.getLastColumn())
    .getValues().filter(row => row[idCol] && String(row[idCol]).trim() !== "");
  if (spreadsheets.length === 0) {
    return card.addSection(section.addWidget(CardService.newTextParagraph().setText("No sheets registered."))).build();
  }
  const objectsData = getObjectsData_(ss);
  buildSpreadsheetsListSection_(section, spreadsheets, objectsData, idCol, nameCol);
  return card.addSection(section).build();
}

/**
 * Resolves formatted object data array with dynamic headers.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Config spreadsheet object.
 * @returns {Array<Object>} Formatted object details array.
 * @private
 */
function getObjectsData_(ss) {
  const objectsSheet = ss.getSheetByName("ObjectConfiguration");
  if (!objectsSheet || objectsSheet.getLastRow() < 2) return [];
  
  const { nameCol, ssIdCol } = getObjectHeaders_(objectsSheet);
  const data = objectsSheet.getRange(2, 1, objectsSheet.getLastRow() - 1, objectsSheet.getLastColumn()).getValues();
  return data.map(row => ({
    name: row[nameCol],
    ssId: row[ssIdCol]
  }));
}

/**
 * Appends key value widgets to the spreadsheets list section.
 * @param {CardService.CardSection} section - UI card section.
 * @param {Array} spreadsheets - Registered spreadsheets array.
 * @param {Array} objectsData - Resolved object configs.
 * @param {number} idCol - Column offset for sheet ID.
 * @param {number} nameCol - Column offset for sheet name.
 * @private
 */
function buildSpreadsheetsListSection_(section, spreadsheets, objectsData, idCol, nameCol) {
  spreadsheets.forEach(row => {
    const name = row[nameCol];
    const id = row[idCol];
    const objects = objectsData
      .filter(obj => obj.ssId === id)
      .map(obj => obj.name)
      .join(", ");

    const folderPath = SpreadsheetRegistry.getFolderPath(id);
    section.addWidget(CardService.newKeyValue()
      .setTopLabel(name)
      .setContent(`Contains: ${objects || "None"}`)
      .setBottomLabel(`Drive location: ${folderPath}`)
      .setOnClickAction(CardService.newAction().setFunctionName("handleOpenSheetView").setParameters({ sheetId: id })));
  });
}

/**
 * Renders the entry forms list for a specific spreadsheet.
 * @param {string} configId - Central config spreadsheet ID.
 * @param {string} spreadsheetId - Spreadsheet ID to filter.
 * @returns {CardService.Card} Entry forms list card.
 */
function buildSheetEntryFormsCard(configId, spreadsheetId) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("BZQ Entry Forms"));
  const section = CardService.newCardSection().setHeader("Available Objects in Workbook");

  const ss = SpreadsheetApp.openById(configId);
  const objectsSheet = ss.getSheetByName("ObjectConfiguration");
  if (!objectsSheet || objectsSheet.getLastRow() < 2) {
    return card.addSection(section.addWidget(CardService.newTextParagraph().setText("No object configurations resolved."))).build();
  }

  const { nameCol, ssIdCol } = getObjectHeaders_(objectsSheet);
  const objectsData = objectsSheet.getRange(2, 1, objectsSheet.getLastRow() - 1, objectsSheet.getLastColumn()).getValues();
  
  const filtered = objectsData
    .filter(obj => obj[nameCol] && String(obj[nameCol]).trim() !== "")
    .filter(obj => !spreadsheetId || obj[ssIdCol] === spreadsheetId)
    .map(obj => ({ name: obj[nameCol], desc: obj[0] }));

  buildFormsSection_(section, filtered);
  return card.addSection(section).build();
}

/**
 * Appends key value widgets to the forms listing section.
 * @param {CardService.CardSection} section - UI card section.
 * @param {Array} filtered - Filtered object definitions.
 * @private
 */
function buildFormsSection_(section, filtered) {
  if (filtered.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("No objects configured for this spreadsheet."));
    return;
  }
  filtered.forEach(obj => {
    section.addWidget(CardService.newKeyValue()
      .setTopLabel("Object Form")
      .setContent(obj.name)
      .setBottomLabel(obj.desc)
      .setOnClickAction(CardService.newAction().setFunctionName("handleOpenObjectForm").setParameters({ objectName: obj.name })));
  });
}

/**
 * Displays a fallback card when opening an unmanaged spreadsheet.
 * @param {string} spreadsheetId - Unmanaged spreadsheet ID.
 * @returns {CardService.Card} Warning Card UI.
 */
function buildUnmanagedSheetCard(spreadsheetId) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Unmanaged Sheet"));
  const sec = CardService.newCardSection()
    .setHeader("⚠️ Spreadsheet Registry Warning")
    .addWidget(CardService.newTextParagraph().setText(
      "This spreadsheet is not registered in the BZQ Platform database.\n\n" +
      "To enable BZQ forms and integrations on this sheet, register it in your BZQ Core Configuration."
    ));

  return card.addSection(sec).build();
}

/**
 * Action Callback to open object data entry forms.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Form Card UI object.
 */
function handleOpenObjectForm(e) {
  const name = e.parameters.objectName;
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(`New ${name}`));
  const sec = CardService.newCardSection()
    .setHeader(`Form: ${name}`)
    .addWidget(CardService.newTextParagraph().setText("Record creation fields will render here."));

  return wrapCardInActionResponse_(card.addSection(sec).build());
}

/**
 * Action Callback to open the entry forms list for a specific spreadsheet.
 * @param {Object} e - Event parameters containing sheetId.
 * @returns {CardService.ActionResponse} Action response wrapping forms card.
 */
function handleOpenSheetView(e) {
  try {
    const id = e.parameters.sheetId;
    const card = buildSheetEntryFormsCard(SpreadsheetRegistry.resolveConfigId(), id);
    return wrapCardInActionResponse_(card);
  } catch (err) {
    return wrapCardInActionResponse_(buildSetupCard("Error opening sheet forms: " + err.message));
  }
}

/**
 * Action Callback to show all globally configured entry forms.
 * @param {Object} e - Event parameters.
 * @returns {CardService.ActionResponse} Action response wrapping forms card.
 */
function handleShowAllEntryForms(e) {
  try {
    const card = buildSheetEntryFormsCard(SpreadsheetRegistry.resolveConfigId(), "");
    return wrapCardInActionResponse_(card);
  } catch (err) {
    return wrapCardInActionResponse_(buildSetupCard("Error loading forms: " + err.message));
  }
}
