import { normalizeStatus, normalizePriority } from "../util/normalize";

describe("normalize", () => {
	describe("normalizeStatus", () => {
		describe("no/empty status (defaults by entity type)", () => {
			it("defaults to Pending for decision when undefined", () => {
				expect(normalizeStatus(undefined, "decision")).toBe("Pending");
			});
			it("defaults to Draft for document when undefined", () => {
				expect(normalizeStatus(undefined, "document")).toBe("Draft");
			});
			it("defaults to Not Started for other types when undefined", () => {
				expect(normalizeStatus(undefined, "task")).toBe("Not Started");
				expect(normalizeStatus(undefined)).toBe("Not Started");
			});
			it("treats empty string as falsy (defaults)", () => {
				expect(normalizeStatus("", "decision")).toBe("Pending");
				expect(normalizeStatus("", "document")).toBe("Draft");
				expect(normalizeStatus("")).toBe("Not Started");
			});
		});

		describe("decision entity", () => {
			it("returns exact allowed values as-is", () => {
				expect(normalizeStatus("Pending", "decision")).toBe("Pending");
				expect(normalizeStatus("Decided", "decision")).toBe("Decided");
				expect(normalizeStatus("Superseded", "decision")).toBe("Superseded");
			});
			it("maps pending/open variants", () => {
				expect(normalizeStatus("pending", "decision")).toBe("Pending");
				expect(normalizeStatus("open", "decision")).toBe("Pending");
				expect(normalizeStatus("OPEN", "decision")).toBe("Pending");
			});
			it("maps decided/approved/done variants", () => {
				expect(normalizeStatus("decided", "decision")).toBe("Decided");
				expect(normalizeStatus("approved", "decision")).toBe("Decided");
				expect(normalizeStatus("done", "decision")).toBe("Decided");
			});
			it("maps superseded/deprecated variants", () => {
				expect(normalizeStatus("superseded", "decision")).toBe("Superseded");
				expect(normalizeStatus("deprecated", "decision")).toBe("Superseded");
			});
			it("defaults unknown decision status to Pending", () => {
				expect(normalizeStatus("whatever", "decision")).toBe("Pending");
			});
			it("trims whitespace before matching", () => {
				expect(normalizeStatus("  decided  ", "decision")).toBe("Decided");
			});
		});

		describe("document entity", () => {
			it("returns exact allowed values as-is", () => {
				expect(normalizeStatus("Draft", "document")).toBe("Draft");
				expect(normalizeStatus("Review", "document")).toBe("Review");
				expect(normalizeStatus("Approved", "document")).toBe("Approved");
				expect(normalizeStatus("Superseded", "document")).toBe("Superseded");
			});
			it("maps draft variant", () => {
				expect(normalizeStatus("draft", "document")).toBe("Draft");
			});
			it("maps review/in review variants", () => {
				expect(normalizeStatus("review", "document")).toBe("Review");
				expect(normalizeStatus("in review", "document")).toBe("Review");
			});
			it("maps approved/done/published variants", () => {
				expect(normalizeStatus("approved", "document")).toBe("Approved");
				expect(normalizeStatus("done", "document")).toBe("Approved");
				expect(normalizeStatus("published", "document")).toBe("Approved");
			});
			it("maps superseded/deprecated/obsolete variants", () => {
				expect(normalizeStatus("superseded", "document")).toBe("Superseded");
				expect(normalizeStatus("deprecated", "document")).toBe("Superseded");
				expect(normalizeStatus("obsolete", "document")).toBe("Superseded");
			});
			it("defaults unknown document status to Draft", () => {
				expect(normalizeStatus("whatever", "document")).toBe("Draft");
			});
			it("trims whitespace before matching", () => {
				expect(normalizeStatus("  published  ", "document")).toBe("Approved");
			});
		});

		describe("standard task/milestone/story mapping", () => {
			it("maps todo/not started to Not Started", () => {
				expect(normalizeStatus("todo")).toBe("Not Started");
				expect(normalizeStatus("not started")).toBe("Not Started");
			});
			it("maps in_progress/in progress to In Progress", () => {
				expect(normalizeStatus("in_progress")).toBe("In Progress");
				expect(normalizeStatus("in progress")).toBe("In Progress");
			});
			it("maps done/completed to Completed", () => {
				expect(normalizeStatus("done")).toBe("Completed");
				expect(normalizeStatus("completed")).toBe("Completed");
			});
			it("maps blocked to Blocked", () => {
				expect(normalizeStatus("blocked")).toBe("Blocked");
			});
			it("is case-insensitive for mapped values", () => {
				expect(normalizeStatus("TODO")).toBe("Not Started");
				expect(normalizeStatus("In Progress")).toBe("In Progress");
				expect(normalizeStatus("DONE")).toBe("Completed");
			});
			it("returns already-valid ItemStatus values as-is", () => {
				expect(normalizeStatus("Not Started")).toBe("Not Started");
				expect(normalizeStatus("In Progress")).toBe("In Progress");
				expect(normalizeStatus("Completed")).toBe("Completed");
				expect(normalizeStatus("Blocked")).toBe("Blocked");
			});
			it("defaults unknown status to Not Started", () => {
				expect(normalizeStatus("garbage")).toBe("Not Started");
				expect(normalizeStatus("garbage", "task")).toBe("Not Started");
			});
			it("trims whitespace before matching", () => {
				expect(normalizeStatus("  done  ")).toBe("Completed");
			});
		});
	});

	describe("normalizePriority", () => {
		it("returns Medium when undefined/empty", () => {
			expect(normalizePriority(undefined)).toBe("Medium");
			expect(normalizePriority("")).toBe("Medium");
		});
		it("maps lowercase variants", () => {
			expect(normalizePriority("low")).toBe("Low");
			expect(normalizePriority("medium")).toBe("Medium");
			expect(normalizePriority("high")).toBe("High");
			expect(normalizePriority("critical")).toBe("Critical");
		});
		it("is case-insensitive", () => {
			expect(normalizePriority("LOW")).toBe("Low");
			expect(normalizePriority("High")).toBe("High");
			expect(normalizePriority("CRITICAL")).toBe("Critical");
		});
		it("returns already-valid ItemPriority values as-is", () => {
			expect(normalizePriority("Low")).toBe("Low");
			expect(normalizePriority("Medium")).toBe("Medium");
			expect(normalizePriority("High")).toBe("High");
			expect(normalizePriority("Critical")).toBe("Critical");
		});
		it("defaults unknown priority to Medium", () => {
			expect(normalizePriority("urgent")).toBe("Medium");
		});
		it("trims whitespace before matching", () => {
			expect(normalizePriority("  high  ")).toBe("High");
		});
	});
});
