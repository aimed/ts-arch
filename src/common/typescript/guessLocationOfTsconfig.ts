import fs from "fs"
import path from "path"

// TODO write exception code free everywhere

export function guessLocationOfTsconfig(): string | undefined {
	return guessLocationOfTsconfigRecursively(".")
}

function guessLocationOfTsconfigRecursively(pathName: string): string | undefined {
	const dir = fs.readdirSync(pathName)
	for (const fileName of dir) {
		if (path.basename(fileName) === "tsconfig.json") {
			return path.resolve(pathName, "tsconfig.json")
		}
	}
	const levelUp = path.resolve(pathName, "..")
	if (path.relative(levelUp, pathName) === pathName) {
		return undefined
	} else {
		return guessLocationOfTsconfigRecursively(levelUp)
	}
}
