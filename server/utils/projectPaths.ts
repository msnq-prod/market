import path from 'path';

export const projectRoot = process.cwd();

export const resolveProjectPath = (...segments: string[]) => path.join(projectRoot, ...segments);
