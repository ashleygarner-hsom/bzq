/**
 * Returns the object metadata schema and unique stable IDs for the AppsUtilities module.
 * @returns {Array<Object>} List of object metadata definitions.
 */
function getObjects_AppsUtilities() {
  return [
    getObject_AppsUtilities_1000_(),
    getObject_AppsUtilities_1001_(),
    getObject_AppsUtilities_1002_(),
    getObject_AppsUtilities_1003_(),
    getObject_AppsUtilities_1004_(),
    getObject_AppsUtilities_1005_(),
    getObject_AppsUtilities_1006_()
  ];
}

/**
 * Returns metadata schema for Sequence (AppsUtilities.1000).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1000_() {
  return {
    Name: "Sequence",
    StableId: 1000,
    FullStableId: "AppsUtilities.1000",
    Datasheet: "SequenceConfiguration",
    Description: "Defines auto-incrementing document numbering rules, prefixes, and formatting.",
    PrimaryFields: ["Sequence Name"],
    IdFieldName: "Sequence Number",
    Sequence: { Prefix: "xSC-", StartingNumber: 10000, Format: "0000#" },
    Indexes: ["Sequence Name", "Datasheet Name"],
    Fields: {
      "Sequence": { type: "AUTOID", description: "Computed display sequence key", validation: null },
      "Sequence Name": { type: "TEXT", description: "Human-readable identifier for sequence", validation: "REQUIRED" },
      "Datasheet Name": { type: "TEXT", description: "Target datasheet name", validation: "REQUIRED" },
      "Sequence Prefix": { type: "TEXT", description: "Prefix prepended to sequence number", validation: null },
      "Starting Number": { type: "NUMBER", description: "Initial sequence counter value", validation: "MIN:1" },
      "Format": { type: "TEXT", description: "Text formatting pattern e.g. 0000#", validation: null },
      "Current Value": { type: "NUMBER", description: "Latest assigned sequence number", validation: null },
      "Enabled": { type: "BOOLEAN", description: "Whether sequence generation is active", validation: null }
    }
  };
}

/**
 * Returns metadata schema for Object (AppsUtilities.1001).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1001_() {
  return {
    Name: "Object",
    StableId: 1001,
    FullStableId: "AppsUtilities.1001",
    Datasheet: "ObjectConfiguration",
    Description: "Central registry of business objects, worksheets, and validation bindings.",
    PrimaryFields: ["Object Name"],
    IdFieldName: "Object Number",
    Sequence: { Prefix: "xOC-", StartingNumber: 1000, Format: "000#" },
    Indexes: ["Object Name", "Datasheet", "Spreadsheet"],
    Fields: {
      "Object": { type: "AUTOID", description: "Computed display object key", validation: null },
      "Object Name": { type: "TEXT", description: "Unique object identifier name", validation: "REQUIRED" },
      "Datasheet": { type: "TEXT", description: "Target worksheet name", validation: "REQUIRED" },
      "Enabled For Validation": { type: "BOOLEAN", description: "Enables row edit validation", validation: null },
      "Spreadsheet": { type: "LOOKUP", description: "Target spreadsheet record reference", references: "AppsUtilities.1005" },
      "Spreadsheet Id": { type: "TEXT", description: "Extracted Google Sheets ID", validation: null },
      "Spreadsheet Url": { type: "TEXT", description: "Web view URL for the spreadsheet", validation: null },
      "Primary Fields": { type: "TEXT", description: "Primary descriptor column(s)", validation: "REQUIRED" },
      "Id Field Name": { type: "TEXT", description: "Unique auto-number ID column name", validation: "REQUIRED" },
      "Header Number": { type: "NUMBER", description: "Row number where headers reside", validation: "DEFAULT:1" },
      "Sequence": { type: "LOOKUP", description: "Associated sequence rule", references: "AppsUtilities.1000" },
      "Custom Line Trigger": { type: "TEXT", description: "Custom hook callback name", validation: null }
    }
  };
}

/**
 * Returns metadata schema for Lookup (AppsUtilities.1002).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1002_() {
  return {
    Name: "Lookup",
    StableId: 1002,
    FullStableId: "AppsUtilities.1002",
    Datasheet: "LookupConfiguration",
    Description: "Defines foreign key relational bindings and dynamic lookup helper sheet rules.",
    PrimaryFields: ["Lookup Name"],
    IdFieldName: "Lookup Number",
    Sequence: { Prefix: "xLC-", StartingNumber: 10000, Format: "0000#" },
    Indexes: ["Source Object", "Target Object", "Column Name"],
    Fields: {
      "Lookup": { type: "AUTOID", description: "Computed display lookup key", validation: null },
      "Lookup Name": { type: "TEXT", description: "Descriptive lookup binding name", validation: null },
      "Source Object": { type: "LOOKUP", description: "Source object being validated", references: "AppsUtilities.1001" },
      "Target Object": { type: "LOOKUP", description: "Foreign object providing values", references: "AppsUtilities.1001" },
      "Column Name": { type: "TEXT", description: "Column on source object receiving lookup", validation: "REQUIRED" }
    }
  };
}

/**
 * Returns metadata schema for Dropdown (AppsUtilities.1003).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1003_() {
  return {
    Name: "Dropdown",
    StableId: 1003,
    FullStableId: "AppsUtilities.1003",
    Datasheet: "DropdownConfiguration",
    Description: "Defines static dropdown value sets scoped to specific business objects.",
    PrimaryFields: ["Dropdown Name"],
    IdFieldName: "Dropdown Number",
    Sequence: { Prefix: "xDC-", StartingNumber: 10000, Format: "0000#" },
    Indexes: ["Dropdown Name", "Object"],
    Fields: {
      "Dropdown": { type: "AUTOID", description: "Computed display dropdown key", validation: null },
      "Dropdown Name": { type: "TEXT", description: "Target column or dropdown label", validation: "REQUIRED" },
      "Object": { type: "LOOKUP", description: "Scoped business object reference", references: "AppsUtilities.1001" },
      "Values": { type: "TEXT", description: "Comma-separated list of permitted values", validation: "REQUIRED" }
    }
  };
}

/**
 * Returns metadata schema for GlobalDropdown (AppsUtilities.1004).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1004_() {
  return {
    Name: "GlobalDropdown",
    StableId: 1004,
    FullStableId: "AppsUtilities.1004",
    Datasheet: "GlobalDropdownConfiguration",
    Description: "Defines global dropdown value sets accessible system-wide across all worksheets.",
    PrimaryFields: ["Global Dropdown Name"],
    IdFieldName: "Global Dropdown Number",
    Sequence: { Prefix: "xGD-", StartingNumber: 10000, Format: "0000#" },
    Indexes: ["Global Dropdown Name"],
    Fields: {
      "Global Dropdown": { type: "AUTOID", description: "Computed display key", validation: null },
      "Global Dropdown Name": { type: "TEXT", description: "Global dropdown label", validation: "REQUIRED" },
      "Values": { type: "TEXT", description: "Comma-separated list of permitted values", validation: "REQUIRED" }
    }
  };
}

/**
 * Returns metadata schema for Spreadsheet (AppsUtilities.1005).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1005_() {
  return {
    Name: "Spreadsheet",
    StableId: 1005,
    FullStableId: "AppsUtilities.1005",
    Datasheet: "Spreadsheets",
    Description: "Maintains registry of physical Google Drive workbooks and container links.",
    PrimaryFields: ["Spreadsheet Name"],
    IdFieldName: "Spreadsheet Number",
    Sequence: { Prefix: "xSS-", StartingNumber: 1000, Format: "000#" },
    Indexes: ["Spreadsheet Name", "Spreadsheet Id"],
    Fields: {
      "Spreadsheet": { type: "AUTOID", description: "Computed display spreadsheet key", validation: null },
      "Spreadsheet Name": { type: "TEXT", description: "Display name of the spreadsheet", validation: "REQUIRED" },
      "Spreadsheet Id": { type: "TEXT", description: "Google Drive File ID", validation: "REQUIRED" },
      "Spreadsheet Url": { type: "TEXT", description: "Direct web view link", validation: null },
      "Folder Path": { type: "TEXT", description: "Relative Drive folder hierarchy path", validation: null },
      "Notes": { type: "TEXT", description: "Administrative comments or usage notes", validation: null }
    }
  };
}

/**
 * Returns metadata schema for ConfigurationProperty (AppsUtilities.1006).
 * @private
 * @returns {Object}
 */
function getObject_AppsUtilities_1006_() {
  return {
    Name: "ConfigurationProperty",
    StableId: 1006,
    FullStableId: "AppsUtilities.1006",
    Datasheet: "ConfigurationProperties",
    Description: "System key-value runtime configuration properties and feature toggles.",
    PrimaryFields: ["Configuration Key"],
    IdFieldName: "Property Number",
    Sequence: null,
    Indexes: ["Configuration Key"],
    Fields: {
      "Configuration Key": { type: "TEXT", description: "Unique configuration property key", validation: "REQUIRED" },
      "Value": { type: "TEXT", description: "Configured property value", validation: null },
      "Notes": { type: "TEXT", description: "Explanation of setting impact", validation: null }
    }
  };
}
