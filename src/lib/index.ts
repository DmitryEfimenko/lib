import {
  SchematicContext,
  Tree,
  chain,
  Rule,
  noop,
} from "@angular-devkit/schematics";
import { Observable } from "rxjs";
import { getLibPath, splitScopeFromName } from "../utils/helpers";

import { installDependencies } from "./add-dependencies";
import { addAngularCliGhPages } from "./add-ng-cli-ghpages";
import { addFiles } from "./add-root-files";
import { addSpectator } from "./add-spectator";
import { createLib } from "./create-lib";
import { createSchematicsWithLib } from "./create-schematics";
import { lintFix } from "./lint-fix";
import { Schema } from "./schema";
import { updatePackageJson } from "./update-package-json";

function rulify(obj: Tree | Observable<Tree> | Rule | null): Rule {
  const rule = (tree: Tree, context: SchematicContext) => {
    return typeof obj === "function" ? obj(tree, context) : obj;
  };
  return rule as Rule;
}

export function lib(options: Schema): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    if (tree.exists("README.md")) {
      tree.delete("README.md");
    }

    options = splitScopeFromName(options) as Schema;

    const scopeWithName = options.scope
      ? `${options.scope}/${options.name}`
      : options.name;
    const isNx = tree.exists("/nx.json");
    const libPath = getLibPath(scopeWithName, isNx);

    const updatePackageJsonRule = updatePackageJson(
      libPath,
      scopeWithName,
      options
    );

    const installDepsRule = installDependencies(options);

    const libRule = options.skipLib
      ? noop()
      : rulify(
          createLib(options, scopeWithName, libPath, tree, _context, isNx)
        );

    const addSpectatorRule = !(options.skipLib || options.skipSpectator)
      ? addSpectator(options, scopeWithName)
      : noop();

    const filesRule = addFiles(options, scopeWithName, tree);

    const schematicsRule = options.skipSchematics
      ? noop()
      : createSchematicsWithLib(options, scopeWithName);

    const angularCliGhPagesRule = options.skipAngularCliGhPages
      ? noop()
      : addAngularCliGhPages();

    const lintFixRule = lintFix(scopeWithName);

    return chain([
      libRule,
      filesRule,
      schematicsRule,
      updatePackageJsonRule,
      installDepsRule,
      addSpectatorRule,
      angularCliGhPagesRule,
      lintFixRule,
    ]);
  };
}
