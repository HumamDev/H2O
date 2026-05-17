const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Phase 6C-3 (2026-05-17): folder moved from apps/studio-mobile/ to
// apps/studio/mobile/, adding one extra nesting level. workspaceRoot
// depth adjusted from '../..' (2 levels) to '../../..' (3 levels) so it
// still resolves to the repo root and Metro continues to find hoisted
// workspace dependencies + watch the entire monorepo.
const workspaceRoot = path.resolve(projectRoot, '../../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules/expo/node_modules'),
  path.resolve(projectRoot, 'node_modules/react-native/node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
