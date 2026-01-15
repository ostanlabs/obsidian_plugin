import { generateId, findHighestId } from "../util/idGenerator";
import { DEFAULT_SETTINGS } from "../types";

// Mock Obsidian App
const mockApp: any = {
	vault: {
		getMarkdownFiles: jest.fn(() => []),
	},
	metadataCache: {
		getFileCache: jest.fn(() => null),
	},
};

describe("ID Generator", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("generateId", () => {
		it("should generate T-001 for first task", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "task");
			expect(id).toBe("T-001");
		});

		it("should generate M-001 for first milestone", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "milestone");
			expect(id).toBe("M-001");
		});

		it("should generate S-001 for first story", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "story");
			expect(id).toBe("S-001");
		});

		it("should generate DEC-001 for first decision", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "decision");
			expect(id).toBe("DEC-001");
		});

		it("should generate DOC-001 for first document", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "document");
			expect(id).toBe("DOC-001");
		});

		it("should increment from existing IDs", async () => {
			const mockFiles = [{ path: "test1.md" }, { path: "test2.md" }];
			mockApp.vault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockApp.metadataCache.getFileCache
				.mockReturnValueOnce({ frontmatter: { id: "T-001" } })
				.mockReturnValueOnce({ frontmatter: { id: "T-005" } });

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "task");
			expect(id).toBe("T-006");
		});

		it("should handle custom zero-padding", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const customSettings = {
				...DEFAULT_SETTINGS,
				idZeroPadLength: 5,
			};

			const id = await generateId(mockApp, customSettings, "task");
			expect(id).toBe("T-00001");
		});
	});

	describe("findHighestId", () => {
		it("should return 0 when no files exist", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const maxId = await findHighestId(mockApp, "T-");
			expect(maxId).toBe(0);
		});

		it("should find highest ID", async () => {
			const mockFiles = [
				{ path: "test1.md" },
				{ path: "test2.md" },
				{ path: "test3.md" },
			];
			mockApp.vault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockApp.metadataCache.getFileCache
				.mockReturnValueOnce({ frontmatter: { id: "T-001" } })
				.mockReturnValueOnce({ frontmatter: { id: "T-010" } })
				.mockReturnValueOnce({ frontmatter: { id: "T-005" } });

			const maxId = await findHighestId(mockApp, "T-");
			expect(maxId).toBe(10);
		});
	});
});

