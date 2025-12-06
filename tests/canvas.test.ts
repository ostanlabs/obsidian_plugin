import {
	convertTextNodeToFile,
	createNode,
	findNodeById,
	generateNodeId,
} from "../util/canvas";
import { CanvasData, CanvasNode } from "../util/canvas";

describe("Canvas", () => {
	describe("findNodeById", () => {
		it("should find a node by ID", () => {
			const data: CanvasData = {
				nodes: [
					{ id: "node1", type: "text", x: 0, y: 0, width: 100, height: 50 },
					{ id: "node2", type: "file", x: 100, y: 100, width: 100, height: 50 },
				],
				edges: [],
			};

			const node = findNodeById(data, "node2");
			expect(node).toBeDefined();
			expect(node?.type).toBe("file");
		});

		it("should return undefined for non-existent node", () => {
			const data: CanvasData = {
				nodes: [],
				edges: [],
			};

			const node = findNodeById(data, "missing");
			expect(node).toBeUndefined();
		});
	});

	describe("convertTextNodeToFile", () => {
		it("should convert text node to file node", () => {
			const textNode: CanvasNode = {
				id: "node1",
				type: "text",
				x: 0,
				y: 0,
				width: 100,
				height: 50,
				text: "Some text",
			};

			const fileNode = convertTextNodeToFile(textNode, "path/to/file.md");

			expect(fileNode.type).toBe("file");
			expect(fileNode.file).toBe("path/to/file.md");
			expect(fileNode.text).toBeUndefined();
			expect(fileNode.id).toBe("node1");
		});

		it("should throw error for non-text node", () => {
			const fileNode: CanvasNode = {
				id: "node1",
				type: "file",
				x: 0,
				y: 0,
				width: 100,
				height: 50,
				file: "existing.md",
			};

			expect(() => convertTextNodeToFile(fileNode, "new.md")).toThrow();
		});
	});

	describe("createNode", () => {
		it("should create a text node", () => {
			const node = createNode("text", 100, 200, 250, 60, { text: "Test" });

			expect(node.type).toBe("text");
			expect(node.x).toBe(100);
			expect(node.y).toBe(200);
			expect(node.width).toBe(250);
			expect(node.height).toBe(60);
			expect(node.text).toBe("Test");
			expect(node.id).toBeDefined();
		});

		it("should create a file node", () => {
			const node = createNode("file", 0, 0, 250, 60, { file: "test.md" });

			expect(node.type).toBe("file");
			expect(node.file).toBe("test.md");
			expect(node.id).toBeDefined();
		});

		it("should generate unique IDs", () => {
			const node1 = createNode("text", 0, 0);
			const node2 = createNode("text", 0, 0);

			expect(node1.id).not.toBe(node2.id);
		});
	});
});

