import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  repositoryRoot: string;
  clientDist: string;
  diceAssetsDirectory: string;
  dataDirectory: string;
  legacyData: string;
  legacyMaps: string;
  legacyPortraits: string;
  mapsDirectory: string;
  portraitsDirectory: string;
  vaultPath: string;
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  const repositoryRoot = path.resolve(cwd, '..');
  return {
    host: process.env.DICE_FORGE_HOST || '127.0.0.1',
    port: Number(process.env.DICE_FORGE_PORT || 5000),
    repositoryRoot,
    clientDist: path.resolve(cwd, 'dist/client'),
    diceAssetsDirectory: path.resolve(cwd, 'node_modules/@3d-dice/dice-box-threejs/public'),
    dataDirectory: path.resolve(cwd, 'data'),
    legacyData: path.resolve(repositoryRoot, 'Roll20/Webtracker/data'),
    legacyMaps: path.resolve(repositoryRoot, 'Roll20/Webtracker/app/static/maps'),
    legacyPortraits: path.resolve(repositoryRoot, 'Roll20/Webtracker/app/static/portraits'),
    mapsDirectory: path.resolve(cwd, 'data/maps'),
    portraitsDirectory: path.resolve(cwd, 'data/portraits'),
    vaultPath: process.env.DICE_FORGE_VAULT
      || 'D:\\kitha\\Documents\\JDR - BRP\\Obsidian_Ombre_de_la_Spirale',
  };
}
