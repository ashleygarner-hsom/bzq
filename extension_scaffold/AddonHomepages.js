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
          // Inside a managed BZQ Sheet -> Automatically warm cache and load entry forms list
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
    return buildSetupCard("Search query cannot be empty.");
  }

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Folder Selection"));
  const sec = CardService.newCardSection().setHeader(`Matching Folders for "${query}"`);

  const searchStr = `mimeType = 'application/vnd.google-apps.folder' and name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
  const folders = DriveApp.searchFolders(searchStr);
  let count = 0;

  while (folders.hasNext() && count < 10) {
    const folder = folders.next();
    const isPersonal = folder.getOwner() !== null;
    const driveType = isPersonal ? "Personal My Drive" : "Shared Drive";
    
    sec.addWidget(CardService.newKeyValue()
      .setTopLabel(driveType)
      .setContent(folder.getName())
      .setBottomLabel("ID: " + folder.getId().substring(0, 16) + "...")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("handleVerifyFolderSelect")
        .setParameters({ folderId: folder.getId() })));
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
 * @returns {CardService.Card|CardService.ActionResponse} Navigation redirect card.
 */
function handleVerifyFolderSelect(e) {
  const folderId = e.parameters.folderId;
  const isPersonal = folderId === "root" || DriveApp.getFolderById(folderId).getOwner() !== null;

  if (isPersonal) {
    // Show personal drive confirmation prompt
    const card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle("Personal Drive Warning"));
    
    const sec = CardService.newCardSection()
      .setHeader("⚠️ Compatibility Warning")
      .addWidget(CardService.newTextParagraph().setText(
        "You have selected a folder in a personal My Drive directory. BZQ Shared Drive features " +
        "and automated collaborator access will not function properly here.\n\n" +
        "Are you sure you want to proceed?"
      ));

    sec.addWidget(CardService.newTextButton()
      .setText("Acknowledge & Provision Anyway")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("handleExecuteFolderProvision")
        .setParameters({ folderId: folderId })));

    sec.addWidget(CardService.newTextButton()
      .setText("Cancel / Choose Shared Folder")
      .setOnClickAction(CardService.newAction().setFunctionName("onAddonHomepage")));

    return card.addSection(sec).build();
  }

  return handleExecuteFolderProvision({ parameters: { folderId: folderId } });
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
  
  const env = PropertiesService.getScriptProperties().getProperty("BZQ_ENV") || "PROD";
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
 * Renders the scrollable list of registered spreadsheets.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Registered spreadsheets list card.
 */
function handleShowBzqSheets(e) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Managed Sheets"));
  
  const configId = SpreadsheetRegistry.resolveConfigId();
  const ss = SpreadsheetApp.openById(configId);
  const registrySheet = ss.getSheetByName("__Spreadsheets");
  
  const section = CardService.newCardSection();
  
  if (!registrySheet || registrySheet.getLastRow() < 2) {
    section.addWidget(CardService.newTextParagraph().setText("No spreadsheets registered."));
    return card.addSection(section).build();
  }

  // Load Grouped configurations using our record logic
  const spreadsheets = registrySheet.getRange(2, 1, registrySheet.getLastRow() - 1, registrySheet.getLastColumn()).getValues();
  const objectsSheet = ss.getSheetByName("__ObjectConfiguration");
  const objectsData = objectsSheet ? objectsSheet.getRange(2, 1, objectsSheet.getLastRow() - 1, objectsSheet.getLastColumn()).getValues() : [];

  spreadsheets.forEach(row => {
    const name = row[0];
    const id = row[1];
    
    // 1. Resolve objects configured in this spreadsheet
    const objects = objectsData
      .filter(obj => obj[3] === id) // Spreadsheet ID index mapping
      .map(obj => obj[0]) // Object name index mapping
      .join(", ");

    // 2. Resolve Drive breadcrumb folder path
    const folderPath = SpreadsheetRegistry.getFolderPath(id);

    section.addWidget(CardService.newKeyValue()
      .setTopLabel(name)
      .setContent(`Contains: ${objects || "None"}`)
      .setBottomLabel(`Drive location: ${folderPath}`)
      .setOnClickAction(CardService.newAction()
        .setFunctionName("handleOpenSheetView")
        .setParameters({ sheetId: id })));
  });

  return card.addSection(section).build();
}

/**
 * Renders the entry forms list for a specific spreadsheet.
 * @param {string} configId - Central config spreadsheet ID.
 * @param {string} spreadsheetId - Spreadsheet ID to filter.
 * @returns {CardService.Card} Entry forms list card.
 */
function buildSheetEntryFormsCard(configId, spreadsheetId) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Entry Forms"));
  const section = CardService.newCardSection().setHeader("Available Objects in Workbook");

  const ss = SpreadsheetApp.openById(configId);
  const objectsSheet = ss.getSheetByName("__ObjectConfiguration");
  if (!objectsSheet) {
    section.addWidget(CardService.newTextParagraph().setText("No object configurations resolved."));
    return card.addSection(section).build();
  }

  const objectsData = objectsSheet.getRange(2, 1, objectsSheet.getLastRow() - 1, objectsSheet.getLastColumn()).getValues();
  const filteredObjects = objectsData.filter(obj => obj[3] === spreadsheetId);

  if (filteredObjects.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("No objects configured for this spreadsheet."));
  } else {
    filteredObjects.forEach(obj => {
      const objName = obj[0];
      const desc = obj[1] || "No description provided.";
      section.addWidget(CardService.newKeyValue()
        .setTopLabel("Object Form")
        .setContent(objName)
        .setBottomLabel(desc)
        .setOnClickAction(CardService.newAction()
          .setFunctionName("handleOpenObjectForm")
          .setParameters({ objectName: objName })));
    });
  }

  return card.addSection(section).build();
}

/**
 * Displays a fallback card when opening an unmanaged spreadsheet.
 * @param {string} spreadsheetId - Unmanaged spreadsheet ID.
 * @returns {CardService.Card} Warning Card UI.
 */
function buildUnmanagedSheetCard(spreadsheetId) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Unmanaged Sheet"));
  
  const sec = CardService.newCardSection()
    .setHeader("⚠️ Spreadsheet Registry Warning")
    .addWidget(CardService.newTextParagraph().setText(
      "This spreadsheet is not registered in the BZQ Platform database.\n\n" +
      "To enable BZQ forms and integrations on this sheet, open your Google Drive and register " +
      "this sheet in your BZQ Core Configuration registry."
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
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(`New ${name}`));
  
  const sec = CardService.newCardSection()
    .setHeader(`Form: ${name}`)
    .addWidget(CardService.newTextParagraph().setText("Record creation fields will render here."));

  return card.addSection(sec).build();
}

/**
 * Action Callback to open the entry forms list for a specific spreadsheet.
 * @param {Object} e - Event parameters containing sheetId.
 * @returns {CardService.Card} Entry forms list Card UI object.
 */
function handleOpenSheetView(e) {
  const id = e.parameters.sheetId;
  return buildSheetEntryFormsCard(SpreadsheetRegistry.resolveConfigId(), id);
}

/**
 * Action Callback to show all globally configured entry forms.
 * @param {Object} e - Event parameters.
 * @returns {CardService.Card} Entry forms list Card UI object.
 */
function handleShowAllEntryForms(e) {
  return buildSheetEntryFormsCard(SpreadsheetRegistry.resolveConfigId(), "");
}
