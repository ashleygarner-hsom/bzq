/**
 * Returns the object metadata schema and unique stable IDs for the AppsUtilities module.
 */
function getObjects_AppsUtilities() {
  return [
    { Name: "Sequence", StableId: 1000, Datasheet: "SequenceConfiguration" },
    { Name: "Object", StableId: 1001, Datasheet: "ObjectConfiguration" },
    { Name: "Lookup", StableId: 1002, Datasheet: "LookupConfiguration" },
    { Name: "Dropdown", StableId: 1003, Datasheet: "DropdownConfiguration" },
    { Name: "GlobalDropdown", StableId: 1004, Datasheet: "GlobalDropdownConfiguration" },
    { Name: "Spreadsheet", StableId: 1005, Datasheet: "Spreadsheets" },
    { Name: "ConfigurationProperty", StableId: 1006, Datasheet: "ConfigurationProperties" }
  ];
}
