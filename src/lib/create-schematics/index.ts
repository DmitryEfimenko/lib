import {
  chain,
  mergeWith,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
} from "@angular-devkit/schematics";
import { workspaces } from "@angular-devkit/core";
import { Schema } from "../schema";
import { Schema as CreateSchematicsSchema } from "./schema";
import { installSchematicsDependencies } from "./add-dependencies";
import {
  createHost,
  getLibPath,
  splitScopeFromName,
} from "../../utils/helpers";
import { getPrompts } from "./prompts";
import { copyFiles } from "./copy-files";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks";
import { getJSON, setJSON } from "../../utils/files";

export function createSchematicsWithLib(
  options: Schema,
  scopeWithName: string
): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    installSchematicsDependencies(tree);

    let importModule: boolean, importStatement: string, packages: string[];

    if (options.skipPrompts) {
      ({ importModule, importStatement, packages } = options);
    } else {
      ({ importModule, importStatement, packages } = await getPrompts(options));
    }

    const host = createHost(tree);
    const { workspace } = await workspaces.readWorkspace("/", host);

    const project = workspace.projects.get(scopeWithName);
    if (!project) {
      throw new SchematicsException(`Invalid project name: ${scopeWithName}`);
    }

    context.logger.info("⌛ Generating Schematic Files...");
    const templateSource = copyFiles(
      importModule,
      options,
      importStatement,
      scopeWithName,
      packages,
      tree,
      project
    );
    return chain([mergeWith(templateSource)]);
  };
}

export function createSchematics(options: CreateSchematicsSchema): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    options = splitScopeFromName(options);
    const scopeWithName = options.scope
      ? `${options.scope}/${options.name}`
      : options.name;
    const onlySchematics = true;
    const isNx = tree.exists("/nx.json");
    const libPath = getLibPath(scopeWithName, isNx);

    installSchematicsDependencies(tree, onlySchematics);

    let importModule: boolean, importStatement: string, packages: string[];

    if (options.skipPrompts) {
      ({ importModule, importStatement, packages } = options);
    } else {
      ({ importModule, importStatement, packages } = await getPrompts(options));
    }

    const host = createHost(tree);
    const { workspace } = await workspaces.readWorkspace("/", host);

    const project = workspace.projects.get(scopeWithName);
    if (!project) {
      throw new SchematicsException(`Invalid project name: ${scopeWithName}`);
    }

    context.logger.info("⌛ Generating Schematic Files...");
    const templateSource = copyFiles(
      importModule,
      options,
      importStatement,
      scopeWithName,
      packages,
      tree,
      project,
      onlySchematics
    );

    updateLibPackage(scopeWithName, tree, libPath);

    context.addTask(new NodePackageInstallTask());

    return chain([mergeWith(templateSource)]);
  };
}
function updateLibPackage(scopeWithName: string, tree: Tree, libPath: string) {
  const packageJSONPath = `${libPath}/package.json`;

  if (tree.exists(packageJSONPath)) {
    const pkg = getJSON(tree, packageJSONPath) as Record<string, any>;
    const libDistPath = scopeWithName.replace("@", "");
    const depthFromRootLib =
      "../" +
      scopeWithName
        .split("/")
        .map(() => "..")
        .join("/");
    setJSON(tree, packageJSONPath, {
      ...pkg,
      schematics: "./schematics/collection.json",
      scripts: {
        prebuild: "npm run test:schematics",
        build: "tsc -p tsconfig.schematics.json",
        "copy:schemas": `cpx schematics/ng-add ../${depthFromRootLib}/dist/${libDistPath}/`,
        "copy:collection": `cpx schematics/collection.json ../${depthFromRootLib}/dist/${libDistPath}/schematics/`,
        postbuild: "npm run copy:schemas && npm run copy:collection",
      },
    });
  }
}
