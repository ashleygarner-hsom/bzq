/**
 * Returns the object metadata schema and unique stable IDs for the ModuleManager module.
 * @returns {Array<Object>} List of object metadata definitions.
 */
function getObjects_ModuleManager() {
  return [
    getObject_ModuleManager_3000_(),
    getObject_ModuleManager_3001_()
  ];
}

/**
 * Returns metadata schema for Module (ModuleManager.3000).
 * @private
 * @returns {Object}
 */
function getObject_ModuleManager_3000_() {
  return {
    Name: "Module",
    StableId: 3000,
    FullStableId: "ModuleManager.3000",
    Datasheet: "Modules",
    Description: "Maintains registry of modular extensions, version descriptors, and lifecycle status.",
    PrimaryFields: ["Module Name"],
    IdFieldName: "Module Number",
    Sequence: { Prefix: "xMD-", StartingNumber: 1000, Format: "000#" },
    Indexes: ["Module Name"],
    Fields: {
      "Module": { type: "AUTOID", description: "Computed display module key", validation: null },
      "Module Name": { type: "TEXT", description: "Unique programmatic module identifier", validation: "REQUIRED" },
      "Display Name": { type: "TEXT", description: "User-facing title of the module", validation: "REQUIRED" },
      "Description": { type: "TEXT", description: "Functional summary of module scope", validation: null },
      "Enabled": { type: "BOOLEAN", description: "Module operational status", validation: null }
    }
  };
}

/**
 * Returns metadata schema for ModuleDependency (ModuleManager.3001).
 * @private
 * @returns {Object}
 */
function getObject_ModuleManager_3001_() {
  return {
    Name: "ModuleDependency",
    StableId: 3001,
    FullStableId: "ModuleManager.3001",
    Datasheet: "Module Dependencies",
    Description: "Defines directed dependency graphs and prerequisite requirements between modules.",
    PrimaryFields: ["Dependency Number"],
    IdFieldName: "Dependency Number",
    Sequence: { Prefix: "xDD-", StartingNumber: 10000, Format: "0000#" },
    Indexes: ["Dependent Module", "Prerequisite Module"],
    Fields: {
      "Dependent Module": {
        type: "LOOKUP",
        description: "Module declaring the requirement",
        references: "ModuleManager.3000"
      },
      "Prerequisite Module": {
        type: "LOOKUP",
        description: "Required upstream module",
        references: "ModuleManager.3000"
      }
    }
  };
}
