import { resolve } from 'node:path';
import { writeFileSync, cpSync, readFileSync } from 'node:fs';
import { defineConfig, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { externalizeDeps } from 'vite-plugin-externalize-deps';
import { terser } from 'rollup-plugin-terser';

export default defineConfig({
  base: './',
  plugins: [
    externalizeDeps(),
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
      outDir: 'dist/core',
      strictOutput: true,
      beforeWriteFile: (filePath, content) => {
        const replacedContent = removePrivateMembers(content);
        return {
          filePath,
          content: replacedContent,
        };
      },
    }),
    afterBuildPlugin(),
  ],
  build: {
    target: 'es2022',
    outDir: 'dist/core',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      plugins: [terser({ compress: true, module: true })],
    },
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
  },
} satisfies UserConfig);

function afterBuildPlugin() {
  const processPackageJson = () => {
    let packageJson = JSON.parse(
      readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
    );

    const { dependencies } = packageJson;

    delete packageJson.dependencies;
    delete packageJson.devDependencies;
    delete packageJson.scripts;

    packageJson = Object.assign(packageJson, {
      main: './index.js',
      module: './index.js',
      files: ['index.js'],
      exports: {
        '.': {
          import: './index.js',
        },
      },
      dependencies,
    });

    writeFileSync(
      resolve(__dirname, 'dist', 'core', 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  };

  const processTypes = () => {
    // Copy types folder to dist
    cpSync(resolve(__dirname, 'types'), resolve(__dirname, 'dist', 'types'), {
      recursive: true,
    });

    // Read core package version
    const corePackageJson = JSON.parse(
      readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
    );
    const coreVersion = corePackageJson.version;

    // Update types package.json version
    const typesPackageJsonPath = resolve(
      __dirname,
      'dist',
      'types',
      'package.json'
    );
    const typesPackageJson = JSON.parse(
      readFileSync(typesPackageJsonPath, 'utf-8')
    );
    typesPackageJson.version = coreVersion;

    writeFileSync(
      typesPackageJsonPath,
      JSON.stringify(typesPackageJson, null, 2)
    );
  };

  return {
    name: 'after-build',
    buildStart() {},
    buildEnd() {},
    closeBundle() {
      processPackageJson();
      processTypes();
    },
  };
}

function removePrivateMembers(content) {
  const result = [];
  content.split('\n').forEach(str => {
    const isPrivate = str.includes('private ');
    if (!isPrivate) {
      result.push(str);
    }
  });
  return result.join('\n');
}
