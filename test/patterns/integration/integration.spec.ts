import { classes, ViolatingPattern } from "../../../src/patterns/fluentapi/classes"

describe("patterns", () => {
	describe("classes", async () => {
		it("a class depending on a not allowed dependency violates the rule", async () => {
			const violations = await classes(
				__dirname + "/samples/classesdependingonaforbiddenclass/tsconfig.json"
			)
				.endingWith("Repository")
				.canOnlyDependOn()
				.classes()
				.endingWith("Builder")
				.check()
			expect(violations).toEqual([new ViolatingPattern("SomeRepository", "SomeController")])
		})

		it("a class depending on an allowed dependency does not violate the rule", async () => {
			const violations = await classes(
				__dirname + "/samples/classesdependingonanallowedclass/tsconfig.json"
			)
				.endingWith("Repository")
				.canOnlyDependOn()
				.classes()
				.endingWith("Builder")
				.check()
			expect(violations).toEqual([])
		})

		it("a class without dependencies does not violate the rule", async () => {
			const violations = await classes(
				__dirname + "/samples/classeswithoutdependencies/tsconfig.json"
			)
				.endingWith("Repository")
				.canOnlyDependOn()
				.classes()
				.endingWith("Builder")
				.check()
			expect(violations).toEqual([])
		})

		it("a class without rules does not violate other rules", async () => {
			const violations = await classes(__dirname + "/samples/classesnotdescribed/tsconfig.json")
				.endingWith("Repository")
				.canOnlyDependOn()
				.classes()
				.endingWith("Builder")
				.check()
			expect(violations).toEqual([])
		})
	})
})
