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
		it("should generate T001 for first task", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "task");
			expect(id).toBe("T001");
		});

		it("should generate A001 for first accomplishment", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "accomplishment");
			expect(id).toBe("A001");
		});

		it("should increment from existing IDs", async () => {
			const mockFiles = [{ path: "test1.md" }, { path: "test2.md" }];
			mockApp.vault.getMarkdownFiles.mockReturnValue(mockFiles);
			mockApp.metadataCache.getFileCache
				.mockReturnValueOnce({ frontmatter: { id: "T001" } })
				.mockReturnValueOnce({ frontmatter: { id: "T005" } });

			const id = await generateId(mockApp, DEFAULT_SETTINGS, "task");
			expect(id).toBe("T006");
		});

		it("should handle custom prefix", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const customSettings = {
				...DEFAULT_SETTINGS,
				idPrefixTask: "TASK",
			};

			const id = await generateId(mockApp, customSettings, "task");
			expect(id).toBe("TASK001");
		});

		it("should handle custom zero-padding", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const customSettings = {
				...DEFAULT_SETTINGS,
				idZeroPadLength: 5,
			};

			const id = await generateId(mockApp, customSettings, "task");
			expect(id).toBe("T00001");
		});
	});

	describe("findHighestId", () => {
		it("should return 0 when no files exist", async () => {
			mockApp.vault.getMarkdownFiles.mockReturnValue([]);

			const maxId = await findHighestId(mockApp, "T");
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
				.mockReturnValueOnce({ frontmatter: { id: "T001" } })
				.mockReturnValueOnce({ frontmatter: { id: "T010" } })
				.mockReturnValueOnce({ frontmatter: { id: "T005" } });

			const maxId = await findHighestId(mockApp, "T");
			expect(maxId).toBe(10);
		});
	});
});

