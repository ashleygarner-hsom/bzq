/**
 * Returns the object metadata schema and unique stable IDs for the FormsEngine module.
 * @returns {Array<Object>} List of object metadata definitions.
 */
function getObjects_FormsEngine() {
  return [
    getObject_FormsEngine_2000_()
  ];
}

/**
 * Returns metadata schema for Form (FormsEngine.2000).
 * @private
 * @returns {Object}
 */
function getObject_FormsEngine_2000_() {
  return {
    Name: "Form",
    StableId: 2000,
    FullStableId: "FormsEngine.2000",
    Datasheet: "Forms",
    Description: "Defines dynamic HTML form layouts, field mappings, and submission validation rules.",
    PrimaryFields: ["Form Name"],
    IdFieldName: "Form Number",
    Sequence: { Prefix: "xFM-", StartingNumber: 1000, Format: "000#" },
    Indexes: ["Form Name", "Object Name"],
    Fields: {
      "Form": { type: "AUTOID", description: "Computed display form key", validation: null },
      "Form Name": { type: "TEXT", description: "Unique name of the form definition", validation: "REQUIRED" },
      "Object Name": { type: "LOOKUP", description: "Target business object", references: "AppsUtilities.1001" },
      "Enabled": { type: "DROPDOWN", description: "Form active status (Yes/No)", validation: "DROPDOWN:Form Enabled" }
    }
  };
}
