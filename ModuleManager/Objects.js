/**
 * Returns the object metadata schema and unique stable IDs for the ModuleManager module.
 */
function getObjects_ModuleManager() {
  return [
    { Name: "Module", StableId: 3000, Datasheet: "Modules" },
    { Name: "ModuleDependency", StableId: 3001, Datasheet: "Module Dependencies" }
  ];
}
