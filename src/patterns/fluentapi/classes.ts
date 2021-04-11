import ts from "typescript"
import fs from "fs"
import { CompilerOptions } from "typescript"
import glob from "glob"
import path from "path"
import { TechnicalError } from "../../common/error/errors"
import { Checkable } from "../../common/fluentapi/checkable"
import { Violation } from "../../common/assertion/violation"
import { guessLocationOfTsconfig } from "../../common/typescript/guessLocationOfTsconfig"

// TODO Remove duplication
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

// export async function extractGraph(configFileName?: string): Promise<Edge[]> {
// 	const there = graphCache.get(configFileName)
// 	if (there !== undefined) {
// 		return there
// 	} else {
// 		const computedResult = extractGraphUncached(configFileName)
// 		graphCache.set(configFileName, computedResult)
// 		return await computedResult
// 	}
// }

// TODO - distinguish between different import kinds (types, function etc.)
export async function extractClassesUncached(
	configFile: string | undefined = guessLocationOfTsconfig()
): Promise<ts.ClassDeclaration[]> {
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

	const sourceFiles = program
		.getSourceFiles()
		.filter((file) => !file.fileName.includes(`${path.sep}node_modules${path.sep}`))

	return sourceFiles.flatMap((sourceFile) =>
		sourceFile
			.getChildren()
			.filter((x) => x.parent && ts.isSourceFile(x.parent))
			.flatMap((x) => (x.parent as ts.SourceFile).statements)
			.filter(ts.isClassDeclaration)
			.map((classDeclaration) => {
				return classDeclaration
			})
	)
}

const extractClasses = extractClassesUncached

class ClassesConditionBuilder {
	constructor(readonly configFilePath?: string) {}
	endingWith(pattern: string) {
		return new ClassesEndingWithCondition(this, pattern)
	}
}

class ClassesEndingWithCondition {
	constructor(
		readonly classesConditionBuilder: ClassesConditionBuilder,
		readonly pattern: string
	) {}

	canOnlyDependOn() {
		return new CanAccessCondition(this)
	}

	appliesTo(c: ts.ClassDeclaration): boolean {
		return c.name?.escapedText.toString().endsWith(this.pattern) === true
	}
}

class CanAccessCondition {
	constructor(readonly classesShouldCondition: ClassesEndingWithCondition) {}
	classes() {
		return new CanAccessClassesCondition(this)
	}
}

class CanAccessClassesCondition {
	constructor(readonly canAccessConditionBuilder: CanAccessCondition) {}
	endingWith(...pattern: string[]) {
		return new CanAccessClassesCheck(this, pattern)
	}
}

function defined<T>(t: T | undefined): t is T {
	return t !== undefined
}

class CanAccessClassesCheck implements Checkable {
	constructor(readonly condition: CanAccessClassesCondition, readonly patterns: string[]) {}

	private violations(c: ts.ClassDeclaration): ViolatingPattern[] {
		const dependenciesNotEndingWithPattern = c.members
			.filter(ts.isConstructorDeclaration)
			.flatMap((constr) => constr.parameters.map((p) => p.type))
			.filter(defined)
			.filter(ts.isTypeReferenceNode)
			.map((type) => type.typeName)
			.filter(ts.isIdentifier)
			.filter((typeName) =>
				this.patterns.every((pattern) => !typeName.escapedText.toString().endsWith(pattern))
			)
			.map(
				(violatedDependencyTypeName) =>
					new ViolatingPattern(
						c.name?.escapedText.toString() ?? "Unnamed class",
						violatedDependencyTypeName.escapedText.toString()
					)
			)
		return dependenciesNotEndingWithPattern
	}

	async check(): Promise<ViolatingPattern[]> {
		const allClasses = await extractClasses(
			this.condition.canAccessConditionBuilder.classesShouldCondition.classesConditionBuilder
				.configFilePath
		)
		const violations = allClasses
			.filter((c) => this.condition.canAccessConditionBuilder.classesShouldCondition.appliesTo(c))
			.flatMap((c) => this.violations(c))
		return violations
	}
}

export function classes(configFilePath?: string) {
	return new ClassesConditionBuilder(configFilePath)
}

export class ViolatingPattern extends Error implements Violation {
	constructor(readonly classNamed: string, readonly hasForbiddenDependency: string) {
		super()
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
