import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const stripWrappingQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const parseEnvFile = (filePath: string) => {
  const contents = readFileSync(filePath, 'utf8');

  contents.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }

    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    process.env[key] = stripWrappingQuotes(rawValue);
  });
};

export const loadServerEnv = () => {
  const rootDir = process.cwd();
  const envFiles = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ];

  envFiles.forEach((fileName) => {
    const filePath = path.join(rootDir, fileName);
    if (existsSync(filePath)) {
      parseEnvFile(filePath);
    }
  });
};
