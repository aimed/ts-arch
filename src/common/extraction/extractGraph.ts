import ts from "typescript"
import fs from "fs"
import { CompilerOptions } from "typescript"
import glob from "glob"
import path from "path"
import { Edge } from "./graph"
import { TechnicalError } from "../error/errors"
import { normalizeWindowsPaths } from "../util/pathUtils"
import { ImportPathsResolver } from "@zerollup/ts-helpers"
import { guessLocationOfTsconfig } from "../typescript/guessLocationOfTsconfig"

async function guessProjectFiles(globPattern: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		glob(globPattern, (err, files: string[]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve(files)
		})
	})
}

const graphCache: Map<string | undefined, Promise<Edge[]>> = new Map()

export async function extractGraph(configFileName?: string): Promise<Edge[]> {
	const there = graphCache.get(configFileName)
	if (there !== undefined) {
		return there
	} else {
		const computedResult = extractGraphUncached(configFileName)
		graphCache.set(configFileName, computedResult)
		return await computedResult
	}
}

// TODO - distinguish between different import kinds (types, function etc.)
export async function extractGraphUncached(
	configFile: string | undefined = guessLocationOfTsconfig()
): Promise<Edge[]> {
	if (configFile === undefined) {
		throw new TechnicalError("Could not find configuration path")
	}
	const config = ts.readConfigFile(configFile, (path: string) => {
		return fs.readFileSync(path).toString()
	})

	if (config.error !== undefined) {
		throw new TechnicalError("invalid config path")
	}

	const parsedConfig: CompilerOptions = config.config

	const rootDir = path.dirname(path.resolve(configFile))

	// TODO: make configurable
	const globpattern = rootDir + "/**/*.{ts,tsx}"
	const files = await guessProjectFiles(globpattern)

	const host = ts.createCompilerHost(parsedConfig)

	const program = ts.createProgram({
		rootNames: files,
		options: parsedConfig,
		host
	})

	const imports: Edge[] = []

	// TODO currently the graph is made of imports as edges. Files that are not imported are not found in this graph.
	for (const sourceFile of program.getSourceFiles()) {
		ts.forEachChild(sourceFile, (x) => {
			if (ts.isImportDeclaration(x)) {
				const normalizedSourceFileName = path.relative(rootDir, sourceFile.fileName)

				const specifier = x.moduleSpecifier
				const module = (specifier as { text?: string })["text"]
				if (module === undefined) {
					return
				}
				const resolver = new ImportPathsResolver((parsedConfig as any).compilerOptions)

				const suggestion = resolver.getImportSuggestions(
					module,
					path.dirname(normalizedSourceFileName)
				)

				const bestGuess = suggestion !== undefined ? suggestion[0] : undefined

				// TODO use module resolution cache
				const resolvedModule = ts.resolveModuleName(
					bestGuess ?? module,
					sourceFile.fileName,
					parsedConfig,
					host
				).resolvedModule

				if (resolvedModule === undefined) {
					return
				}

				const { resolvedFileName, isExternalLibraryImport } = resolvedModule
				const normalizedTargetFileName = path.relative(rootDir, resolvedFileName)

				imports.push({
					source: normalizeWindowsPaths(normalizedSourceFileName),
					target: normalizeWindowsPaths(normalizedTargetFileName),
					external: isExternalLibraryImport ?? false
				})
			}
		})
	}

	return imports
}
